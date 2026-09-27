import { getPreferences, translateText } from '@/services/translation/general'
import { cancelTranslation } from '@/services/translation/cancel'
import { collectReadingParagraphs } from './page-translation/scope'
import { insertTranslation } from './page-translation/paragraphs'
import { isExtensionContextValid } from '@/_helpers/extension-lifecycle'
export function setupHoverTranslation() {
  let hovered: Element | null = null
  const inserted = new Map<HTMLElement, HTMLElement>()
  const pending = new Map<HTMLElement, string>()
  let disposed = false
  const move = (event: MouseEvent) => {
    hovered =
      (event
        .composedPath()
        .find(node => node instanceof HTMLElement) as Element) || null
  }
  const key = async (event: KeyboardEvent) => {
    if (
      !event.isTrusted ||
      event.key !== 'Control' ||
      event.repeat ||
      !hovered ||
      !isExtensionContextValid() ||
      hovered.closest(
        'input,textarea,[contenteditable],.milo-root,.milo-external'
      )
    )
      return
    const element = hovered
    const prefs = await getPreferences().catch(() => null)
    if (!prefs || !prefs.hover || disposed) return
    const paragraph = collectReadingParagraphs(
      document.body,
      window.location.hostname,
      prefs.target
    ).find(item => item.element.contains(element))
    if (!paragraph) return
    const old = inserted.get(paragraph.element)
    if (old) {
      old.remove()
      inserted.delete(paragraph.element)
      return
    }
    if (pending.has(paragraph.element)) {
      cancelTranslation(pending.get(paragraph.element)!).catch(() => undefined)
      pending.delete(paragraph.element)
      return
    }
    if (
      paragraph.element.nextElementSibling &&
      (paragraph.element.nextElementSibling as HTMLElement).dataset
        .miloTranslation
    )
      return
    const session = `hover_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`
    pending.set(paragraph.element, session)
    try {
      const chunks = paragraph.text.match(/[\s\S]{1,6000}/g) || []
      const results: string[] = []
      for (const chunk of chunks)
        results.push(await translateText(chunk, prefs.target, session))
      if (disposed || pending.get(paragraph.element) !== session) return
      const node = insertTranslation(paragraph, results.join('\n'))
      if (node) {
        node.lang = prefs.target
        inserted.set(paragraph.element, node)
      }
    } catch (_) {
      /* A second Control tap or page restore can cancel this local reading request. */
    } finally {
      if (pending.get(paragraph.element) === session)
        pending.delete(paragraph.element)
    }
  }
  const clear = () => {
    pending.forEach(id => cancelTranslation(id).catch(() => undefined))
    pending.clear()
    inserted.forEach(node => node.remove())
    inserted.clear()
  }
  document.addEventListener('mousemove', move, true)
  document.addEventListener('keydown', key, true)
  return {
    clear,
    cleanup: () => {
      disposed = true
      clear()
      document.removeEventListener('mousemove', move, true)
      document.removeEventListener('keydown', key, true)
    }
  }
}
