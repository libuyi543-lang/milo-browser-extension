/* Desktop integration in a clean Chromium profile. Uses only local fixture files and simulated service replies. */
const fs = require('fs')
const path = require('path')
const os = require('os')
const http = require('http')
const JSZip = require('jszip')
const { chromium } = require(process.env.MILO_PLAYWRIGHT_MODULE || 'playwright')

function simplePDF() {
  const stream = 'BT /F1 16 Tf 35 550 Td (An English PDF sample.) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ]
  let data = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(data))
    data += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(data)
  data +=
    'xref\n0 6\n0000000000 65535 f \n' +
    offsets
      .slice(1)
      .map(offset => String(offset).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(data)
}
async function main() {
  const root = path.resolve(__dirname, '..')
  const extension = path.join(root, 'build/chrome')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'milo-desktop-fixtures-'))
  fs.writeFileSync(path.join(temp, 'sample.pdf'), simplePDF())
  fs.writeFileSync(
    path.join(temp, 'sample.srt'),
    '1\n00:00:01,000 --> 00:00:03,500\nAn English subtitle.\n'
  )
  const docx = new JSZip()
  docx.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>An English DOCX paragraph.</w:t></w:r></w:p></w:body></w:document>'
  )
  fs.writeFileSync(
    path.join(temp, 'sample.docx'),
    await docx.generateAsync({ type: 'nodebuffer' })
  )
  const epub = new JSZip()
  epub.file('mimetype', 'application/epub+zip')
  epub.file(
    'META-INF/container.xml',
    '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'
  )
  epub.file(
    'OPS/book.opf',
    '<package><manifest><item id="chapter" href="chapter.xhtml"/></manifest><spine><itemref idref="chapter"/></spine></package>'
  )
  epub.file(
    'OPS/chapter.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head/><body><p>An English ePub chapter.</p></body></html>'
  )
  fs.writeFileSync(
    path.join(temp, 'sample.epub'),
    await epub.generateAsync({ type: 'nodebuffer' })
  )
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(
      '<!doctype html><meta charset="utf-8"><title>Milo desktop fixture</title><style>body{max-width:800px;margin:50px auto;font:20px/1.7 Georgia,serif;color:#29412b}video{width:600px;height:300px}</style><article><p id="first">First English paragraph.</p><p id="changing">Original English paragraph.</p></article><aside><p>Sidebar content stays original.</p></aside><video id="video"></video><div class="ytp-caption-segment"></div>'
    )
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let context
  try {
    context = await chromium.launchPersistentContext('', {
      headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      channel: 'chromium',
      viewport: { width: 1280, height: 900 },
      ...(process.env.MILO_CHROMIUM_PATH
        ? { executablePath: process.env.MILO_CHROMIUM_PATH }
        : {}),
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`
      ]
    })
    const reader = await context.newPage()
    const errors = []
    context.on('weberror', event => errors.push(event.error().message))
    await reader.goto(`http://127.0.0.1:${server.address().port}`)
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker', { timeout: 15000 }))
    const id = worker.url().split('/')[2]
    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        milo_deepseek_api_key: 'isolated-demo-token'
      })
      self.requests = []
      const original = self.fetch
      self.fetch = async (url, request) => {
        if (
          !String(url).startsWith('https://api.deepseek.com/') &&
          !String(url).startsWith('https://api.xiaomimimo.com/')
        )
          return original(url, request)
        const body = JSON.parse(request.body)
        const raw = body.messages[1].content
        let result
        if (Array.isArray(raw)) {
          result = raw.some(item => item.type === 'image_url')
            ? {
                regions: [
                  {
                    original: 'Hello',
                    translation: '你好',
                    box: [50, 100, 600, 500]
                  }
                ]
              }
            : { text: 'An audio sentence.' }
        } else {
          const input = JSON.parse(raw)
          self.requests.push(input)
          result = Array.isArray(input)
            ? {
                translations: input.map(item => ({
                  id: item.id,
                  text: '译文 ' + item.text
                }))
              }
            : input.word
            ? { meaning: '中文释义', phonetic: '/test/', partOfSpeech: 'n.' }
            : { text: '译文 ' + input.text }
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: { content: JSON.stringify(result) }
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
    })
    await reader.keyboard.press(
      process.platform === 'darwin' ? 'Meta+a' : 'Control+a'
    )
    await reader
      .getByText('译文 First English paragraph.', { exact: true })
      .waitFor()
    await reader.evaluate(() => {
      const p = document.createElement('p')
      p.id = 'added'
      p.textContent = 'Newly loaded English paragraph.'
      document.querySelector('article').appendChild(p)
    })
    await reader
      .getByText('译文 Newly loaded English paragraph.', { exact: true })
      .waitFor()
    for (const text of [
      'Updated English paragraph.',
      'Final English paragraph.'
    ]) {
      await reader
        .locator('#changing')
        .evaluate((element, text) => (element.textContent = text), text)
      await reader.getByText('译文 ' + text, { exact: true }).waitFor()
    }
    if ((await reader.locator('[data-milo-translation]').count()) !== 3)
      throw new Error('Dynamic content produced duplicate results')
    if (await reader.locator('aside [data-milo-translation]').count())
      throw new Error('Sidebar was translated')
    await reader.keyboard.press(
      process.platform === 'darwin' ? 'Meta+a' : 'Control+a'
    )
    await reader
      .locator('[data-milo-translation]')
      .first()
      .waitFor({ state: 'detached' })
    console.log(
      'PASS: dynamic body-only translation, updates, deduplication and restoration.'
    )
    await reader.locator('#first').hover()
    await reader.keyboard.press('Control')
    await reader
      .getByText('译文 First English paragraph.', { exact: true })
      .waitFor()
    await reader.keyboard.press('Control')
    await reader
      .getByText('译文 First English paragraph.', { exact: true })
      .waitFor({ state: 'detached' })
    console.log('PASS: Control hover paragraph translation toggles.')
    const work = await context.newPage()
    await work.goto(`chrome-extension://${id}/workspace.html`)
    await work.getByRole('heading', { name: '文本翻译', exact: true }).waitFor()
    await work
      .locator('textarea')
      .first()
      .fill('A manual English sentence.')
    await work.getByRole('button', { name: '翻译', exact: true }).click()
    await work
      .locator('textarea')
      .nth(1)
      .getAttribute('readonly')
    await work.waitForFunction(
      () =>
        document.querySelectorAll('textarea')[1].value ===
        '译文 A manual English sentence.'
    )
    await work.getByRole('button', { name: '阅读设置', exact: true }).click()
    if (
      (await work
        .locator('section:visible select')
        .first()
        .locator('option')
        .count()) < 100
    )
      throw new Error('Missing language choices')
    await work
      .locator('section:visible select')
      .nth(3)
      .selectOption('translation')
    await work
      .locator('section:visible select')
      .nth(4)
      .selectOption('boxed')
    await work
      .getByRole('button', { name: '保存阅读设置', exact: true })
      .click()
    await work.getByText('已保存，请刷新阅读网页', { exact: true }).waitFor()
    await reader.reload()
    await reader.keyboard.press(
      process.platform === 'darwin' ? 'Meta+a' : 'Control+a'
    )
    await reader
      .getByText('译文 First English paragraph.', { exact: true })
      .waitFor()
    if (await reader.locator('#first').isVisible())
      throw new Error('Translation-only mode left source visible')
    await reader.keyboard.press(
      process.platform === 'darwin' ? 'Meta+a' : 'Control+a'
    )
    if (!(await reader.locator('#first').isVisible()))
      throw new Error('Source was not restored')
    await work
      .locator('section:visible select')
      .nth(3)
      .selectOption('bilingual')
    await work
      .getByRole('button', { name: '保存阅读设置', exact: true })
      .click()
    if (process.env.MILO_DESKTOP_SCREENSHOTS)
      await work.screenshot({
        path: path.join(root, 'docs/images/reading-settings.png'),
        fullPage: true
      })
    console.log(
      'PASS: saved display preferences hide and restore original paragraphs.'
    )
    await work
      .getByRole('button', { name: '文档与电子书', exact: true })
      .click()
    for (const name of ['sample.docx', 'sample.epub', 'sample.srt']) {
      await work
        .locator('input[type=file]')
        .setInputFiles(path.join(temp, name))
      await work.getByRole('heading', { name, exact: true }).waitFor()
      await work
        .getByRole('button', { name: '开始 / 继续翻译', exact: true })
        .click()
      await work.getByText('翻译完成，可以导出', { exact: true }).waitFor()
      const event = work.waitForEvent('download')
      await work
        .getByRole('button', { name: '导出双语文件', exact: true })
        .click()
      const download = await event
      const file = path.join(temp, download.suggestedFilename())
      await download.saveAs(file)
      if (name.endsWith('.docx')) {
        const zip = await JSZip.loadAsync(fs.readFileSync(file))
        if (
          !(await zip.file('word/document.xml').async('string')).includes(
            '译文'
          )
        )
          throw new Error('DOCX export lost translations')
      }
      if (name.endsWith('.epub')) {
        const zip = await JSZip.loadAsync(fs.readFileSync(file))
        if (
          !(await zip.file('OPS/chapter.xhtml').async('string')).includes(
            '译文'
          )
        )
          throw new Error('ePub export lost translations')
      }
      if (
        name.endsWith('.srt') &&
        !fs.readFileSync(file, 'utf8').includes('00:00:01,000 --> 00:00:03,500')
      )
        throw new Error('Subtitle timing changed')
    }
    await work
      .locator('input[type=file]')
      .setInputFiles(path.join(temp, 'sample.pdf'))
    await work
      .getByRole('heading', { name: 'sample.pdf', exact: true })
      .waitFor()
    await work.getByText('An English PDF sample.', { exact: true }).waitFor()
    await work
      .getByRole('button', { name: '开始 / 继续翻译', exact: true })
      .click()
    await work
      .getByText('译文 An English PDF sample.', { exact: true })
      .waitFor()
    console.log(
      'PASS: DOCX, ePub, SRT round trips and real PDF.js extraction/rendering.'
    )
    if (process.env.MILO_DESKTOP_SCREENSHOTS)
      await work.screenshot({
        path: path.join(root, 'docs/images/desktop-documents.png')
      })
    await work.getByRole('button', { name: '图片与漫画', exact: true }).click()
    const png = await work.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 200
      c.height = 120
      const x = c.getContext('2d')
      x.fillStyle = 'white'
      x.fillRect(0, 0, 200, 120)
      x.fillStyle = 'black'
      x.font = '24px sans-serif'
      x.fillText('Hello', 20, 40)
      return c.toDataURL('image/png')
    })
    fs.writeFileSync(
      path.join(temp, 'image.png'),
      Buffer.from(png.split(',')[1], 'base64')
    )
    await work
      .locator('input[type=file]')
      .setInputFiles(path.join(temp, 'image.png'))
    await work.getByRole('button', { name: '识别并翻译', exact: true }).click()
    await work.getByText('Hello', { exact: true }).waitFor()
    const imageDownload = work.waitForEvent('download')
    await work
      .getByRole('button', { name: '导出译文覆盖 PNG', exact: true })
      .click()
    await (await imageDownload).saveAs(path.join(temp, 'translated.png'))
    if (fs.statSync(path.join(temp, 'translated.png')).size < 100)
      throw new Error('Empty image export')
    console.log(
      'PASS: OCR response rendering, region validation and PNG overlay export.'
    )
    await reader.bringToFront()
    await reader.evaluate(() => {
      Object.defineProperty(document.querySelector('video'), 'paused', {
        configurable: true,
        get: () => false
      })
      document.querySelector('.ytp-caption-segment').textContent =
        'An English video subtitle.'
    })
    await work.evaluate(
      tabId =>
        chrome.tabs.sendMessage(tabId, { type: 'MILO_TOGGLE_SUBTITLES' }),
      Number(
        await worker.evaluate(async () => {
          const tabs = await chrome.tabs.query({})
          return tabs.find(tab => tab.url.startsWith('http://127.0.0.1:')).id
        })
      )
    )
    await reader.waitForFunction(() =>
      document
        .querySelector('[data-milo-subtitles]')
        ?.textContent.includes('译文 An English video subtitle.')
    )
    console.log('PASS: readable video-caption adapter emits bilingual text.')
    await reader.bringToFront()
    const readerTab = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({})
      return tabs.find(tab => tab.url.startsWith('http://127.0.0.1:')).id
    })
    await work.evaluate(
      tabId => chrome.tabs.sendMessage(tabId, { type: 'MILO_BEGIN_AREA' }),
      readerTab
    )
    await reader
      .getByText('Milo · 拖动圈选文字区域，Esc 取消', { exact: true })
      .waitFor()
    const cropEvent = context.waitForEvent('page')
    await reader.mouse.move(240, 50)
    await reader.mouse.down()
    await reader.mouse.move(740, 170)
    await reader.mouse.up()
    const crop = await cropEvent
    await crop.waitForLoadState()
    await crop.locator('.image-result img').waitFor({ timeout: 15000 })
    if (!crop.url().endsWith('#images'))
      throw new Error('Region capture did not open image workspace')
    await crop.close()
    console.log(
      'PASS: trusted region drag captures cropped pixels into image workspace.'
    )
    const now = Date.now()
    const word = {
      id: 'fixture-word',
      word: 'inevitable',
      normalizedWord: 'inevitable',
      meaning: '不可避免的',
      sentence: 'The decline seemed inevitable.',
      source: {
        type: 'browser',
        title: 'Local fixture',
        url: 'https://example.com/'
      },
      createdAt: now,
      encounterCount: 1,
      encounters: [
        {
          sentence: 'The decline seemed inevitable.',
          title: 'Local fixture',
          url: 'https://example.com/',
          createdAt: now
        }
      ]
    }
    fs.writeFileSync(
      path.join(temp, 'words.json'),
      JSON.stringify({ version: 1, words: [word] })
    )
    await work.getByRole('button', { name: '单词本', exact: true }).click()
    await work
      .locator('input[type=file]')
      .setInputFiles(path.join(temp, 'words.json'))
    await work
      .getByRole('heading', { name: 'inevitable', exact: true })
      .waitFor()
    const backupEvent = work.waitForEvent('download')
    await work.getByRole('button', { name: '备份 JSON', exact: true }).click()
    const backup = await backupEvent
    await backup.saveAs(path.join(temp, 'backup.json'))
    const saved = JSON.parse(
      fs.readFileSync(path.join(temp, 'backup.json'), 'utf8')
    )
    if (
      saved.words.length !== 1 ||
      JSON.stringify(saved).includes('isolated-demo-token')
    )
      throw new Error('Invalid backup or key leak')
    await work.getByRole('button', { name: '删除', exact: true }).click()
    await work
      .getByRole('button', { name: '撤销删除 inevitable', exact: true })
      .click()
    await work
      .getByRole('heading', { name: 'inevitable', exact: true })
      .waitFor()
    console.log(
      'PASS: notebook backup import, export, deletion and undo preserve encounters without keys.'
    )
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(
      'Desktop fixture integration complete. No real API keys, personal files or live provider calls were used.'
    )
  } finally {
    if (context) await context.close()
    await new Promise(resolve => server.close(resolve))
    fs.rmSync(temp, { recursive: true, force: true })
  }
}
main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
