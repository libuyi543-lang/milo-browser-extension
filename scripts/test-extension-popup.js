/* Real extension/worker integration. Separate Playwright environment; no personal browser profile or API keys. */
const fs = require('fs')
const path = require('path')
const os = require('os')
const extract = require('extract-zip')
const { chromium } = require(process.env.MILO_PLAYWRIGHT_MODULE || 'playwright')

async function verify(extension, legacy) {
  const context = await chromium.launchPersistentContext('', {
    headless: true, channel: 'chromium',
    ...(process.env.MILO_CHROMIUM_PATH ? { executablePath: process.env.MILO_CHROMIUM_PATH } : {}),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  })
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 })
    const id = worker.url().split('/')[2]
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`chrome-extension://${id}/popup.html`)
    await page.getByRole('button', { name: '管理 API', exact: true }).waitFor()
    if (legacy) {
      await page.getByRole('alert').filter({ hasText: '后台版本尚未更新' }).waitFor()
      await page.getByRole('button', { name: '打开扩展管理', exact: true }).waitFor()
      await page.getByRole('button', { name: '重新读取设置', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: '后台版本尚未更新' }).waitFor()
    } else {
      await page.getByRole('button', { name: '小米 MiMo 未配置' }).waitFor()
      await page.getByRole('button', { name: '智谱 GLM 未配置' }).click()
      if (await page.locator('#milo-model').inputValue() !== 'glm-4.7-flash') throw new Error('Model selection failed')
      if (await page.getByRole('alert').count()) throw new Error('Unexpected settings error')
    }
    if (!(await page.locator('#root').evaluate(node => node.children.length))) throw new Error('Popup root is blank')
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(legacy ? 'PASS: old worker/new popup shows reload instructions without crashing.' : 'PASS: fresh extension renders and selects AI providers using the real worker.')
  } finally { await context.close() }
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const extension = path.join(root, 'build/chrome')
  await verify(extension, false)
  const legacyZIP = process.env.MILO_LEGACY_ZIP
  if (!legacyZIP) return
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'milo-popup-regression-'))
  try {
    const mixed = path.join(temp, 'mixed')
    const old = path.join(temp, 'old')
    fs.cpSync(extension, mixed, { recursive: true })
    await extract(path.resolve(legacyZIP), { dir: old })
    fs.cpSync(path.join(old, 'assets'), path.join(mixed, 'assets'), { recursive: true })
    fs.copyFileSync(path.join(old, 'background-sw.js'), path.join(mixed, 'background-sw.js'))
    await verify(mixed, true)
  } finally { fs.rmSync(temp, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
