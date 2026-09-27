/* Isolated YouTube/X player fixtures. Captions and translation API replies are synthetic. */
const path = require('path')
const fs = require('fs')
const http = require('http')
const crypto = require('crypto')
const { chromium } = require(process.env.MILO_PLAYWRIGHT_MODULE || 'playwright')
const youtube = `<!doctype html><meta charset="utf-8"><title>Milo YouTube native fixture</title><style>body{margin:40px auto;max-width:800px;font:16px/1.6 sans-serif;background:#f8faf6}ytd-watch-flexy{display:block}#movie_player{position:relative;background:#18271f}video{width:100%;height:400px}.ytp-caption-window-container{position:absolute;bottom:65px;left:20px;color:white;font:22px/1.6 serif}.ytp-subtitles-button{position:absolute;bottom:8px;right:15px}#below{padding:12px 0}</style><ytd-watch-flexy><div id="movie_player"><video></video><div class="ytp-caption-window-container"><span class="ytp-caption-segment"></span></div><button class="ytp-subtitles-button" aria-label="平台字幕 CC" aria-pressed="false">CC</button></div><div id="below"><h2>原字幕区域 · 中文字幕示例</h2></div></ytd-watch-flexy><video id="thumbnail-preview" style="width:160px;height:90px"></video><script>
const p=document.getElementById('movie_player'),cc=p.querySelector('button');
const en={languageCode:'en',languageName:'English',vss_id:'.en',kind:'',is_translateable:true},cn={languageCode:'zh-CN',languageName:'中文',vss_id:'.zh-CN',kind:''};
window.nativeTracks=[en,cn];window.nativeTrack=en;window.nativeVideoId='milo-local-fixture';window.nativeCue=0;
const render=()=>{p.querySelector('.ytp-caption-segment').textContent=cc.getAttribute('aria-pressed')!=='true'?'':window.nativeTrack.languageCode==='zh-CN'||window.nativeTrack.translationLanguage?'这里只显示中文，沿用 YouTube 原有字幕。'+(window.nativeCue||''):'This is an English YouTube caption.'};
cc.onclick=()=>{cc.setAttribute('aria-pressed',cc.getAttribute('aria-pressed')==='true'?'false':'true');render()};
p.getVideoData=()=>({video_id:window.nativeVideoId});p.loadModule=()=>{};
p.getOption=(_module,option)=>option==='track'?window.nativeTrack:option==='tracklist'?window.nativeTracks:[{languageCode:'zh-Hans',languageName:'中文（简体）'}];
p.setOption=(_module,option,track)=>{window.nativeTrack=track;cc.setAttribute('aria-pressed',track.languageCode?'true':'false');render()};window.renderCue=render;
</script>`
const xhtml = `<!doctype html><meta charset="utf-8"><title>Milo X fixture</title><style>body{margin:30px auto;max-width:620px;font:16px/1.6 sans-serif;background:#fafcf8;padding-bottom:300px}article{padding:12px;margin-bottom:24px;border:1px solid #dce3d6;border-radius:12px}[data-testid=videoPlayer]{background:#1d2b23;position:relative}video{width:100%;height:235px}[data-testid=videoCaption]{color:white;padding:0 20px 10px}</style><article id="first"><p>First video</p><div data-testid="videoPlayer"><div data-testid="videoComponent"><video></video></div><div data-testid="videoCaption">First X video caption.</div></div></article><article id="second"><p>Second video</p><div data-testid="videoPlayer"><div data-testid="videoComponent"><video></video></div><div data-testid="videoCaption">Second X video caption.</div></div></article><script>window.outerClicks=0;document.querySelectorAll('article').forEach(article=>article.onclick=()=>window.outerClicks++)</script>`
async function main() {
  const root = path.resolve(__dirname, '..')
  const extension = path.join(root, 'build/chrome')
  const output = path.join(root, 'output/video-controls')
  fs.mkdirSync(output, { recursive: true })
  const requests = []
  const server = http.createServer(async (request, response) => {
    let raw = ''
    for await (const part of request) raw += part
    const input = JSON.parse(JSON.parse(raw).messages[1].content)
    requests.push(input)
    response.setHeader('Content-Type', 'application/json')
    response.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                text:
                  {
                    'This is a readable YouTube caption.':
                      '这是一条可以读取的 YouTube 字幕。',
                    'First X video caption.': '第一个 X 视频的字幕。',
                    'Second X video caption.': '另一个 X 视频的字幕。'
                  }[input.text] || '示例译文'
              })
            }
          }
        ]
      })
    )
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let context
  try {
    context = await chromium.launchPersistentContext('', {
      headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      channel: 'chromium',
      viewport: { width: 1280, height: 960 },
      ...(process.env.MILO_CHROMIUM_PATH
        ? { executablePath: process.env.MILO_CHROMIUM_PATH }
        : {}),
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`
      ]
    })
    context.setDefaultTimeout(15000)
    const errors = []
    context.on('weberror', event => errors.push(event.error().message))
    const id = crypto
      .createHash('sha256')
      .update(extension)
      .digest('hex')
      .slice(0, 32)
      .replace(/[0-9a-f]/g, digit =>
        String.fromCharCode(97 + parseInt(digit, 16))
      )
    const own = await context.newPage()
    await own.goto(`chrome-extension://${id}/workspace.html`)
    await own.evaluate(
      async endpoint =>
        chrome.storage.local.set({
          milo_ai_settings_v1: {
            provider: 'custom',
            profiles: {
              custom: {
                apiKey: 'isolated-video-demo-token',
                model: 'milo-fixture',
                endpoint
              }
            }
          }
        }),
      `http://127.0.0.1:${server.address().port}/v1/chat/completions`
    )
    await context.route('https://www.youtube.com/**', route =>
      route.fulfill({ contentType: 'text/html', body: youtube })
    )
    await context.route('https://x.com/**', route =>
      route.fulfill({ contentType: 'text/html', body: xhtml })
    )
    const page = await context.newPage()
    await page.goto('https://www.youtube.com/watch?v=milo-local-fixture')
    const start = page.getByRole('button', {
      name: '开启字幕翻译',
      exact: true
    })
    await start.waitFor()
    if ((await page.locator('[data-milo-video-controls]').count()) !== 1)
      throw new Error('YouTube thumbnail preview received an unwanted toggle')
    if (requests.length)
      throw new Error('Video entry made a request before click')
    await start.press('Enter')
    await page
      .getByText('这里只显示中文，沿用 YouTube 原有字幕。', { exact: true })
      .waitFor()
    if (await page.locator('[data-milo-subtitles]').count())
      throw new Error('YouTube still uses a separate overlay')
    if (
      (await page
        .locator('.ytp-caption-window-container')
        .evaluate(node => getComputedStyle(node).opacity)) !== '1'
    )
      throw new Error('Native caption region was hidden')
    if (requests.length)
      throw new Error('YouTube native translation sent an AI request')
    await page.locator('ytd-watch-flexy').screenshot({
      path: path.join(root, 'docs/images/video-translation.png')
    })
    await page
      .getByRole('button', { name: '关闭字幕翻译', exact: true })
      .click()
    if (
      (await page
        .locator('.ytp-subtitles-button')
        .getAttribute('aria-pressed')) !== 'false'
    )
      throw new Error('Original CC off state was not restored')
    await page.evaluate(() => {
      window.nativeTracks = [window.nativeTracks[0]]
    })
    await page
      .getByRole('button', { name: '开启字幕翻译', exact: true })
      .click()
    await page.waitForFunction(
      () => window.nativeTrack.translationLanguage?.languageCode === 'zh-Hans'
    )
    await page.evaluate(() => {
      let n = 0
      const id = setInterval(() => {
        window.nativeCue = ++n
        window.renderCue()
        if (n === 8) clearInterval(id)
      }, 60)
    })
    await page
      .getByText('这里只显示中文，沿用 YouTube 原有字幕。8', { exact: true })
      .waitFor()
    if (requests.length) throw new Error('Rolling YouTube captions used AI')
    await page
      .getByRole('button', { name: '关闭字幕翻译', exact: true })
      .click()
    await page
      .getByRole('button', { name: '开启字幕翻译', exact: true })
      .click()
    await page
      .getByRole('button', { name: '关闭字幕翻译', exact: true })
      .click()
    await page.waitForFunction(
      () =>
        document
          .querySelector('.ytp-subtitles-button')
          .getAttribute('aria-pressed') === 'false' &&
        window.nativeTrack.languageCode === 'en'
    )
    await page
      .getByRole('button', { name: '开启字幕翻译', exact: true })
      .click()
    await page.waitForFunction(
      () => window.nativeTrack.translationLanguage?.languageCode === 'zh-Hans'
    )
    console.log(
      'PASS: YouTube native Chinese-only display, direct/auto tracks, original styles and fast rolling cues without AI.'
    )
    await page.locator('#movie_player').evaluate(player => {
      const button = document.createElement('button')
      button.id = 'fixture-fullscreen'
      button.textContent = 'Fullscreen fixture'
      button.onclick = () => player.requestFullscreen()
      player.appendChild(button)
    })
    await page.locator('#fixture-fullscreen').click()
    await page.waitForFunction(() => !!document.fullscreenElement)
    await page.waitForFunction(
      () =>
        document.querySelector('[data-milo-video-controls]')?.parentElement ===
        document.fullscreenElement
    )
    await page
      .getByRole('button', { name: '关闭字幕翻译', exact: true })
      .click()
    if (await page.locator('[data-milo-subtitles]').count())
      throw new Error('Fullscreen created a separate caption overlay')
    await page.evaluate(() => document.exitFullscreen())
    await page.waitForFunction(
      () => !!document.querySelector('#below > [data-milo-video-controls]')
    )
    console.log(
      'PASS: container fullscreen preserves the toggle and returns it below the video.'
    )
    await page.goto('https://x.com/milo/status/local-fixture')
    const first = page.locator('#first')
    const second = page.locator('#second')
    await first
      .getByRole('button', { name: '开启字幕翻译', exact: true })
      .waitFor()
    await first
      .getByRole('button', { name: '开启字幕翻译', exact: true })
      .click()
    await page.waitForFunction(() =>
      document
        .querySelector('[data-milo-subtitles]')
        ?.textContent.includes('第一个 X 视频的字幕。')
    )
    await second
      .getByRole('button', { name: '开启字幕翻译', exact: true })
      .click()
    await page.waitForFunction(() =>
      document
        .querySelector('[data-milo-subtitles]')
        ?.textContent.includes('另一个 X 视频的字幕。')
    )
    if (
      (await first
        .getByRole('button', { name: '开启字幕翻译', exact: true })
        .getAttribute('aria-pressed')) !== 'false'
    )
      throw new Error('First X video stayed active')
    if ((await page.evaluate(() => window.outerClicks)) !== 0)
      throw new Error('Button click navigated or toggled parent tweet')
    const position = await page.locator('[data-milo-subtitles]').boundingBox()
    await page.evaluate(() => window.scrollBy(0, 90))
    await page.waitForTimeout(250)
    const shifted = await page.locator('[data-milo-subtitles]').boundingBox()
    if (Math.abs(position.y - shifted.y) < 50)
      throw new Error('Overlay did not follow scroll')
    await second
      .getByRole('button', { name: '关闭字幕翻译', exact: true })
      .click()
    await second
      .locator('[data-testid=videoCaption]')
      .evaluate(node => (node.textContent = ''))
    const before = requests.length
    await second
      .getByRole('button', { name: '开启字幕翻译', exact: true })
      .click()
    await second
      .getByText('等待字幕 · 请开启 CC；无字幕视频可用右键音频翻译', {
        exact: true
      })
      .waitFor()
    await page.waitForTimeout(700)
    if (requests.length !== before)
      throw new Error('No-caption video sent an empty translation request')
    await page.evaluate(() => document.querySelector('#second').remove())
    await page.waitForTimeout(400)
    if (
      await page
        .getByRole('button', { name: '关闭字幕翻译', exact: true })
        .count()
    )
      throw new Error('Removed player left translation active')
    await page.evaluate(() => {
      const article = document.createElement('article')
      article.innerHTML = '<div data-testid="videoPlayer"><video></video></div>'
      document.body.appendChild(article)
    })
    if (
      (await page
        .getByRole('button', { name: '开启字幕翻译', exact: true })
        .count()) !== 2
    )
      await page.waitForTimeout(300)
    if (
      (await page
        .getByRole('button', { name: '开启字幕翻译', exact: true })
        .count()) !== 2
    )
      throw new Error('Dynamically inserted video has no toggle')
    console.log(
      'PASS: X per-video scope, parent click isolation, scroll, no-caption guidance, removal and dynamic video.'
    )
    if (errors.length) throw new Error(errors.join('\n'))
  } finally {
    if (context) await context.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
