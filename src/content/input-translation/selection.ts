export const MAX_INPUT_TEXT = 2000
type TextField = HTMLInputElement | HTMLTextAreaElement
interface BaseSelection {
  text: string
  x: number
  y: number
  whole?: boolean
}
export type InputSelection = BaseSelection &
  (
    | {
        kind: 'field'
        element: TextField
        value: string
        start: number
        end: number
      }
    | { kind: 'editable'; element: HTMLElement; html: string; range: Range }
  )

const chinese = /[\u3400-\u9fff]/
const unsafe =
  '.monaco-editor,.CodeMirror,.cm-editor,.ace_editor,.ProseMirror,[data-lexical-editor],.public-DraftEditor-content'

function activeElement(): Element | null {
  let element = document.activeElement
  while (element && element.shadowRoot && element.shadowRoot.activeElement)
    element = element.shadowRoot.activeElement
  return element
}

function isTextField(element: Element | null): element is TextField {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      /^(text|search)$/.test(element.type))
  )
}

function editableRoot(node: Node): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : node.parentElement
  const editor = element && element.closest<HTMLElement>('[contenteditable]')
  if (
    !editor ||
    !['', 'true', 'plaintext-only'].includes(
      editor.getAttribute('contenteditable') || ''
    ) ||
    editor.closest(unsafe)
  )
    return null
  return editor
}

/** Snapshot an entire focused draft, without changing the user's current selection. */
export function captureWholeInput(
  requireChinese = true
): InputSelection | null {
  const element = activeElement()
  if (isTextField(element)) {
    if (
      element.disabled ||
      element.readOnly ||
      element.closest(unsafe) ||
      /password|one-time-code/.test(element.autocomplete)
    )
      return null
    const text = element.value
    if (
      (requireChinese &&
        (!chinese.test(text) || text.length > MAX_INPUT_TEXT)) ||
      text.length > MAX_INPUT_TEXT + 4
    )
      return null
    const rect = element.getBoundingClientRect()
    return {
      kind: 'field',
      element,
      value: text,
      text,
      start: 0,
      end: text.length,
      whole: true,
      x: Math.min(rect.right, rect.left + 180),
      y: rect.bottom
    }
  }
  if (!element) return null
  const editor = editableRoot(element)
  if (!editor) return null
  const range = document.createRange()
  range.selectNodeContents(editor)
  const text = range.toString()
  if (
    (requireChinese && (!chinese.test(text) || text.length > MAX_INPUT_TEXT)) ||
    text.length > MAX_INPUT_TEXT + 4
  )
    return null
  const rect = editor.getBoundingClientRect()
  return {
    kind: 'editable',
    element: editor,
    text,
    range,
    html: editor.innerHTML,
    whole: true,
    x: Math.min(rect.right, rect.left + 180),
    y: rect.bottom
  }
}

export function captureInputSelection(point?: {
  x: number
  y: number
}): InputSelection | null {
  const element = activeElement()
  if (isTextField(element)) {
    if (element.disabled || element.readOnly || element.closest(unsafe))
      return null
    const start = element.selectionStart
    const end = element.selectionEnd
    if (start === null || end === null || end <= start) return null
    const text = element.value.slice(start, end)
    if (!chinese.test(text) || text.length > MAX_INPUT_TEXT) return null
    const rect = element.getBoundingClientRect()
    return {
      kind: 'field',
      element,
      value: element.value,
      start,
      end,
      text,
      x: point ? point.x : Math.min(rect.right, rect.left + 180),
      y: point ? point.y : rect.bottom
    }
  }
  const selected = window.getSelection()
  if (!selected || selected.rangeCount !== 1 || selected.isCollapsed)
    return null
  const range = selected.getRangeAt(0)
  const editor = editableRoot(range.startContainer)
  if (
    !editor ||
    editableRoot(range.endContainer) !== editor ||
    !editor.contains(range.commonAncestorContainer)
  )
    return null
  const text = range.toString()
  if (!chinese.test(text) || text.length > MAX_INPUT_TEXT) return null
  const rect = range.getBoundingClientRect()
  return {
    kind: 'editable',
    element: editor,
    html: editor.innerHTML,
    range: range.cloneRange(),
    text,
    x: point ? point.x : rect.right,
    y: point ? point.y : rect.bottom
  }
}

export function sameInputSelection(
  a: InputSelection | null,
  b: InputSelection | null
): boolean {
  if (!a || !b) return a === b
  if (a.element !== b.element || a.kind !== b.kind || a.text !== b.text)
    return false
  if (a.kind === 'field' && b.kind === 'field')
    return a.value === b.value && a.start === b.start && a.end === b.end
  if (a.kind === 'editable' && b.kind === 'editable')
    return (
      a.html === b.html &&
      a.range.startContainer === b.range.startContainer &&
      a.range.startOffset === b.range.startOffset &&
      a.range.endContainer === b.range.endContainer &&
      a.range.endOffset === b.range.endOffset
    )
  return false
}

export function selectionStillValid(selection: InputSelection): boolean {
  if (!selection.element.isConnected) return false
  const focused = activeElement()
  if (
    focused !== selection.element &&
    !(focused && selection.element.contains(focused)) &&
    !isMiloElement(focused)
  )
    return false
  if (selection.kind === 'field')
    return (
      isTextField(selection.element) &&
      !selection.element.disabled &&
      !selection.element.readOnly &&
      (selection.whole ||
        (selection.element.selectionStart === selection.start &&
          selection.element.selectionEnd === selection.end)) &&
      selection.element.value === selection.value &&
      selection.element.value.slice(selection.start, selection.end) ===
        selection.text
    )
  return (
    editableRoot(selection.range.startContainer) === selection.element &&
    selection.element.innerHTML === selection.html &&
    selection.range.toString() === selection.text
  )
}

/** Prefer native insertion so browser undo and controlled page inputs remain usable. */
export function replaceInputSelection(
  selection: InputSelection,
  replacement: string,
  preserveWhitespace = true
): void {
  if (preserveWhitespace)
    replacement =
      selection.text.match(/^\s*/)![0] +
      replacement.trim() +
      selection.text.match(/\s*$/)![0]
  if (!selectionStillValid(selection))
    throw new Error('输入内容已经变化，请重新选中文字')
  if (
    selection.kind === 'field' &&
    selection.element.hasAttribute('maxlength') &&
    selection.element.maxLength >= 0 &&
    selection.value.length -
      (selection.end - selection.start) +
      replacement.length >
      selection.element.maxLength
  )
    throw new Error('英文超出输入框长度限制')
  const element = selection.element
  element.focus({ preventScroll: true })
  if (!selectionStillValid(selection))
    throw new Error('输入内容已经变化，请重新选中文字')
  if (selection.kind === 'field')
    selection.element.setSelectionRange(selection.start, selection.end)
  else {
    const selected = window.getSelection()
    if (!selected) throw new Error('此输入框暂不支持替换')
    selected.removeAllRanges()
    selected.addRange(selection.range.cloneRange())
  }
  if (typeof document.execCommand === 'function') {
    try {
      document.execCommand(
        replacement ? 'insertText' : 'delete',
        false,
        replacement
      )
    } catch (_) {
      /* Fall back for standard fields when native insertion is unavailable. */
    }
    if (
      selection.kind === 'field'
        ? selection.element.value !== selection.value
        : selection.element.innerHTML !== selection.html
    )
      return
  }
  const before = new InputEvent('beforeinput', {
    bubbles: true,
    composed: true,
    cancelable: true,
    inputType: 'insertReplacementText',
    data: replacement
  })
  if (!element.dispatchEvent(before))
    throw new Error('网页阻止了替换，请重新选择或手动输入')
  if (!selectionStillValid(selection))
    throw new Error('输入内容已经变化，请重新选中文字')
  if (selection.kind === 'field') {
    const value =
      selection.value.slice(0, selection.start) +
      replacement +
      selection.value.slice(selection.end)
    if (
      selection.element.hasAttribute('maxlength') &&
      selection.element.maxLength >= 0 &&
      value.length > selection.element.maxLength
    )
      throw new Error('英文超出输入框长度限制')
    const prototype =
      selection.element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!
    setter.call(selection.element, value)
    const caret = selection.start + replacement.length
    selection.element.setSelectionRange(caret, caret)
  } else {
    const range = selection.range.cloneRange()
    range.deleteContents()
    const text = document.createTextNode(replacement)
    range.insertNode(text)
    range.setStartAfter(text)
    range.collapse(true)
    const selected = window.getSelection()
    if (selected) {
      selected.removeAllRanges()
      selected.addRange(range)
    }
  }
  element.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertReplacementText',
      data: replacement
    })
  )
}

function isMiloElement(element: Element | null): boolean {
  if (!element) return false
  if (element.closest('.milo-root,.milo-external')) return true
  const root = element.getRootNode()
  return root instanceof ShadowRoot ? isMiloElement(root.host) : false
}
