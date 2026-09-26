/* Real MV3/content-script integration against local fixtures. No real provider calls or browser profile. */
const fs = require('fs')
const path = require('path')
const http = require('http')
const { chromium } = require(process.env.MILO_PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const root = path.resolve(__dirname, '..')
  const extension = path.join(root, 'build/chrome')
  const html = `<!doctype html><meta charset="utf-8"><title>Milo 输入翻译演示</title>
  <style>body{background:#faf9f5;color:#293c30;max-width:820px;margin:80px auto;font:18px/1.8 Georgia,'PingFang SC',serif}h1{font:500 38px Georgia,serif}textarea,input,[contenteditable]{display:block;width:100%;box-sizing:border-box;padding:18px;border:1px solid #d5ddce;border-radius:12px;background:#fffefb;color:#293c30;font:18px/1.6 -apple-system,sans-serif;margin:15px 0 35px}textarea{height:92px}label{font-size:14px;color:#71846e}output{font:13px -apple-system,sans-serif;color:#7b8a76}button{padding:8px 14px}</style>
  <h1>Milo · 输入翻译</h1><p>输入中文，连续敲三下空格，英文直接回到输入框。</p>
  <label>搜索框演示 · 固定示例数据</label><textarea id="query" name="q">查询 巴黎便宜酒店 today</textarea>
  <label>普通搜索输入框</label><input id="search" type="search" value="中文搜索">
  <label>React 受控输入框</label><div id="controlled-root"></div>
  <div id="editable" tabindex="0" contenteditable="true">前缀 <b>便宜</b><i>酒店</i> 后缀</div>
  <input id="password" type="password" value="中文密码测试">
  <p>The decline seemed <span id="word">inevitable</span> after falling demand.</p>
  <script src="/react.js"></script><script src="/react-dom.js"></script>
  <script>function Controlled(){const [value,setValue]=React.useState('React中文查询');const [tick,setTick]=React.useState(0);return React.createElement('div',null,React.createElement('textarea',{id:'controlled',value,onChange:e=>setValue(e.target.value)}),React.createElement('output',{id:'echo'},value),React.createElement('button',{id:'rerender',onClick:()=>setTick(tick+1)},'React重新渲染'))}ReactDOM.render(React.createElement(Controlled),document.getElementById('controlled-root'))</script>`
  const server = http.createServer((req, res) => {
    if (req.url === '/react.js' || req.url === '/react-dom.js') {
      res.setHeader('Content-Type', 'text/javascript')
      const file = req.url === '/react.js' ? 'node_modules/react/umd/react.production.min.js' : 'node_modules/react-dom/umd/react-dom.production.min.js'
      return fs.createReadStream(path.join(root, file)).pipe(res)
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let context
  try {
    context = await chromium.launchPersistentContext('', {
      headless: true, channel: 'chromium', viewport: { width: 1280, height: 900 },
      ...(process.env.MILO_CHROMIUM_PATH ? { executablePath: process.env.MILO_CHROMIUM_PATH } : {}),
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    })
    const page = await context.newPage(); const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 })
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ milo_deepseek_api_key: 'isolated-test-token' })
      self.inputTest = { requests: [], delay: 0, aborted: 0 }
      self.fetch = async (_url, request) => {
        const body = JSON.parse(request.body); const input = JSON.parse(body.messages[1].content)
        self.inputTest.requests.push(input)
        if (self.inputTest.delay) await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, self.inputTest.delay)
          request.signal.addEventListener('abort', () => { clearTimeout(timer); self.inputTest.aborted += 1; reject(new DOMException('Canceled', 'AbortError')) }, { once: true })
        })
        let result
        if (input.word) result = { meaning: '不可避免的', partOfSpeech: 'adj.' }
        else result = { text: input.text.includes('React') ? 'React query in English' : input.text.includes('前缀') ? 'Prefix cheap hotels suffix' : 'Search cheap hotels in Paris today' }
        return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
    })
    const trigger = async selector => {
      await page.locator(selector).focus()
      if (selector !== '#editable') await page.locator(selector).evaluate(element => element.setSelectionRange(element.value.length, element.value.length))
      else await page.locator(selector).evaluate(editor => { const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); const selected = window.getSelection(); selected.removeAllRanges(); selected.addRange(range) })
      await page.keyboard.press('Space'); await page.keyboard.press('Space'); await page.keyboard.press('Space')
    }
    await worker.evaluate(() => { self.inputTest.delay = 350 })
    await page.locator('#query').focus()
    await page.locator('#query').evaluate(element => element.setSelectionRange(element.value.length, element.value.length))
    await page.keyboard.press('Space'); await page.keyboard.press('Space')
    if (await worker.evaluate(() => self.inputTest.requests.length)) throw new Error('One/two spaces triggered a request')
    await page.keyboard.press('Space')
    if (process.env.MILO_CAPTURE_INPUT) {
      await page.getByRole('dialog', { name: 'Milo 输入翻译' }).waitFor()
      fs.mkdirSync(path.join(root, 'docs/images'), { recursive: true })
      await page.screenshot({ path: path.join(root, 'docs/images/input-translation.png') })
    }
    await page.waitForFunction(() => document.getElementById('query').value === 'Search cheap hotels in Paris today')
    const first = await worker.evaluate(() => self.inputTest.requests[0])
    if (JSON.stringify(first) !== JSON.stringify({ text: '查询 巴黎便宜酒店 today' })) throw new Error('Gesture spaces or other fields were sent')
    await page.locator('#query').focus(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await page.waitForFunction(() => document.getElementById('query').value === '查询 巴黎便宜酒店 today')
    console.log('PASS: three taps, whole-field replacement, no gesture spaces and native undo.')
    await page.locator('#query').evaluate(element => { element.focus(); element.setSelectionRange(3, 3) })
    await page.keyboard.press('Space'); await page.keyboard.press('Space'); await page.keyboard.press('Space')
    await page.waitForFunction(() => document.getElementById('query').value === 'Search cheap hotels in Paris today')
    console.log('PASS: shortcut works in the middle of the draft.')
    await trigger('#controlled')
    await page.waitForFunction(() => document.getElementById('echo').textContent === 'React query in English')
    await page.locator('#rerender').click()
    if (await page.locator('#controlled').inputValue() !== 'React query in English') throw new Error('React controlled input reverted')
    console.log('PASS: controlled input state survives rerender.')
    await trigger('#editable')
    await page.waitForFunction(() => document.getElementById('editable').textContent === 'Prefix cheap hotels suffix')
    console.log('PASS: basic contenteditable three-space translation.')
    await worker.evaluate(() => { self.inputTest.delay = 600 })
    await page.locator('#query').fill('等待翻译旧内容'); await trigger('#query')
    await worker.evaluate(() => new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000
      const check = () => {
        if (self.inputTest.requests.some(item => item.text === '等待翻译旧内容')) return resolve()
        if (Date.now() > deadline) return reject(new Error('Translation request did not start'))
        setTimeout(check, 20)
      }
      check()
    }))
    await page.locator('#query').fill('这是我新输入的内容')
    await page.waitForTimeout(750)
    if (await page.locator('#query').inputValue() !== '这是我新输入的内容') throw new Error('Late translation overwrote the newer draft')
    if (!(await worker.evaluate(() => self.inputTest.aborted))) throw new Error('Stale request was not canceled')
    console.log('PASS: typing during translation cancels the request and protects new text.')
    await worker.evaluate(() => { self.inputTest.delay = 0 })

    await page.locator('#password').focus(); await page.keyboard.press('Space'); await page.keyboard.press('Space'); await page.keyboard.press('Space')
    await page.waitForTimeout(120)
    if (await page.getByRole('dialog', { name: 'Milo 输入翻译' }).isVisible()) throw new Error('Password selection displayed translation action')
    await page.locator('#query').fill('全部中文内容'); await page.locator('#query').focus()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
    const all = await page.locator('#query').evaluate(element => element.selectionStart === 0 && element.selectionEnd === element.value.length)
    if (!all || await page.locator('[data-milo-translation]').count()) throw new Error('Native editor select-all was intercepted')
    await page.locator('#word').dblclick()
    await page.getByRole('button', { name: '＋ 加入 Milo' }).waitFor()
    console.log('PASS: passwords are excluded, native select-all and original English word popup still work.')
    if (errors.length) throw new Error(errors.join('\n'))
  } finally {
    if (context) await context.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
