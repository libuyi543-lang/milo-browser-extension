/* v0.7 walkthrough on a local reading site: save a word once, then meet it again
   on another page. Checks the marks, the hover tooltip, the sighting count, learning
   mode and the 已掌握 status, all reaching pages that are already open.
   Translation replies are local and synthetic. */
const http = require('http')
const path = require('path')
const { chromium } = require(process.env.MILO_PLAYWRIGHT_MODULE || 'playwright')

const SHOT = path.join(require('os').tmpdir(), 'milo-word-highlight.png')
const ARTICLE = `<!doctype html><meta charset="utf-8"><title>Grit - Field Notes</title>
<article>
<h1 id="title">The power of grit</h1>
<p id="first">The decline seemed <span id="word">inevitable</span> after several years of falling demand, but the team kept going.</p>
<p id="second">Their habits mattered more than talent, and every one of those habits was earned.</p>
</article>`

async function main() {
  const server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(ARTICLE)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
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
      viewport: { width: 1100, height: 800 },
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
      const original = self.fetch
      self.fetch = async (url, request) => {
        if (!String(url).startsWith('https://translate.googleapis.com/'))
          return original(url, request)
        const result = String(url).includes('/single?')
          ? {
              sentences: [{ trans: '不可避免的' }, { src_translit: 'ɪnˈevɪtəb(ə)l' }],
              dict: [{ pos: '形容词', terms: ['不可避免的', '必然的'] }]
            }
          : request.body.getAll('q').map(text => ['译文 ' + text, 'en'])
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    })

    const wordMap = () =>
      worker.evaluate(async () =>
        (await chrome.storage.local.get('milo_words_v1')).milo_words_v1)
    /** What the page itself believes is marked, straight from the highlight registry. */
    const marks = page =>
      page.evaluate(() => {
        const registry = CSS.highlights.get('milo-saved')
        return registry ? Array.from(registry).map(range => range.toString()) : []
      })
    /** Put the mouse on the middle of the range that covers `text`. */
    const hoverWord = async (page, text) => {
      const point = await page.evaluate(term => {
        const registry = CSS.highlights.get('milo-saved')
        const range = Array.from(registry || []).find(
          item => item.toString() === term
        )
        if (!range) throw new Error('No highlight for ' + term)
        const box = range.getBoundingClientRect()
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      }, text)
      await page.mouse.move(point.x, point.y)
    }

    const until = async (check, failure) => {
      for (let i = 0; i < 50; i++) {
        if (await check()) return
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      throw new Error(failure)
    }
    const waitMarks = (page, expected) =>
      until(
        async () => JSON.stringify(await marks(page)) === JSON.stringify(expected),
        'Expected marks ' + JSON.stringify(expected)
      ).catch(async error => {
        throw new Error(error.message + ', page has ' + JSON.stringify(await marks(page)))
      })

    const reader = await context.newPage()
    await reader.goto(`${origin}/grit`)

    // 1. Nothing is saved yet, so the page is left alone.
    if ((await marks(reader)).length)
      throw new Error('Highlighted a word before anything was saved')

    // 2. Save the word from the very selection a reader makes.
    const card = reader.getByRole('dialog', { name: 'Milo 单词释义' })
    await reader.locator('#word').dblclick()
    await card.getByText('不可避免的').waitFor()
    await card.getByRole('button', { name: '＋ 加入 Milo' }).click()
    await card.getByRole('button', { name: '✓ 已加入 Milo' }).waitFor()
    await card.getByText('学习中').waitFor()

    // 3. The word is marked as soon as it is saved. Seeing it on the page it was
    //    saved on does not count as meeting it again.
    await waitMarks(reader, ['inevitable'])
    await reader.waitForTimeout(2000)
    const saved = await wordMap()
    if (!saved.inevitable || saved.inevitable.encounterCount !== 1)
      throw new Error('First save lost the encounter: ' + JSON.stringify(saved))
    if (saved.inevitable.seenCount)
      throw new Error('The page it was saved on counted as a second meeting')
    await card.getByRole('button', { name: '关闭' }).click()

    const tip = () =>
      reader
        .locator('[data-milo-word-tip]')
        .evaluate(node => node.shadowRoot.querySelector('.tip').textContent)
    await hoverWord(reader, 'inevitable')
    await reader.waitForSelector('[data-milo-word-tip]')
    const savedTip = await tip()
    if (!savedTip.includes('不可避免的') || !savedTip.includes('遇见 1 次'))
      throw new Error('Tooltip after saving reads: ' + savedTip)
    await reader.mouse.move(600, 700)
    await reader.waitForSelector('[data-milo-word-tip]', { state: 'detached' })

    // 4. Meeting it on another page counts once, however often that page is opened.
    for (const visit of [1, 2]) {
      await reader.goto(`${origin}/another-post`)
      await waitMarks(reader, ['inevitable'])
      await reader.waitForTimeout(2200)
      const count = (await wordMap()).inevitable.seenCount || 0
      if (count !== 1)
        throw new Error(`Visit ${visit} left seenCount at ${count}, expected 1`)
    }
    await hoverWord(reader, 'inevitable')
    await reader.waitForSelector('[data-milo-word-tip]')
    const seenTip = await tip()
    if (!seenTip.includes('遇见 2 次'))
      throw new Error('Sighting was not counted in the tooltip: ' + seenTip)
    await reader.screenshot({ path: SHOT })
    await reader.mouse.move(600, 700)

    // 5. Learning mode, switched on from the toolbar popup, blurs the Chinese of an
    //    already translated page until the pointer is on it. No reload.
    await reader.locator('[data-milo-floating-button] .main').click()
    const paragraph = reader.locator('[data-milo-translation]').first()
    await paragraph.waitFor()
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await popup.getByLabel('学习模式').check()
    await reader.bringToFront()
    const blur = () => paragraph.evaluate(node => getComputedStyle(node).filter)
    await until(async () => (await blur()) !== 'none', 'Learning mode did not blur the translation')
    await paragraph.hover()
    await until(async () => (await blur()) === 'none', 'Hover did not reveal the translation')
    await reader.mouse.move(600, 700)

    // 6. The 标出生词 switch removes and restores the marks on open pages.
    await popup.getByLabel('标出生词').uncheck()
    await waitMarks(reader, [])
    await popup.getByLabel('标出生词').check()
    await waitMarks(reader, ['inevitable'])

    // 7. 已掌握 in the word book drops the mark on open pages; 学习中 brings it back.
    const notebook = await context.newPage()
    await notebook.goto(`chrome-extension://${extensionId}/workspace.html#notebook`)
    await notebook.getByRole('button', { name: '标为已掌握' }).click()
    await notebook.getByRole('button', { name: '改回学习中' }).waitFor()
    await waitMarks(reader, [])
    if ((await wordMap()).inevitable.status !== 'known')
      throw new Error('Status was not stored')
    await notebook.getByRole('button', { name: '改回学习中' }).click()
    await waitMarks(reader, ['inevitable'])

    if (errors.length) throw new Error(errors.join('\n'))
    console.log('PASS: no marks before saving; marked right after saving; the save page is not a second meeting; another page counts once across visits; tooltip meaning and count; learning-mode blur and hover reveal on an open page; 标出生词 switch; 已掌握 and back, live on open pages.')
    console.log('Screenshot: ' + SHOT)
  } finally {
    if (context) await context.close()
    server.close()
  }
}
main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
