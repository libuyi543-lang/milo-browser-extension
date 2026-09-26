import { captureInputSelection, replaceInputSelection, selectionStillValid, MAX_INPUT_TEXT } from '@/content/input-translation/selection'

describe('input selection and safe replacement', () => {
  const originalRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect')
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ right: 180, bottom: 100 }) })
  })
  afterEach(() => {
    document.body.innerHTML = ''; window.getSelection()!.removeAllRanges(); jest.useRealTimers()
    if (originalRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalRect)
    else delete (Range.prototype as any).getBoundingClientRect
  })

  function field(tag = 'textarea') {
    const element = document.createElement(tag) as HTMLTextAreaElement
    document.body.appendChild(element); element.value = '前缀 便宜酒店 后缀'; element.focus(); element.setSelectionRange(3, 7)
    return element
  }

  it.each(['textarea', 'input'])('replaces only the selected part of a %s and emits an input update', tag => {
    const element = field(tag)
    const selection = captureInputSelection()!
    expect(selection.text).toBe('便宜酒店')
    const listener = jest.fn()
    element.addEventListener('input', listener)
    replaceInputSelection(selection, 'cheap hotels')
    expect(element.value).toBe('前缀 cheap hotels 后缀')
    expect(element.selectionStart).toBe(15)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].type).toBe('input')
  })

  it.each(['edited', 'moved', 'focus', 'removed', 'readonly', 'password'])('refuses a stale selection when %s', change => {
    const element = field('input')
    const selection = captureInputSelection()!
    if (change === 'edited') element.value += '新增文字'
    if (change === 'moved') element.setSelectionRange(0, 2)
    if (change === 'focus') { const another = document.createElement('input'); document.body.appendChild(another); another.focus() }
    if (change === 'removed') element.remove()
    if (change === 'readonly') element.readOnly = true
    if (change === 'password') (element as any).type = 'password'
    const value = element.value
    expect(selectionStillValid(selection)).toBe(false)
    expect(() => replaceInputSelection(selection, 'hotels')).toThrow('变化')
    expect(element.value).toBe(value)
  })

  it('does not collect password fields, English-only selections or overlong drafts', () => {
    const element = field('input') as any
    element.type = 'password'; expect(captureInputSelection()).toBeNull()
    element.type = 'text'; element.value = 'English only'; element.setSelectionRange(0, 7); expect(captureInputSelection()).toBeNull()
    element.value = '中'.repeat(MAX_INPUT_TEXT + 1); element.select(); expect(captureInputSelection()).toBeNull()
  })

  it('honors a page beforeinput veto and prevents maxlength truncation', () => {
    const element = field()
    const selection = captureInputSelection()!
    const veto = (event: Event) => event.preventDefault()
    element.addEventListener('beforeinput', veto)
    expect(() => replaceInputSelection(selection, 'hotels')).toThrow('阻止')
    expect(element.value).toBe('前缀 便宜酒店 后缀')
    element.removeEventListener('beforeinput', veto)
    element.maxLength = 10
    expect(() => replaceInputSelection(selection, 'cheap hotels')).toThrow('长度')
    expect(element.value).toBe('前缀 便宜酒店 后缀')
  })

  it('preserves surrounding editable nodes and inserts the response as plain text', () => {
    const element = document.createElement('div'); element.setAttribute('contenteditable', 'true'); element.tabIndex = 0
    element.innerHTML = '前缀 <b>便宜</b><i>酒店</i> 后缀'; document.body.appendChild(element); element.focus()
    const range = document.createRange(); range.setStart(element.querySelector('b')!.firstChild!, 0); range.setEnd(element.querySelector('i')!.firstChild!, 2)
    window.getSelection()!.addRange(range)
    const selection = captureInputSelection()!
    expect(selection.text).toBe('便宜酒店')
    replaceInputSelection(selection, 'cheap hotels <img src=x>')
    expect(element.textContent).toBe('前缀 cheap hotels <img src=x> 后缀')
    expect(element.querySelector('img')).toBeNull()
  })

})
