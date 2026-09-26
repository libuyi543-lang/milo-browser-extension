import { setupTripleSpaceTranslation } from '@/content/input-translation/shortcut'

describe('three-space input translation shortcut', () => {
  let cleanup: () => void
  let drafts: jest.Mock
  let field: HTMLTextAreaElement
  beforeEach(() => {
    Object.defineProperty(browser.runtime, 'id', { configurable: true, value: 'milo-test' })
    document.body.innerHTML = '<textarea></textarea>'
    field = document.querySelector('textarea')!; field.value = '巴黎便宜酒店'; field.focus(); field.setSelectionRange(field.value.length, field.value.length)
    drafts = jest.fn(); cleanup = setupTripleSpaceTranslation(drafts, true)
  })
  afterEach(() => { cleanup(); document.body.innerHTML = ''; jest.restoreAllMocks() })
  function tap(options: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true, ...options })
    field.dispatchEvent(event)
    if (!event.defaultPrevented) { const start = field.selectionStart; field.setRangeText(' ', start, field.selectionEnd, 'end'); field.setSelectionRange(start + 1, start + 1); field.dispatchEvent(new InputEvent('input', { bubbles: true })) }
    return event
  }

  it('keeps one/two spaces native, then removes gesture spaces and translates the entire original draft', () => {
    expect(tap().defaultPrevented).toBe(false); expect(tap().defaultPrevented).toBe(false)
    expect(field.value).toBe('巴黎便宜酒店  '); expect(drafts).not.toHaveBeenCalled()
    expect(tap().defaultPrevented).toBe(true)
    expect(field.value).toBe('巴黎便宜酒店')
    expect(drafts).toHaveBeenCalledTimes(1)
    expect(drafts.mock.calls[0][0]).toMatchObject({ text: '巴黎便宜酒店', whole: true, start: 0, end: 6 })
  })

  it('works at a caret in the middle and retains content before and after the caret', () => {
    field.value = '查询 巴黎便宜酒店 today'; field.setSelectionRange(3, 3)
    tap(); tap(); tap()
    expect(field.value).toBe('查询 巴黎便宜酒店 today')
    expect(drafts.mock.calls[0][0].text).toBe(field.value)
  })

  it('restores a preselected field range before translating, instead of losing the selected Chinese', () => {
    field.select(); tap(); tap()
    expect(field.value).toBe('  ')
    tap()
    expect(field.value).toBe('巴黎便宜酒店')
    expect(drafts.mock.calls[0][0].text).toBe('巴黎便宜酒店')
  })

  it('does not intercept English-only fields or held-down repeat events', () => {
    field.value = 'English query'; field.setSelectionRange(field.value.length, field.value.length)
    tap(); tap(); tap(); expect(field.value).toBe('English query   '); expect(drafts).not.toHaveBeenCalled()
    field.value = '中文'; field.setSelectionRange(2, 2)
    tap({ repeat: true }); tap({ repeat: true }); tap({ repeat: true })
    expect(drafts).not.toHaveBeenCalled(); expect(field.value).toBe('中文   ')
  })

  it('resets the sequence across long pauses and other keys', () => {
    let now = 1000; jest.spyOn(Date, 'now').mockImplementation(() => now)
    tap(); tap(); now += 1300; tap(); expect(drafts).not.toHaveBeenCalled()
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    tap(); tap(); expect(drafts).not.toHaveBeenCalled()
  })

  it('ignores IME composition and modified spaces', () => {
    field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    tap(); tap(); tap(); expect(drafts).not.toHaveBeenCalled()
    field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    tap({ ctrlKey: true }); tap({ altKey: true }); tap({ shiftKey: true }); expect(drafts).not.toHaveBeenCalled()
  })

  it('closes the pending action when the user edits or focuses another field', () => {
    tap(); tap(); tap(); field.value = '新的中文内容'; field.dispatchEvent(new InputEvent('input', { bubbles: true }))
    expect(drafts).toHaveBeenLastCalledWith(null)
    expect(field.value).toBe('新的中文内容')
  })

  it('does not send a draft after listener cleanup', () => {
    cleanup(); tap(); tap(); tap(); expect(drafts).not.toHaveBeenCalled()
  })
  it('ignores key events manufactured by a page in production mode', () => {
    cleanup(); cleanup = setupTripleSpaceTranslation(drafts)
    tap(); tap(); tap(); expect(drafts).not.toHaveBeenCalled()
    expect(field.value).toBe('巴黎便宜酒店   ')
  })
})
