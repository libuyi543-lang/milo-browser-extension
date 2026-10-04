/* YouTube bilingual subtitles walkthrough on a local stand-in for youtube.com:
   a real <video>, a fake player API, and the player's own /api/timedtext request.
   Translation replies are local and synthetic. Needs ffmpeg for the test video. */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { chromium } = require(process.env.MILO_PLAYWRIGHT_MODULE || 'playwright')

const VIDEO = path.join(os.tmpdir(), 'milo-youtube-test.webm')
const CAPTIONS = {
  events: [
    { tStartMs: 0, dDurationMs: 600000, id: 1, wpWinPosId: 1 },
    { tStartMs: 0, dDurationMs: 6000, segs: [{ utf8: 'Resilience is a skill\nyou can learn.' }] },
    { tStartMs: 6000, dDurationMs: 6000, segs: [{ utf8: "Don't give up on hard problems." }] }
  ]
}

const page = ({ tracks }) => `<!doctype html><meta charset="utf-8"><title>Grit talk - YouTube</title>
<style>body{margin:0;background:#0f0f0f;font:14px sans-serif}#movie_player{position:relative;width:854px;height:480px}video{width:100%;height:100%;display:block}.ytp-subtitles-button{position:absolute;right:8px;bottom:8px}.ytp-caption-window-container{position:absolute;left:0;right:0;bottom:60px;text-align:center;color:#fff;font-size:20px}</style>
<div id="movie_player"><video src="/milo-test.webm" muted playsinline></video>
<button class="ytp-subtitles-button" aria-pressed="false">CC</button>
<div class="ytp-caption-window-container" style="opacity:1"><span class="ytp-caption-segment">YouTube native caption</span></div></div>
<script>
  const player = document.getElementById('movie_player')
  const tracks = ${JSON.stringify(tracks)}
  let current = {}
  const cc = player.querySelector('.ytp-subtitles-button')
  cc.onclick = () => cc.setAttribute('aria-pressed', cc.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')
  player.getVideoData = () => ({ video_id: new URL(location.href).searchParams.get('v') })
  player.loadModule = () => {}
  player.getOption = (_module, option) =>
    option === 'track' ? current : option === 'tracklist' ? tracks : [{ languageCode: 'zh-Hans', languageName: '中文（简体）' }]
  player.setOption = (_module, _option, track) => {
    current = track
    window.trackHistory = (window.trackHistory || []).concat(track.languageCode || 'off')
    if (!track.languageCode) return
    const query = 'v=' + player.getVideoData().video_id + '&lang=' + track.languageCode +
      (track.translationLanguage ? '&tlang=' + track.translationLanguage.languageCode : '') + '&fmt=json3&pot=token'
    fetch('/api/timedtext?' + query).then(response => response.text())
  }
</script>`

async function main() {
  if (!fs.existsSync(VIDEO))
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x335544:s=640x360:d=30',
      '-c:v', 'libvpx', '-b:v', '150k', VIDEO])
  const extension = path.resolve(__dirname, '../build/chrome')
  let context
  try {
    context = await chromium.launchPersistentContext('', {
      headless: true,
      channel: 'chromium',
      ignoreDefaultArgs: ['--disable-extensions'],
      ...(process.env.MILO_CHROMIUM_PATH ? { executablePath: process.env.MILO_CHROMIUM_PATH } : {}),
      viewport: { width: 1100, height: 800 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    })
    context.setDefaultTimeout(15000)
    const worker = context.serviceWorkers()[0] ||
      await context.waitForEvent('serviceworker', { timeout: 15000 })
    const errors = []
    context.on('weberror', event => errors.push(event.error().message))
    const timedtext = []
    await context.route('https://www.youtube.com/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/milo-test.webm')
        return route.fulfill({ status: 200, contentType: 'video/webm', body: fs.readFileSync(VIDEO) })
      if (url.pathname === '/api/timedtext') {
        timedtext.push(url.search)
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAPTIONS) })
      }
      const tracks = url.searchParams.get('v') === 'japanese'
        ? [{ languageCode: 'ja', kind: '', is_translateable: true }]
        : [{ languageCode: 'en', kind: 'asr', vss_id: 'a.en', is_translateable: true },
           { languageCode: 'en', kind: '', vss_id: '.en', is_translateable: true }]
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page({ tracks }) })
    })
    await worker.evaluate(() => {
      self.ytRequests = []
      const original = self.fetch
      self.fetch = async (url, request) => {
        if (!String(url).startsWith('https://translate.googleapis.com/')) return original(url, request)
        self.ytRequests.push(String(url))
        const result = String(url).includes('/single?')
          ? { sentences: [{ trans: '韧性' }, { src_translit: 'rɪˈzɪlyəns' }],
              dict: [{ pos: '名词', terms: ['韧性', '弹性'] }] }
          : request.body.getAll('q').map(text => ['译文 ' + text, 'en'])
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
    })
    // The caption hook is registered by the service worker; wait until it is in place.
    for (let i = 0; i < 50; i++) {
      const ids = await worker.evaluate(async () =>
        (await chrome.scripting.getRegisteredContentScripts()).map(item => item.id))
      if (ids.includes('milo-youtube-timedtext')) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const tab = await context.newPage()
    await tab.goto('https://www.youtube.com/watch?v=grit123')
    if (!await tab.evaluate(() => window.__MILO_TIMEDTEXT__))
      throw new Error('Caption hook did not run in the YouTube page')
    const toggle = tab.locator('[data-milo-video-controls] button')
    await toggle.click()
    const layer = tab.locator('[data-milo-interactive] .box')
    await layer.locator('.w', { hasText: 'Resilience' }).waitFor()
    await layer.locator('.target', { hasText: '译文 Resilience is a skill you can learn.' }).waitFor()
    const status = tab.locator('[data-milo-video-controls] .status')
    await status.getByText('双语字幕已开启', { exact: false }).waitFor()
    if (!timedtext.some(query => query.includes('lang=en') && !query.includes('tlang')))
      throw new Error('English source track was not requested: ' + timedtext.join(' | '))
    const picked = await tab.evaluate(() => window.trackHistory)
    if (picked[picked.length - 1] !== 'en') throw new Error('Unexpected track: ' + picked)
    const nativeOpacity = () => tab.evaluate(() =>
      document.querySelector('.ytp-caption-window-container').style.opacity)
    if (await nativeOpacity() !== '0') throw new Error('Native captions still visible')

    await tab.evaluate(() => document.querySelector('video').play())
    await tab.waitForFunction(() => !document.querySelector('video').paused)
    await layer.locator('.w', { hasText: 'Resilience' }).hover()
    await tab.waitForFunction(() => document.querySelector('video').paused)
    const card = tab.getByRole('dialog', { name: 'Milo 单词释义' })
    await card.getByText('韧性', { exact: false }).first().waitFor()
    await card.getByText('Resilience is a skill you can learn.', { exact: false }).waitFor()
    await tab.screenshot({ path: path.join(os.tmpdir(), 'milo-youtube-subtitles.png') })
    await card.getByRole('button', { name: '＋ 加入 Milo' }).click()
    await card.getByRole('button', { name: '✓ 已加入 Milo' }).waitFor()
    const saved = await worker.evaluate(async () =>
      (await chrome.storage.local.get('milo_words_v1')).milo_words_v1)
    const encounter = saved && saved.resilience && saved.resilience.encounters[0]
    if (!encounter || encounter.url !== 'https://www.youtube.com/watch?v=grit123&t=0s' ||
        encounter.sentence !== 'Resilience is a skill you can learn.' || encounter.title !== 'Grit talk')
      throw new Error('Saved word lost its video context: ' + JSON.stringify(encounter))
    // Still paused while the card is open, playing again once it closes.
    if (!await tab.evaluate(() => document.querySelector('video').paused))
      throw new Error('Video resumed while the word card was open')
    await card.getByRole('button', { name: '关闭' }).click()
    await tab.waitForFunction(() => !document.querySelector('video').paused)

    await toggle.click()
    await tab.locator('[data-milo-interactive]').waitFor({ state: 'detached' })
    if (await nativeOpacity() !== '1') throw new Error('Native captions not restored')
    await tab.waitForFunction(() => window.trackHistory[window.trackHistory.length - 1] === 'off')

    // A video without English captions falls back to YouTube's own Chinese captions.
    await tab.goto('https://www.youtube.com/watch?v=japanese')
    await tab.locator('[data-milo-video-controls] button').click()
    await tab.locator('[data-milo-video-controls] .status')
      .getByText('无英文字幕 · 已切换为 YouTube 中文字幕', { exact: false }).waitFor()
    if (await tab.locator('[data-milo-interactive]').count())
      throw new Error('Interactive layer shown without English captions')

    if (errors.length) throw new Error(errors.join('\n'))
    console.log('PASS: English track captured from the player, bilingual layer, hover pause, word card, save with timestamp, resume, restore, no-English fallback.')
    console.log('Translation requests (synthetic): ' + await worker.evaluate(() => self.ytRequests.length))
    console.log('Screenshot: ' + path.join(os.tmpdir(), 'milo-youtube-subtitles.png'))
  } finally {
    if (context) await context.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
