import { PageTranslation, setupPageTranslation } from '@/content/page-translation'
import { collectParagraphs } from '@/content/page-translation/paragraphs'
import { collectReadingParagraphs } from '@/content/page-translation/scope'

describe('natural inline page translation', () => {
  afterEach(() => { document.body.innerHTML = ''; document.querySelectorAll('.milo-external').forEach(node => node.remove()) })

  it('extracts reading paragraphs once, preserves inline links, and skips editors and existing Chinese', () => {
    document.body.innerHTML = '<article><p>The decline <strong>seemed inevitable</strong> after falling demand.</p><p>Another <a href="/link">English paragraph</a> appears here.</p><p>这是已经存在的中文段落。</p><pre>const variable = true</pre><div contenteditable="true">Private draft in an editor.</div><div hidden>Hidden English paragraph.</div></article>'
    const paragraphs = collectParagraphs(document.body)
    expect(paragraphs.map(item => item.text)).toEqual(['The decline seemed inevitable after falling demand.', 'Another English paragraph appears here.'])
  })

  it('places Chinese below each paragraph and restores the original DOM', async () => {
    document.body.innerHTML = '<article><p>First English paragraph.</p><p>Second English paragraph.</p></article>'
    const original = document.body.innerHTML
    const controller = new PageTranslation(async items => items.map(item => ({ id: item.id, text: `中文 ${item.id}` })))
    controller.toggle()
    await Promise.resolve()
    expect(document.querySelectorAll('[data-milo-translation]')).toHaveLength(2)
    const first = document.querySelector('p')!
    expect(first.textContent).toBe('First English paragraph.')
    expect(first.nextElementSibling!.textContent).toBe('中文 0:0')
    controller.toggle()
    expect(document.body.innerHTML).toBe(original)
  })

  it('keeps a caption inside the container when the text lives in a summary', async () => {
    document.body.innerHTML = '<main><details><summary>What the painter was given · 15 items</summary><p>Everything this painter was told.</p></details></main>'
    const translator = jest.fn(async items => items.map(item => ({ id: item.id, text: '画家所获之物 · 15 项' })))
    const controller = new PageTranslation(translator)
    controller.toggle()
    await Promise.resolve()
    const caption = document.querySelector('[data-milo-translation]')!
    expect(caption).not.toBeNull()
    const details = document.querySelector('details')!
    expect(details.contains(caption)).toBe(true)
    expect(document.querySelector('main')!.nextElementSibling).toBeNull()
    controller.clear()
  })

  it('spans the whole row when a caption sits inside a grid layout', async () => {
    document.body.innerHTML = '<ol><li><span>Day 1, 09:00</span><span>Starting from a warm ground, I am planning a quiet lake.</span></li></ol>'
    const item = document.querySelector('li')!
    item.style.display = 'grid'
    item.style.gridTemplateColumns = '118px 1fr'
    const translator = jest.fn(async items => items.map(item => ({ id: item.id, text: '第1天，09:00 从一层温暖的地面开始，我打算画一片安静的湖。' })))
    const controller = new PageTranslation(translator)
    controller.toggle()
    await Promise.resolve()
    const caption = document.querySelector('[data-milo-translation]') as HTMLElement
    expect(caption).not.toBeNull()
    expect(caption.style.gridColumn).toBe('1 / -1')
    expect(item.contains(caption)).toBe(true)
    controller.clear()
  })

  it('ignores an in-flight result after the user restores the page', async () => {
    document.body.innerHTML = '<p>English paragraph to translate.</p>'
    let finish: (value: Array<{ id: string; text: string }>) => void = () => undefined
    const controller = new PageTranslation(() => new Promise(resolve => { finish = resolve }))
    controller.toggle()
    controller.clear()
    finish([{ id: '0:0', text: '中文译文' }])
    await Promise.resolve()
    expect(document.querySelector('[data-milo-translation]')).toBeNull()
  })

  it('preserves native select-all inside an editor', () => {
    Object.defineProperty(browser.runtime, 'id', { configurable: true, value: 'milo-test' })
    document.body.innerHTML = '<textarea>English draft text</textarea>'
    const onTrigger = jest.fn()
    const cleanup = setupPageTranslation(onTrigger)
    const editor = document.querySelector('textarea')!
    const event = new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true })
    editor.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(onTrigger).not.toHaveBeenCalled()
    cleanup()
  })

  it('only collects X post and reply bodies, excluding author details, controls, cards and sidebar', () => {
    document.body.innerHTML = `
      <nav>Home Explore Notifications Messages</nav>
      <main>
        <div data-testid="primaryColumn">
          <h2>Post</h2>
          <article data-testid="tweet">
            <div data-testid="User-Name">John Reader @johnreader</div>
            <time>September twenty six</time>
            <div data-testid="tweetText">The future of <strong>reading</strong> is full of possibilities.<div data-testid="tweet-text-show-more-link" role="button">Show more</div></div>
            <div>External preview card description</div>
            <div role="group">One hundred views <button>Reply</button><button>Repost</button><button>Like</button></div>
          </article>
          <article data-testid="tweet"><div data-testid="User-Name">Another account</div><div data-testid="tweetText">This reply has its own reading context.</div></article>
        </div>
        <aside data-testid="sidebarColumn"><h2>Who to follow</h2><div data-testid="tweetText">Recommended content from the sidebar.</div></aside>
      </main>`
    expect(collectReadingParagraphs(document.body, 'x.com').map(item => item.text)).toEqual([
      'The future of reading is full of possibilities.',
      'This reply has its own reading context.'
    ])
  })

  it('does not fall back to translating X interface text when post bodies are absent', () => {
    document.body.innerHTML = '<main><div data-testid="primaryColumn">Home Explore Post Following Likes</div><aside data-testid="sidebarColumn">Recommended accounts</aside></main>'
    expect(collectReadingParagraphs(document.body, 'twitter.com')).toEqual([])
  })

  it('prioritizes article content over menus, footer and unrelated main-column UI', () => {
    document.body.innerHTML = '<header>Website brand</header><nav>Home About Contact</nav><main><h2>Account settings</h2><article><h1>Reading the world</h1><p>An article paragraph worth reading.</p><aside>Recommended reading</aside></article></main><footer>Privacy Terms Copyright</footer>'
    expect(collectReadingParagraphs(document.body, 'example.com').map(item => item.text)).toEqual(['Reading the world', 'An article paragraph worth reading.'])
  })

  it('sends only X body text to the provider and leaves surrounding UI untranslated', async () => {
    document.body.innerHTML = '<nav>Home Notifications</nav><main data-testid="primaryColumn"><article data-testid="tweet"><div data-testid="User-Name">Account name</div><div data-testid="tweetText">Only this post body should be translated.</div><button>Reply</button></article></main><aside>Trending topics</aside>'
    const original = document.body.innerHTML
    const translator = jest.fn(async items => items.map(item => ({ id: item.id, text: '仅翻译推文正文。' })))
    const controller = new PageTranslation(translator, 'x.com')
    controller.toggle()
    await Promise.resolve()
    expect(translator.mock.calls[0][0].map(item => item.text)).toEqual(['Only this post body should be translated.'])
    expect(document.querySelectorAll('[data-milo-translation]')).toHaveLength(1)
    expect(document.querySelector('nav')!.textContent).toBe('Home Notifications')
    expect(document.querySelector('[data-testid="User-Name"]')!.textContent).toBe('Account name')
    expect(document.querySelector('button')!.textContent).toBe('Reply')
    expect(document.querySelector('aside')!.textContent).toBe('Trending topics')
    controller.clear()
    expect(document.body.innerHTML).toBe(original)
  })

  it('computes ancestor visibility once per extraction instead of once per text node', () => {
    document.body.innerHTML = `<article><p>${Array.from({ length: 40 }, () => '<span>English reading text. </span>').join('')}</p></article>`
    const styles = jest.spyOn(window, 'getComputedStyle')
    const paragraphs = collectReadingParagraphs(document.body, 'example.com')
    expect(paragraphs).toHaveLength(1)
    expect(styles.mock.calls.length).toBeLessThanOrEqual(document.querySelectorAll('*').length)
    styles.mockRestore()
  })

  it('skips CSS-hidden ancestors outside an individual X body root', () => {
    document.body.innerHTML = '<main data-testid="primaryColumn"><article style="display:none"><div data-testid="tweetText">A hidden post body should not cost a request.</div></article></main>'
    expect(collectReadingParagraphs(document.body, 'x.com')).toEqual([])
  })

  it('prioritizes a visible paragraph over older offscreen paragraphs', async () => {
    document.body.innerHTML = `<article>${Array.from({ length: 9 }, (_, index) => `<p>English paragraph number ${index}.</p>`).join('')}</article>`
    document.querySelectorAll('p').forEach((element, index) => {
      element.getBoundingClientRect = () => ({ top: index === 8 ? 100 : -1000, bottom: index === 8 ? 130 : -970, left: 0, right: 500, width: 500, height: 30 } as DOMRect)
    })
    const translator = jest.fn(async items => items.map(item => ({ id: item.id, text: '中文译文。' })))
    const controller = new PageTranslation(translator)
    controller.toggle()
    await Promise.resolve()
    expect(translator.mock.calls[0][0][0].text).toBe('English paragraph number 8.')
    controller.clear()
  })

  it('requests background cancellation when a running page translation is stopped', async () => {
    Object.defineProperty(browser.runtime, 'id', { configurable: true, value: 'milo-test' })
    document.body.innerHTML = '<article><p>An English paragraph currently translating.</p></article>'
    let finish: (value: Array<{ id: string; text: string }>) => void = () => undefined
    const translator = jest.fn((_items, _sessionId) => new Promise<readonly { id: string; text: string }[]>(resolve => { finish = resolve }))
    const cancel = jest.fn()
    const controller = new PageTranslation(translator, 'example.com', cancel)
    controller.toggle()
    const sessionId = translator.mock.calls[0][1]
    controller.clear()
    expect(cancel).toHaveBeenCalledWith(sessionId)
    finish([{ id: '0:0', text: '中文译文。' }])
    await Promise.resolve()
    expect(document.querySelector('[data-milo-translation]')).toBeNull()
  })
})
