/**
 * Page-level CSS that cannot live in a shadow root: ::highlight() rules and the
 * learning-mode blur on inserted translations. A constructed sheet is used where
 * possible so strict style-src policies do not block it.
 */
const blocks = new Map<string, string>()
let sheet: CSSStyleSheet | null = null
let element: HTMLStyleElement | null = null

export function setPageStyle(name: string, css: string) {
  if (css) blocks.set(name, css)
  else blocks.delete(name)
  const text = Array.from(blocks.values()).join('\n')
  const doc = document as Document & { adoptedStyleSheets?: CSSStyleSheet[] }
  try {
    if (
      doc.adoptedStyleSheets &&
      (CSSStyleSheet.prototype as any).replaceSync
    ) {
      if (!sheet) sheet = new CSSStyleSheet()
      ;(sheet as any).replaceSync(text)
      // The page may have replaced the list since; put the sheet back if so.
      if (!doc.adoptedStyleSheets.includes(sheet))
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet]
      return
    }
  } catch (_) {
    // Fall through to a <style> element.
  }
  if (!element) {
    element = document.createElement('style')
    element.dataset.miloStyle = 'true'
  }
  element.textContent = text
  if (!element.isConnected) document.documentElement.appendChild(element)
}

export const LEARNING_STYLE = `
[data-milo-translation][data-milo-bilingual]{transition:filter .18s ease-out}
[data-milo-translation][data-milo-bilingual]:not(:hover):not(:focus){filter:blur(5px);cursor:help}
@media (prefers-reduced-motion:reduce){[data-milo-translation][data-milo-bilingual]{transition:none}}
@media print{[data-milo-translation][data-milo-bilingual]{filter:none!important}}
`

export function setLearningMode(on: boolean) {
  setPageStyle('learning', on ? LEARNING_STYLE : '')
}
