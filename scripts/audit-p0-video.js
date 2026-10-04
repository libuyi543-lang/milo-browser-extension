/* Public YouTube playback audit: a selected track never counts as visible subtitles. */
const fs = require('fs')
const path = require('path')
const { chromium } = require(process.env.MILO_PLAYWRIGHT_MODULE || 'playwright')
const samples = require('../docs/p0-samples.json').video.filter(sample =>
  !process.env.MILO_P0_IDS || process.env.MILO_P0_IDS.split(',').includes(sample.id))

async function main() {
  const extension = path.resolve(__dirname, '../build/chrome')
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    channel: 'chromium',
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: 1360, height: 900 },
    ...(process.env.MILO_CHROMIUM_PATH
      ? { executablePath: process.env.MILO_CHROMIUM_PATH }
      : {}),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  })
  const results = []
  try {
    for (const sample of samples) {
      const page = await context.newPage()
      const captionResponses = []
      page.on('response', response => {
        if (/timedtext|caption/i.test(response.url()) && /youtube|googlevideo/.test(response.url()))
          response.body().then(body => {
            const url = new URL(response.url())
            captionResponses.push({ status: response.status(), bytes: body.length,
              host: url.hostname, path: url.pathname, lang: url.searchParams.get('lang'),
              tlang: url.searchParams.get('tlang'), kind: url.searchParams.get('kind') })
          }).catch(() => captionResponses.push({ status: response.status(), bytes: null }))
      })
      const result = { id: sample.id, candidate: sample.candidate, url: sample.url,
        buttonVisible: false, chineseSubtitleVisible: false, restored: false,
        trackKinds: [], status: 'not-run', detail: '' }
      try {
        const response = await page.goto(sample.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
        result.httpStatus = response ? response.status() : null
        await page.locator('#movie_player video').waitFor({ timeout: 14000 })
        result.trackKinds = await page.evaluate(() => {
          const tracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
          return tracks.map(item => ({ languageCode: item.languageCode, kind: item.kind || 'human' }))
        })
        const button = page.getByRole('button', { name: '开启字幕翻译', exact: true })
        result.buttonVisible = await button.waitFor({ state: 'visible', timeout: 7000 })
          .then(() => true, () => false)
        if (!result.buttonVisible) throw new Error('Milo subtitle button absent')
        const before = await page.locator('.ytp-subtitles-button').getAttribute('aria-pressed').catch(() => null)
        await button.click()
        await page.locator('#movie_player video').evaluate(video => {
          video.muted = true
          video.play().catch(() => undefined)
        })
        await page.waitForTimeout(9000)
        const state = await page.evaluate(() => {
          const cues = Array.from(document.querySelectorAll('#movie_player .ytp-caption-segment'))
          const video = document.querySelector('#movie_player video')
          return { text: cues.map(node => node.textContent || '').join(' ').trim(),
            visible: cues.some(node => {
              const style = getComputedStyle(node)
              return !!node.textContent.trim() && node.getBoundingClientRect().width > 0 &&
                style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
            }),
            status: document.querySelector('[data-milo-video-controls]')?.shadowRoot?.querySelector('.status')?.textContent || '',
            playback: video ? { currentTime: video.currentTime, readyState: video.readyState,
              paused: video.paused, error: video.error?.code || null } : null }
        })
        result.chineseSubtitleVisible = state.visible && /[\u3400-\u9fff]/.test(state.text)
        result.captionCharacters = state.text.length
        result.playerStatus = state.status
        result.playback = state.playback
        result.captionResponses = captionResponses
        if (process.env.MILO_P0_PROBE_TRACKS) {
          result.captionProbe = await page.evaluate(async () => {
            const tracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
            const chosen = ['en', 'zh-CN'].map(code => tracks.find(item => item.languageCode === code)).filter(Boolean)
            return Promise.all(chosen.map(async item => {
              try {
                const response = await fetch(item.baseUrl)
                return { languageCode: item.languageCode, status: response.status,
                  bytes: (await response.arrayBuffer()).byteLength }
              } catch (error) { return { languageCode: item.languageCode, error: error.message } }
            }))
          })
        }
        result.selectedTrack = await page.evaluate(() => {
          const player = document.getElementById('movie_player')
          const track = player?.getOption?.('captions', 'track')
          return track ? { languageCode: track.languageCode,
            translationLanguage: track.translationLanguage?.languageCode || null } : null
        })
        if (sample.id === 'V05') {
          await page.locator('#movie_player').hover()
          await page.locator('.ytp-fullscreen-button').click({ force: true })
          await page.waitForFunction(() => !!document.fullscreenElement &&
            document.querySelector('[data-milo-video-controls]')?.parentElement === document.fullscreenElement,
          null, { timeout: 4000 }).catch(() => undefined)
          result.fullscreenButtonVisible = await page.getByRole('button', {
            name: '关闭字幕翻译', exact: true
          }).isVisible().catch(() => false)
          result.fullscreenState = await page.evaluate(() => {
            const full = document.fullscreenElement
            const host = document.querySelector('[data-milo-video-controls]')
            const control = host?.shadowRoot?.querySelector('button')
            const rect = control?.getBoundingClientRect()
            return { tag: full?.tagName || null, parentMatches: !!full && host?.parentElement === full,
              hostDisplay: host ? getComputedStyle(host).display : null,
              controlRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null }
          })
          await page.evaluate(() => document.exitFullscreen())
        }
        await page.getByRole('button', { name: '关闭字幕翻译', exact: true }).click()
        await page.waitForTimeout(1200)
        const after = await page.locator('.ytp-subtitles-button').getAttribute('aria-pressed').catch(() => null)
        result.restored = before === after
        const noTracks = result.trackKinds.length === 0
        result.status = result.buttonVisible && result.restored &&
          (noTracks ? /没有读取到.*字幕轨/.test(state.status) : result.chineseSubtitleVisible) &&
          (sample.id !== 'V05' || result.fullscreenButtonVisible) ? 'pass' : 'fail'
        result.detail = `Rendered Chinese cues: ${result.chineseSubtitleVisible}; CC restored: ${result.restored}; ` +
          `time: ${state.playback?.currentTime || 0}; player: ${state.status}`
      } catch (error) {
        result.status = 'blocked'
        const diagnosis = await page.locator('#movie_player video').evaluate(video => ({
          width: video.getBoundingClientRect().width, height: video.getBoundingClientRect().height,
          readyState: video.readyState, currentTime: video.currentTime
        })).catch(() => null)
        result.detail = error.message.slice(0, 180) + (diagnosis ? ' · ' + JSON.stringify(diagnosis) : '')
      }
      results.push(result)
      console.log(`${result.id} ${result.status} ${result.detail}`)
      await page.close()
    }
  } finally {
    await context.close()
  }
  const suffix = process.env.MILO_P0_IDS ? '-' + process.env.MILO_P0_IDS.replace(/,/g, '-') : ''
  const file = path.resolve(__dirname, `../output/p0/video-audit${suffix}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(),
    method: 'real public YouTube pages; clean headless Chromium; native captions; no AI response mock', results }, null, 2))
  console.log('Wrote ' + file)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
