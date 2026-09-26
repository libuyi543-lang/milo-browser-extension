import {
  captureWholeInput,
  InputSelection,
  replaceInputSelection,
  selectionStillValid
} from './selection'
import {
  invalidateExtensionContext,
  isExtensionContextValid
} from '@/_helpers/extension-lifecycle'

interface Gesture {
  original: InputSelection
  start: number
  end: number
  count: number
  last: number
}
const TAP_GAP = 1200

function caret(draft: InputSelection): { start: number; end: number } | null {
  if (draft.kind === 'field') {
    const start = draft.element.selectionStart
    const end = draft.element.selectionEnd
    return start === null || end === null ? null : { start, end }
  }
  const selected = window.getSelection()
  if (!selected || selected.rangeCount !== 1 || !selected.isCollapsed)
    return null
  const range = selected.getRangeAt(0)
  if (!draft.element.contains(range.startContainer)) return null
  const prefix = document.createRange()
  prefix.selectNodeContents(draft.element)
  prefix.setEnd(range.startContainer, range.startOffset)
  const offset = prefix.toString().length
  return { start: offset, end: offset }
}

function matches(gesture: Gesture, draft: InputSelection | null): boolean {
  if (
    !draft ||
    draft.kind !== gesture.original.kind ||
    draft.element !== gesture.original.element
  )
    return false
  const expected =
    gesture.original.text.slice(0, gesture.start) +
    ' '.repeat(gesture.count) +
    gesture.original.text.slice(gesture.end)
  const current = caret(draft)
  // Contenteditable may use NBSP for consecutive visible spaces.
  return (
    draft.text.replace(/\u00a0/g, ' ') === expected.replace(/\u00a0/g, ' ') &&
    !!current &&
    current.start === gesture.start + gesture.count &&
    current.end === current.start
  )
}

function textPosition(editor: HTMLElement, offset: number): [Node, number] {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const length = node.textContent!.length
    if (offset <= length) return [node, offset]
    offset -= length
  }
  throw new Error('输入内容已经变化，请重试')
}

/** Delete only the gesture's own spaces; restore any text selected before the first tap. */
function restoreDraft(gesture: Gesture, draft: InputSelection) {
  const restored = gesture.original.text.slice(gesture.start, gesture.end)
  if (draft.kind === 'field') {
    const start = gesture.start
    const end = start + 2
    draft.element.setSelectionRange(start, end)
    replaceInputSelection(
      {
        ...draft,
        whole: false,
        start,
        end,
        text: draft.value.slice(start, end)
      },
      restored,
      false
    )
  } else {
    const range = document.createRange()
    const start = textPosition(draft.element, gesture.start)
    const end = textPosition(draft.element, gesture.start + 2)
    range.setStart(...start)
    range.setEnd(...end)
    replaceInputSelection(
      { ...draft, whole: false, range, text: range.toString() },
      '',
      false
    )
  }
}

/** Three distinct space taps, only in editable Chinese drafts. Ordinary spaces remain native. */
export function setupTripleSpaceTranslation(
  onDraft: (draft: InputSelection | null) => void,
  allowSynthetic = false
): () => void {
  let gesture: Gesture | null = null
  let current: InputSelection | null = null
  let composing = false
  const close = () => {
    if (current) {
      current = null
      onDraft(null)
    }
  }
  const onKey = (event: KeyboardEvent) => {
    // Web pages must not be able to manufacture billable shortcut gestures.
    if (!event.isTrusted && !allowSynthetic) return
    if (!isExtensionContextValid()) {
      invalidateExtensionContext()
      return
    }
    if (event.key === 'Escape') {
      gesture = null
      close()
      return
    }
    if (
      event.key !== ' ' ||
      event.repeat ||
      event.isComposing ||
      composing ||
      event.keyCode === 229 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    ) {
      gesture = null
      return
    }
    const draft = captureWholeInput(false)
    const now = Date.now()
    if (!gesture || now - gesture.last > TAP_GAP || !matches(gesture, draft)) {
      const original = captureWholeInput()
      const position = original && caret(original)
      gesture =
        original && position
          ? { original, ...position, count: 1, last: now }
          : null
      return
    }
    gesture.last = now
    if (gesture.count === 1) {
      gesture.count = 2
      return
    }
    const completed = gesture
    gesture = null
    event.preventDefault()
    event.stopImmediatePropagation()
    try {
      restoreDraft(completed, draft!)
      const restored = captureWholeInput()
      if (!restored || restored.text !== completed.original.text) return
      current = restored
      onDraft(restored)
    } catch (_) {
      close()
    }
  }
  const onInput = () => {
    if (current && !selectionStillValid(current)) close()
  }
  const onCompositionStart = () => {
    composing = true
    gesture = null
    close()
  }
  const onCompositionEnd = () => {
    composing = false
    gesture = null
  }
  const onBlur = () => {
    gesture = null
    close()
  }
  const onFocusOut = () => {
    gesture = null
    if (current && !selectionStillValid(current)) close()
  }
  document.addEventListener('keydown', onKey, true)
  document.addEventListener('input', onInput, true)
  document.addEventListener('compositionstart', onCompositionStart, true)
  document.addEventListener('compositionend', onCompositionEnd, true)
  document.addEventListener('focusout', onFocusOut, true)
  window.addEventListener('blur', onBlur)
  return () => {
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('input', onInput, true)
    document.removeEventListener('compositionstart', onCompositionStart, true)
    document.removeEventListener('compositionend', onCompositionEnd, true)
    document.removeEventListener('focusout', onFocusOut, true)
    window.removeEventListener('blur', onBlur)
    gesture = null
    current = null
  }
}
