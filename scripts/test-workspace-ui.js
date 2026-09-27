/* Workspace UX regression in an isolated extension profile. All API replies are simulated. */
const path = require('path')
const fs = require('fs')
const http = require('http')
const { chromium } = require(process.env.MILO_PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const root = path.resolve(__dirname, '..')
  const extension = path.join(root, 'build/chrome')
  const output = path.join(root, 'output/workspace-ui')
  fs.mkdirSync(output, { recursive: true })
  const requests = []
  let responseDelay = 0
  let failResponse = false
  const server = http.createServer(async (request, response) => {
    if (request.method === 'POST') {
      let raw = ''
      for await (const part of request) raw += part
      const body = JSON.parse(raw)
      const input = JSON.parse(body.messages[1].content)
      requests.push(input)
      if (responseDelay)
        await new Promise(resolve => setTimeout(resolve, responseDelay))
      response.setHeader('Content-Type', 'application/json')
      if (failResponse) {
        response.writeHead(401)
        response.end('{}')
        return
      }
      const text =
        input.text ===
        'Learning a language is not just about remembering words. It is about discovering new ways to see the world.'
          ? '学习一门语言，不只是记住单词，也是发现看待世界的新方式。'
          : `译文 ${input.target} ${input.text}`
      response.end(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify({ text }) }
            }
          ]
        })
      )
      return
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(
      '<!doctype html><title>Local Milo fixture</title><p>Workspace UI fixture.</p>'
    )
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let context
  try {
    context = await chromium.launchPersistentContext('', {
      headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      channel: 'chromium',
      viewport: { width: 1440, height: 960 },
      ...(process.env.MILO_CHROMIUM_PATH
        ? { executablePath: process.env.MILO_CHROMIUM_PATH }
        : {}),
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`
      ]
    })
    context.setDefaultTimeout(10000)
    const errors = []
    context.on('weberror', event => errors.push(event.error().message))
    const fixture = await context.newPage()
    await fixture.goto(`http://127.0.0.1:${server.address().port}`)
    const knownID = require('crypto')
      .createHash('sha256')
      .update(extension)
      .digest('hex')
      .slice(0, 32)
      .replace(/[0-9a-f]/g, digit =>
        String.fromCharCode(97 + parseInt(digit, 16))
      )
    const page = await context.newPage()
    await page.goto(`chrome-extension://${knownID}/workspace.html#text`)
    console.log('PASS: isolated extension workspace loaded.')
    await page
      .getByText('添加 API Key 后，就可以开始翻译。', { exact: true })
      .waitFor()
    if (
      await page.getByRole('button', { name: '翻译', exact: true }).isEnabled()
    )
      throw new Error('Unconfigured service enabled translate')
    await page
      .getByRole('button', { name: '配置翻译服务 →', exact: true })
      .click()
    await page.getByRole('heading', { name: 'AI 服务', exact: true }).waitFor()
    await page.evaluate(async endpoint => {
      await chrome.storage.local.set({
        milo_ai_settings_v1: {
          provider: 'custom',
          profiles: {
            custom: {
              apiKey: 'isolated-ui-demo-token',
              model: 'milo-fixture',
              endpoint
            }
          }
        }
      })
    }, `http://127.0.0.1:${server.address().port}/v1/chat/completions`)
    await page.getByRole('button', { name: '文本翻译', exact: true }).click()
    await page.getByRole('button', { name: '自定义兼容 API 更换 ↗' }).waitFor()
    await page.screenshot({ path: path.join(output, 'empty.png') })
    await page.getByRole('button', { name: '试试示例', exact: true }).click()
    await page
      .locator('#text-source')
      .press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
    await page.waitForFunction(() =>
      document.querySelector('#text-result').value.includes('学习一门语言')
    )
    await page.screenshot({
      path: path.join(root, 'docs/images/text-workspace.png')
    })
    await page.screenshot({ path: path.join(output, 'complete.png') })
    console.log(
      'PASS: setup guidance, sample text, keyboard translate and completed result.'
    )
    await page.evaluate(() => {
      window.copiedText = ''
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async text => {
            window.copiedText = text
          }
        }
      })
    })
    await page.getByRole('button', { name: '复制译文', exact: true }).click()
    await page.getByRole('button', { name: '✓ 已复制', exact: true }).waitFor()
    if (
      !(await page.evaluate(() => window.copiedText)).includes('学习一门语言')
    )
      throw new Error('Copy did not use actual result')
    await page.locator('#text-target-language').selectOption('en')
    await page
      .getByText('原文或语言已修改，请重新翻译', { exact: true })
      .waitFor()
    if (
      await page
        .getByRole('button', { name: '复制译文', exact: true })
        .isEnabled()
    )
      throw new Error('Stale translation could be copied')
    console.log(
      'PASS: copy feedback and stale result protection after language change.'
    )
    await page.locator('#text-source-language').selectOption('en')
    await page.locator('#text-target-language').selectOption('ja')
    await page.locator('#text-source').fill('Source language override test.')
    await page.getByRole('button', { name: '翻译', exact: true }).click()
    await page.waitForFunction(() =>
      document.querySelector('#text-result').value.includes('译文 ja')
    )
    const request = requests[requests.length - 1]
    if (request.source !== 'en' || request.target !== 'ja')
      throw new Error('Language override did not reach API')
    await page.getByRole('button', { name: '交换语言', exact: true }).click()
    if (
      (await page.locator('#text-source-language').inputValue()) !== 'ja' ||
      (await page.locator('#text-target-language').inputValue()) !== 'en' ||
      !(await page.locator('#text-source').inputValue()).includes('译文 ja')
    )
      throw new Error('Language exchange did not move completed translation')
    console.log(
      'PASS: source/target languages route correctly; exchange uses completed translation.'
    )
    responseDelay = 1200
    await page.locator('#text-source').fill('A delayed draft to stop.')
    await page.getByRole('button', { name: '翻译', exact: true }).click()
    await page.getByRole('button', { name: '停止翻译', exact: true }).click()
    await page.getByText('已停止，原文已保留', { exact: true }).waitFor()
    await page.waitForTimeout(1400)
    if (await page.locator('#text-result').inputValue())
      throw new Error('Late stopped response overwrote output')
    await page.locator('#text-source').fill('A delayed draft to edit.')
    await page.getByRole('button', { name: '翻译', exact: true }).click()
    await page.locator('#text-source').fill('The latest draft stays.')
    await page.waitForTimeout(1400)
    if (
      (await page.locator('#text-result').inputValue()) ||
      (await page.locator('#text-source').inputValue()) !==
        'The latest draft stays.'
    )
      throw new Error('Late edited response overwrote current draft')
    await page.getByRole('button', { name: '阅读设置', exact: true }).click()
    await page.getByRole('heading', { name: '阅读设置', exact: true }).waitFor()
    await page.goBack()
    await page.getByRole('heading', { name: '文本翻译', exact: true }).waitFor()
    if (
      (await page.locator('#text-source').inputValue()) !==
      'The latest draft stays.'
    )
      throw new Error('Navigation discarded draft')
    console.log(
      'PASS: stop, edit cancellation, navigation and browser back preserve drafts.'
    )
    responseDelay = 0
    failResponse = true
    await page.locator('#text-source').fill('Failure and retry example.')
    await page.getByRole('button', { name: '翻译', exact: true }).click()
    await page.getByRole('alert').waitFor()
    failResponse = false
    await page.getByRole('button', { name: '重新翻译', exact: true }).click()
    await page.waitForFunction(() =>
      document.querySelector('#text-result').value.includes('Failure and retry')
    )
    if (await page.getByRole('alert').count())
      throw new Error('Successful retry left error visible')
    await page.getByRole('button', { name: '清空', exact: true }).click()
    if (
      (await page.locator('#text-source').inputValue()) ||
      (await page.locator('#text-result').inputValue())
    )
      throw new Error('Clear did not reset both editors')
    console.log('PASS: API error, retry and clear interactions.')
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 900 })
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        )
      )
        throw new Error(`Horizontal overflow at ${width}`)
      if (width === 390)
        await page.screenshot({
          path: path.join(output, 'compact.png'),
          fullPage: true
        })
    }
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(
      'PASS: wide, laptop and narrow layouts have no page overflow or JavaScript errors.'
    )
  } finally {
    if (context) await context.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
