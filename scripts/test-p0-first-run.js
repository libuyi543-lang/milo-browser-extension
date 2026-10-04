/* Fresh-profile first-run walkthrough: no setup, free translation replies are local and synthetic. */
const http = require('http')
const path = require('path')
const { chromium } = require(process.env.MILO_PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end('<!doctype html><title>P0 first run</title><article><p>The decline seemed <span id="word">inevitable</span> after several years of falling demand.</p></article>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const extension = path.resolve(__dirname, '../build/chrome')
  let context
  try {
    context = await chromium.launchPersistentContext('', {
      headless: true,
      channel: 'chromium',
      ignoreDefaultArgs: ['--disable-extensions'],
      ...(process.env.MILO_CHROMIUM_PATH
        ? { executablePath: process.env.MILO_CHROMIUM_PATH }
        : {}),
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`
      ]
    })
    context.setDefaultTimeout(15000)
    const worker = context.serviceWorkers()[0] ||
      await context.waitForEvent('serviceworker', { timeout: 15000 })
    const extensionId = worker.url().split('/')[2]
    const errors = []
    context.on('weberror', event => errors.push(event.error().message))
    await worker.evaluate(() => {
      self.p0Requests = []
      self.p0Mode = 'ok'
      const original = self.fetch
      self.fetch = async (url, request) => {
        if (!String(url).startsWith('https://translate.googleapis.com/'))
          return original(url, request)
        self.p0Requests.push(String(url))
        if (self.p0Mode === 'error')
          return new Response('{}', { status: 429 })
        const result = String(url).includes('/single?')
          ? { sentences: [{ trans: '不可避免的' }, { src_translit: 'ɪnˈevɪtəb(ə)l' }],
              dict: [{ pos: '形容词', terms: ['不可避免的', '必然的'] }] }
          : request.body.getAll('q').map(text => ['译文 ' + text, 'en'])
        return new Response(JSON.stringify(result), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        })
      }
    })
    const reader = await context.newPage()
    await reader.goto(`http://127.0.0.1:${server.address().port}/`)
    const card = reader.getByRole('dialog', { name: 'Milo 单词释义' })
    await reader.locator('#word').dblclick()
    await card.getByText('不可避免的').waitFor()
    await card.getByRole('button', { name: '＋ 加入 Milo' }).click()
    await card.getByRole('button', { name: '✓ 已加入 Milo' }).waitFor()
    const stored = await worker.evaluate(async () => {
      const result = await chrome.storage.local.get('milo_words_v1')
      return result.milo_words_v1
    })
    if (!stored || Object.keys(stored).length !== 1 ||
        stored.inevitable.encounterCount !== 1 ||
        !stored.inevitable.encounters[0].sentence.includes('decline seemed inevitable'))
      throw new Error('First save lost word or reading context')
    const settings = await context.newPage()
    await settings.goto(`chrome-extension://${extensionId}/workspace.html#notebook`)
    await settings.getByText('inevitable', { exact: true }).waitFor()
    await settings.getByText('不可避免的；必然的', { exact: true }).waitFor()
    await reader.bringToFront()
    await worker.evaluate(() => { self.p0Mode = 'error' })
    await reader.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
    await reader.getByRole('button', { name: '重试', exact: true }).waitFor()
    await reader.getByText('免费翻译暂时繁忙', { exact: false }).waitFor()
    await worker.evaluate(() => { self.p0Mode = 'ok' })
    await reader.getByRole('button', { name: '重试', exact: true }).click()
    await reader.locator('[data-milo-translation]').first().waitFor()
    await reader.locator('[data-milo-floating-button] .main[aria-pressed=true]').click()
    await reader.locator('[data-milo-translation]').first().waitFor({ state: 'detached' })
    if (errors.length) throw new Error(errors.join('\n'))
    console.log('PASS: fresh profile lookup without setup, save, notebook revisit, page error retry and floating-button restore work.')
    console.log('Internal walkthrough actions: select word → save word → open notebook.')
    console.log('Translation requests used synthetic local responses: ' + await worker.evaluate(() => self.p0Requests.length))
  } finally {
    if (context) await context.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
