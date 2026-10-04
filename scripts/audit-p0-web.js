/* Visit the fixed public pages in a clean Chromium profile. Translation replies are synthetic. */
const fs = require('fs')
const path = require('path')
const { chromium } = require(process.env.MILO_PLAYWRIGHT_MODULE || 'playwright')
const samples = require('../docs/p0-samples.json').web.filter(sample =>
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
    const worker = context.serviceWorkers()[0] ||
      await context.waitForEvent('serviceworker', { timeout: 15000 })
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ milo_deepseek_api_key: 'isolated-web-audit-key' })
      const original = self.fetch
      self.fetch = async (url, request) => {
        if (!String(url).startsWith('https://api.deepseek.com/'))
          return original(url, request)
        const input = JSON.parse(JSON.parse(request.body).messages[1].content)
        return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: {
          content: JSON.stringify({ translations: input.map(item => ({ id: item.id, text: '译文 ' + item.text })) })
        } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
    })
    for (const sample of samples) {
      const page = await context.newPage()
      const result = { id: sample.id, category: sample.category, url: sample.url,
        originalIntact: false, translationVisible: false, restored: false,
        noDuplicate: false, noCrash: false, status: 'not-run', detail: '' }
      const errors = []
      page.on('pageerror', error => errors.push(error.message.slice(0, 180)))
      try {
        const response = await page.goto(sample.url, { waitUntil: 'domcontentloaded', timeout: 18000 })
        await page.waitForTimeout(900)
        result.httpStatus = response ? response.status() : null
        result.finalUrl = page.url()
        if (result.httpStatus >= 400) throw new Error('HTTP ' + result.httpStatus)
        if (sample.category === 'editable input') {
          const input = page.locator('textarea, input[type="search"], input[name="q"]').first()
          await input.waitFor({ timeout: 6000 })
          await input.fill('中文输入不会触发正文翻译')
          await input.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
          const selected = await input.evaluate(node => node.selectionStart === 0 && node.selectionEnd === node.value.length)
          result.originalIntact = (await input.inputValue()) === '中文输入不会触发正文翻译'
          result.translationVisible = null
          result.restored = selected
          result.noDuplicate = (await page.locator('[data-milo-translation]').count()) === 0
          result.noCrash = true
          result.status = result.originalIntact && selected && result.noDuplicate ? 'pass' : 'fail'
          result.detail = 'Input guard: native select-all retained; translation visibility not applicable.'
        } else {
          const initial = await page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('[data-testid="tweetText"],main p,article p,p'))
            const node = candidates.find(item => item.textContent.trim().length >= 55 && /[A-Za-z]{4}/.test(item.textContent))
            if (!node) return null
            node.setAttribute('data-p0-source', 'true')
            return node.textContent
          })
          if (!initial) throw new Error('No readable English paragraph exposed in the page DOM')
          await page.evaluate(() => { document.body.setAttribute('tabindex', '-1'); document.body.focus() })
          await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
          try {
            await page.waitForFunction(() => document.querySelectorAll('[data-milo-translation]').length > 0, null, { timeout: 8500 })
          } catch (_) {}
          const translated = await page.evaluate(() => {
            const nodes = Array.from(document.querySelectorAll('[data-milo-translation]'))
            return { count: nodes.length, visible: nodes.some(node => {
              const style = getComputedStyle(node)
              return node.getBoundingClientRect().width > 0 && style.display !== 'none' && style.visibility !== 'hidden'
            }), ids: nodes.map(node => node.dataset.miloParagraph).filter(Boolean) }
          })
          result.translationVisible = translated.visible
          result.noDuplicate = translated.count > 0 && new Set(translated.ids).size === translated.ids.length
          result.originalIntact = await page.locator('[data-p0-source]').evaluate((node, text) => {
            const source = node.cloneNode(true)
            source.querySelectorAll('[data-milo-translation]').forEach(item => item.remove())
            return source.textContent === text
          }, initial).catch(() => false)
          await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
          await page.waitForTimeout(300)
          result.restored = (await page.locator('[data-milo-translation]').count()) === 0 &&
            await page.locator('[data-p0-source]').evaluate((node, text) => node.textContent === text, initial).catch(() => false)
          if (sample.id === 'W12' && result.restored) {
            await page.locator('a[href*="/learn/your-first-component"]').first().evaluate(link => link.click())
            await page.waitForURL(/your-first-component/, { timeout: 6000 })
            await page.evaluate(() => { document.body.setAttribute('tabindex', '-1'); document.body.focus() })
            await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
            await page.waitForFunction(() => document.querySelectorAll('[data-milo-translation]').length > 0,
              null, { timeout: 7000 })
            const routeTranslations = await page.locator('[data-milo-translation]').count()
            await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
            await page.locator('[data-milo-translation]').first().waitFor({ state: 'detached', timeout: 5000 })
            result.dynamicRoute = { url: page.url(), translated: routeTranslations, restored: true }
          }
          result.noCrash = !errors.some(error => /assets\/content|milo|extension context/i.test(error))
          result.status = [result.originalIntact, result.translationVisible, result.restored,
            result.noDuplicate, result.noCrash].every(Boolean) ? 'pass' : 'fail'
          result.detail = `Rendered translations: ${translated.count}; page errors: ${errors.length}` +
            (result.dynamicRoute ? `; SPA route translated: ${result.dynamicRoute.translated}` : '')
        }
      } catch (error) {
        result.status = 'blocked'
        result.detail = error.message.slice(0, 240)
        result.noCrash = !errors.some(item => /assets\/content|milo|extension context/i.test(item))
      }
      results.push(result)
      console.log(`${result.id} ${result.status} ${result.detail}`)
      await page.close()
    }
  } finally {
    await context.close()
  }
  const suffix = process.env.MILO_P0_IDS ? '-' + process.env.MILO_P0_IDS.replace(/,/g, '-') : ''
  const file = path.resolve(__dirname, `../output/p0/web-audit${suffix}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(),
    method: 'real public pages; clean Chromium + Milo extension; synthetic AI responses', results }, null, 2))
  console.log('Wrote ' + file)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
