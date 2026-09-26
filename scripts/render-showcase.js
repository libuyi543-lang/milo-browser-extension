/* Reproducible documentation captures. Requires Playwright in a separate Node 18+ environment. */
const fs = require('fs')
const path = require('path')
const http = require('http')
const { chromium } = require(process.env.MILO_PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const root = path.resolve(__dirname, '..')
  const build = path.join(root, 'build/chrome')
  const manifest = JSON.parse(fs.readFileSync(path.join(build, 'manifest.json'), 'utf8'))
  const contentScripts = manifest.content_scripts[0].js.filter(file => !file.includes('browser-polyfill'))
  const scripts = contentScripts.map(file => `<script src="/${file}"></script>`).join('')
  const output = path.join(root, 'docs/images')
  fs.mkdirSync(output, { recursive: true })
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/demo.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.end(fs.readFileSync(path.join(root, 'docs/showcase/demo.html'), 'utf8').replace('</body>', scripts + '</body>'))
    }
    if (url.pathname === '/demo-popup.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.end(fs.readFileSync(path.join(build, 'popup.html'), 'utf8').replace('<script src="/assets/browser-polyfill.min.js"></script>', '<script src="/fixture.js"></script>'))
    }
    if (url.pathname === '/notebook.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.end(`<!doctype html><meta charset="utf-8"><title>Milo notebook demo</title><style>body{margin:0;background:#f5f5ed;color:#2c4032;font-family:-apple-system,'PingFang SC',sans-serif}.copy{position:absolute;left:70px;top:150px;width:360px}.eyebrow{font:12px Georgia,serif;letter-spacing:3px;color:#6e876f}h1{font:500 38px/1.5 'PingFang SC',sans-serif;margin:26px 0}p{font-size:16px;color:#7a8877;line-height:1.9}iframe{position:absolute;left:500px;top:30px;width:360px;height:700px;border:1px solid #e2e6da;border-radius:15px;box-shadow:0 22px 50px #253f3017;background:#fbfaf6}footer{position:absolute;left:70px;bottom:40px;font-size:11px;color:#929e8b}</style><div class="copy"><div class="eyebrow">YOUR WORDS, WITH CONTEXT</div><h1>每一次遇见，<br>都算数。</h1><p>同一个词，新的阅读语境。<br>记录原句、来源和遇见次数。</p><p>词条保存在当前浏览器本地。<br>手机同步属于后续计划。</p></div><iframe src="/demo-popup.html" title="Actual Milo popup with fixture data"></iframe><footer>ACTUAL MILO UI · LOCAL DEMO DATA</footer>`)
    }
    let file
    if (url.pathname === '/fixture.js') file = path.join(root, 'docs/showcase/fixture.js')
    else if (url.pathname === '/cover.html') file = path.join(root, 'docs/showcase/cover.html')
    else {
      const base = url.pathname.startsWith('/assets/') && !url.pathname.endsWith('/milo-app-icon.png') ? build : root
      file = path.resolve(base, '.' + url.pathname)
      if (!file.startsWith(base + path.sep)) { res.statusCode = 403; return res.end() }
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end() }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  let browser
  try {
    const defaultChrome = process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined
    browser = await chromium.launch({ headless: true, executablePath: process.env.MILO_CHROME_PATH || defaultChrome })
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      if (!request.url().startsWith(base) && !request.url().startsWith('data:')) errors.push('Unexpected external request')
    })
    await page.goto(base + '/demo.html')
    await page.waitForFunction(() => window.browser && window.openDemoWord)
    await page.waitForTimeout(250)
    await page.evaluate(() => window.openDemoWord())
    await page.getByRole('button', { name: '＋ 加入 Milo' }).waitFor({ state: 'visible' })
    await page.waitForFunction(() => document.querySelector('#milo-word-popup-root').querySelector('div').shadowRoot.textContent.includes('不可避免的'))
    await page.screenshot({ path: path.join(output, 'selection.png') })
    await page.getByRole('button', { name: '＋ 加入 Milo' }).click()
    await page.getByRole('button', { name: '✓ 已加入 Milo' }).waitFor({ state: 'visible' })
    await page.screenshot({ path: path.join(output, 'saved.png') })
    await page.keyboard.press('Control+a')
    await page.waitForFunction(() => document.querySelectorAll('[data-milo-translation]').length === 4)
    await page.getByText('在需求连续几年下降之后，衰退似乎已不可避免。', { exact: true }).waitFor()
    await page.setViewportSize({ width: 1280, height: 980 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: path.join(output, 'bilingual.png') })
    await page.setViewportSize({ width: 960, height: 770 })
    await page.goto(base + '/notebook.html')
    const popup = page.frameLocator('iframe')
    await popup.getByText('遇见 3 次', { exact: true }).waitFor()
    await popup.getByText('不可避免的；必然发生的', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(output, 'notebook.png') })
    await page.goto(base + '/demo-popup.html')
    await page.setViewportSize({ width: 360, height: 780 })
    await page.getByRole('button', { name: '管理 API' }).click()
    await page.getByRole('button', { name: '小米 MiMo 未配置' }).click()
    await page.locator('#milo-model').fill('mimo-v2.6-flash')
    await page.locator('#milo-api-key').fill('documentation-fixture-token')
    await page.getByRole('button', { name: '保存并测试' }).click()
    await page.getByText('小米 MiMo · mimo-v2.6-flash 连接正常', { exact: true }).waitFor()
    if (await page.locator('#milo-api-key').inputValue()) throw new Error('Saved key remained visible in input')
    await page.getByRole('button', { name: '智谱 GLM 未配置' }).click()
    if (await page.locator('#milo-model').inputValue() !== 'glm-4.7-flash') throw new Error('Provider model did not change')
    await page.getByRole('button', { name: '小米 MiMo 当前使用' }).click()
    await page.screenshot({ path: path.join(output, 'ai-settings.png') })
    await page.getByRole('button', { name: '固定到浏览器工具栏' }).click()
    await page.getByText('点击 Chrome 右上角的拼图图标', { exact: false }).waitFor()
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(base + '/cover.html')
    await page.locator('.screen').evaluate(image => image.decode())
    await page.screenshot({ path: path.join(output, 'cover.png') })
    await page.setViewportSize({ width: 1280, height: 640 })
    await page.evaluate(() => {
      document.body.style.height = '640px'
      document.querySelector('.copy').style.top = '115px'
      document.querySelector('.screen').style.width = '505px'
    })
    await page.screenshot({ path: path.join(output, 'social-preview.png') })
    if (errors.length) throw new Error(errors.join('\n'))
    console.log('Verified and captured selection, saved, bilingual, notebook, AI settings, cover and social preview.')
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
