import { SavedWordEntry } from '@/models/MiloWord'
import { wordForms } from '@/models/word-forms'
import {
  findSavedWords,
  HIGHLIGHT_STYLE,
  setupWordHighlight
} from '@/content/word-highlight'

const entry = (over: Partial<SavedWordEntry> = {}): SavedWordEntry => ({
  word: 'grit',
  meaning: '毅力',
  status: 'learning',
  times: 2,
  ...over
})

const matcher = (entries: SavedWordEntry[]) => ({
  match(token: string) {
    return entries.find(item =>
      wordForms(item.word).includes(token.toLowerCase())
    )
  }
})

/* jsdom reports no geometry at all, so every box is empty and every word would
   look off-screen. These fakes give the boxes back, and are undone afterwards so
   the "not on screen" case still means something. */
const originalRects = Element.prototype.getClientRects
const asVisible = () => {
  Element.prototype.getClientRects = () =>
    [{ left: 0, top: 0, right: 40, bottom: 16 }] as any
}

describe('saved words marked on the page', () => {
  let saved: {
    entries: SavedWordEntry[]
    match: jest.Mock
    seen: jest.Mock
    listeners: Array<() => void>
    subscribe: (listener: () => void) => () => void
  }
  let layer: ReturnType<typeof setupWordHighlight> | undefined

  beforeEach(() => {
    jest.useFakeTimers()
    saved = {
      entries: [entry(), entry({ word: 'study', meaning: '学习' })],
      match: jest.fn((token: string) =>
        saved.entries.find(item =>
          wordForms(item.word).includes(token.toLowerCase())
        )
      ),
      seen: jest.fn(),
      listeners: [],
      subscribe(listener: () => void) {
        saved.listeners.push(listener)
        return () => undefined
      }
    }
    document.body.innerHTML = '<p id="a">Grit and studies, grit again.</p>'
  })
  afterEach(() => {
    if (layer) layer.cleanup()
    layer = undefined
    document.body.innerHTML = ''
    jest.useRealTimers()
    jest.restoreAllMocks()
    Element.prototype.getClientRects = originalRects
    delete (Range.prototype as any).getClientRects
    delete (Range.prototype as any).getBoundingClientRect
    delete (global as any).CSS
    delete (window as any).Highlight
  })

  const setup = () => {
    layer = setupWordHighlight(saved as any)
    return layer
  }

  it('finds saved words in text, skipping code, inputs and Milo’s own UI', () => {
    document.body.innerHTML = `
      <p id="a">Grit and studies.</p>
      <pre><code>grit() { return grit }</code></pre>
      <input value="grit" />
      <div class="milo-external">grit</div>
      <div data-milo-translation="true">grit</div>
      <p id="b">No saved words here.</p>`
    const hits = findSavedWords(document.body, matcher(saved.entries))
    expect(hits.map(hit => hit.node.data.slice(hit.start, hit.end))).toEqual([
      'Grit',
      'studies'
    ])
    expect(hits[0].entry.word).toBe('grit')
    // A word inside one text node is found from that node too.
    const node = document.getElementById('b')!.firstChild!
    expect(findSavedWords(node, matcher([entry({ word: 'absent' })]))).toEqual(
      []
    )
    expect(
      findSavedWords(
        document.getElementById('a')!.firstChild!,
        matcher(saved.entries),
        1
      )
    ).toHaveLength(1)
  })

  it('leaves 已掌握 words alone', () => {
    document.body.innerHTML = '<p>Grit and studies.</p>'
    expect(
      findSavedWords(
        document.body,
        matcher([entry({ status: 'known' }), entry({ word: 'study' })])
      ).map(hit => hit.node.data.slice(hit.start, hit.end))
    ).toEqual(['studies'])
  })

  it('marks words through the highlight registry and unmarks them on disable', () => {
    asVisible()
    const highlight = {
      ranges: [] as any[],
      add: jest.fn(function(this: any, range: Range) {
        this.ranges.push(range)
      }),
      delete: jest.fn(),
      clear: jest.fn(function(this: any) {
        this.ranges.length = 0
      })
    }
    ;(window as any).Highlight = jest.fn(() => highlight)
    ;(global as any).CSS = { highlights: { set: jest.fn(), delete: jest.fn() } }
    const layer = setup()
    layer.setEnabled(true)
    expect((CSS as any).highlights.set).toHaveBeenCalledWith(
      'milo-saved',
      highlight
    )
    expect(layer.marked()).toEqual(['Grit', 'studies', 'grit'])
    expect(saved.seen).toHaveBeenCalledTimes(3)
    expect(
      document.querySelector<HTMLStyleElement>('[data-milo-style]')!.textContent
    ).toContain(HIGHLIGHT_STYLE.trim())

    layer.setEnabled(false)
    expect(layer.marked()).toEqual([])
    expect((CSS as any).highlights.delete).toHaveBeenCalledWith('milo-saved')
    expect(
      document.querySelector<HTMLStyleElement>('[data-milo-style]')!.textContent
    ).toBe('')
  })

  it('does not count a word that is not on screen', () => {
    // Without a box (display:none, collapsed) the reader never met the word.
    const layer = setup()
    layer.setEnabled(true)
    expect(layer.marked()).toEqual(['Grit', 'studies', 'grit'])
    expect(saved.seen).not.toHaveBeenCalled()
  })

  it('marks text that arrives later, and drops text that leaves', async () => {
    asVisible()
    const layer = setup()
    layer.setEnabled(true)
    expect(layer.marked()).toEqual(['Grit', 'studies', 'grit'])
    const added = document.createElement('p')
    added.textContent = 'More grit.'
    document.body.appendChild(added)
    const removed = document.querySelector('#a')!.firstChild as Text
    removed.data = 'Nothing saved here.'
    for (let i = 0; i < 10; i++) await Promise.resolve()
    jest.advanceTimersByTime(600)
    expect(layer.marked()).toEqual(['grit'])
    // Milo's own overlay text is never scanned.
    const overlay = document.createElement('div')
    overlay.className = 'milo-external'
    overlay.textContent = 'grit'
    document.body.appendChild(overlay)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    jest.advanceTimersByTime(600)
    expect(layer.marked()).toEqual(['grit'])
  })

  it('reshapes the marks when the saved words change', () => {
    asVisible()
    const layer = setup()
    layer.setEnabled(true)
    saved.entries = [entry({ word: 'studies', meaning: '学习' })]
    saved.listeners.forEach(listener => listener())
    expect(layer.marked()).toEqual(['studies'])
  })

  it('shows the meaning in a tooltip on hover and hides it on scroll', () => {
    asVisible()
    const frames: Array<() => void> = []
    window.requestAnimationFrame = (callback: any) => {
      frames.push(callback)
      return frames.length
    }
    // jsdom's Range has no geometry at all; give the marked word a box.
    const box = {
      left: 10,
      top: 20,
      right: 50,
      bottom: 36,
      width: 40,
      height: 16
    }
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [box]
    })
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => box
    })
    const range = document.createRange()
    ;(document as any).caretRangeFromPoint = () => {
      const text = document.querySelector('p')!.firstChild!
      range.setStart(text, 1)
      range.setEnd(text, 1)
      return range
    }
    const layer = setup()
    layer.setEnabled(true)
    // jsdom has no PointerEvent; the handler only reads pointerType and the point.
    document.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 12, clientY: 24 })
    )
    while (frames.length) frames.shift()!()
    expect(document.querySelector('[data-milo-word-tip]')).toBeNull()
    jest.advanceTimersByTime(300)
    const tip = document
      .querySelector<HTMLElement>('[data-milo-word-tip]')!
      .shadowRoot!.querySelector('.tip')!
    expect(tip.textContent).toContain('grit')
    expect(tip.textContent).toContain('毅力')
    expect(tip.textContent).toContain('遇见 2 次')

    window.dispatchEvent(new Event('scroll'))
    expect(document.querySelector('[data-milo-word-tip]')).toBeNull()
  })

  it('cleans up its listeners, marks and tooltip', () => {
    asVisible()
    const target = setup()
    target.setEnabled(true)
    const removed = jest.spyOn(document, 'removeEventListener')
    target.cleanup()
    expect(target.marked()).toEqual([])
    expect(removed).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(document.querySelector('[data-milo-word-tip]')).toBeNull()
  })
})
