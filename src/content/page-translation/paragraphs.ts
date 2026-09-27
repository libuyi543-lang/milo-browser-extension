const SKIP =
  'script,style,noscript,iframe,svg,canvas,pre,code,input,textarea,select,button,form,nav,aside,body>header,body>footer,[role="button"],[role="menu"],[role="menubar"],[role="tablist"],[role="navigation"],[role="complementary"],[role="banner"],[role="contentinfo"],[data-testid="tweet-text-show-more-link"],[contenteditable]:not([contenteditable="false"]),[translate="no"],[hidden],[aria-hidden="true"],[data-milo-translation],#milo-word-popup-root,.milo-external'
const SEMANTIC = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th,dt,dd'
const BLOCK = /^(DIV|SECTION|ARTICLE|MAIN|ASIDE|HEADER|FOOTER|NAV|BODY)$/
export interface ReadingParagraph {
  element: HTMLElement
  text: string
  nodes: Text[]
}
export const cleanText = (text: string) => text.replace(/\s+/g, ' ').trim()

export function isEnglishText(text: string) {
  const latin = (text.match(/[a-z]/gi) || []).length
  const chinese = (text.match(/[\u3400-\u9fff]/g) || []).length
  return latin >= 3 && latin / (latin + chinese || 1) > 0.7
}
export function isReadingText(text: string, target = 'zh-CN') {
  const letters = (text.match(/\p{L}/gu) || []).length
  if (letters < 3) return false
  const han = (text.match(/\p{Script=Han}/gu) || []).length
  const latin = (text.match(/\p{Script=Latin}/gu) || []).length
  if (/^zh/.test(target) && letters === han + latin) return isEnglishText(text)
  if (target === 'ja' && /[\u3040-\u30ff]/.test(text)) return false
  if (target === 'ko' && /[\uac00-\ud7af]/.test(text)) return false
  return true
}

function visible(
  element: HTMLElement,
  cache: WeakMap<HTMLElement, boolean>
): boolean {
  const path: HTMLElement[] = []
  let current: HTMLElement | null = element
  let result = true
  while (current) {
    const known = cache.get(current)
    if (known !== undefined) {
      result = known
      break
    }
    path.push(current)
    const style = getComputedStyle(current)
    if (
      (style.display === 'none' &&
        current.dataset.miloSourceHidden !== 'true') ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse'
    ) {
      result = false
      break
    }
    current = current.parentElement
  }
  path.forEach(item => cache.set(item, result))
  return result
}

export function collectParagraphs(
  root: HTMLElement,
  visibility = new WeakMap<HTMLElement, boolean>(),
  target = 'zh-CN'
): ReadingParagraph[] {
  const groups = new Map<HTMLElement, Text[]>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current: Node | null
  while ((current = walker.nextNode())) {
    const node = current as Text
    const parent = node.parentElement
    if (!parent || !node.data.trim() || parent.closest(SKIP)) continue
    if (!visible(parent, visibility)) continue
    let paragraph = parent.closest<HTMLElement>(SEMANTIC)
    if (!paragraph || !root.contains(paragraph)) {
      paragraph = parent
      while (
        paragraph.parentElement &&
        paragraph !== root &&
        !BLOCK.test(paragraph.tagName)
      )
        paragraph = paragraph.parentElement
    }
    const nodes = groups.get(paragraph) || []
    nodes.push(node)
    groups.set(paragraph, nodes)
  }
  return Array.from(groups, ([element, nodes]) => ({
    element,
    nodes,
    text: cleanText(nodes.map(node => node.data).join(''))
  })).filter(item => isReadingText(item.text, target))
}

export function splitParagraph(text: string, limit = 2800): string[] {
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > limit) {
    const prefix = remaining.slice(0, limit)
    const punctuation = Math.max(
      prefix.lastIndexOf('. '),
      prefix.lastIndexOf('? '),
      prefix.lastIndexOf('! ')
    )
    const boundary =
      punctuation > limit / 2 ? punctuation + 1 : prefix.lastIndexOf(' ')
    const cut = boundary > 0 ? boundary : limit
    chunks.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

export function insertTranslation(
  paragraph: ReadingParagraph,
  text: string
): HTMLElement | null {
  if (
    !paragraph.element.isConnected ||
    paragraph.nodes.some(
      node => !node.isConnected || !paragraph.element.contains(node)
    ) ||
    cleanText(paragraph.nodes.map(node => node.data).join('')) !==
      paragraph.text
  )
    return null
  const element = paragraph.element
  const translated = document.createElement('div')
  translated.dataset.miloTranslation = 'true'
  translated.setAttribute('translate', 'no')
  translated.lang = 'zh-CN'
  translated.textContent = text
  const sourceStyle = getComputedStyle(element)
  Object.assign(translated.style, {
    display: 'block',
    color: sourceStyle.color,
    fontFamily: sourceStyle.fontFamily,
    fontSize: sourceStyle.fontSize,
    fontWeight: '400',
    lineHeight: '1.7',
    textAlign: sourceStyle.textAlign,
    whiteSpace: 'pre-wrap',
    marginTop: '0.5em',
    marginBottom: '0.8em',
    opacity: '0.88',
    width: 'auto',
    height: 'auto',
    maxWidth: '100%',
    background: 'none',
    border: '0'
  })
  const parentDisplay = element.parentElement
    ? getComputedStyle(element.parentElement).display
    : ''
  if (
    /^(LI|TD|TH|DD|DT|BODY)$/.test(element.tagName) ||
    /flex|grid/.test(parentDisplay)
  )
    element.appendChild(translated)
  else element.insertAdjacentElement('afterend', translated)
  return translated
}
