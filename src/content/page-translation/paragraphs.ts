const SKIP =
  'script,style,noscript,iframe,svg,canvas,pre,code,input,textarea,select,button,form,nav,aside,body>header,body>footer,[role="button"],[role="menu"],[role="menubar"],[role="tablist"],[role="navigation"],[role="complementary"],[role="banner"],[role="contentinfo"],[data-testid="tweet-text-show-more-link"],[contenteditable]:not([contenteditable="false"]),[translate="no"],[hidden],[aria-hidden="true"],[data-milo-translation],#milo-word-popup-root,.milo-external'
const SEMANTIC = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th,dt,dd'
const BLOCK = /^(DIV|SECTION|ARTICLE|MAIN|ASIDE|HEADER|FOOTER|NAV|DETAILS|BODY)$/
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

/**
 * Where the caption goes. Normally inside the paragraph, but when the paragraph
 * is a container rather than a text element — a `<details>` whose text lives in
 * its `<summary>`, for instance — the caption belongs after the text's own
 * block so it stays inside the container instead of escaping the layout.
 */
function captionAnchor(element: HTMLElement, nodes: Text[]): HTMLElement {
  if (SEMANTIC.split(',').includes(element.tagName)) return element
  const parent = nodes[0] && nodes[0].parentElement
  if (parent && parent !== element && isBlockLevel(parent)) return parent
  return element
}

/**
 * A grid or flex container turns its children into blocks, so an inline
 * `<span>` inside one computes as block-level. The caption still must not land
 * there: as a grid item in a two-column row it would be squeezed into the
 * narrow column, which is the very layout the caption is supposed to span.
 */
function isBlockLevel(element: HTMLElement) {
  const display = getComputedStyle(element).display
  if (display === 'inline' || display === 'contents') return false
  const parent = element.parentElement
  return !!parent && !/grid|flex/.test(getComputedStyle(parent).display)
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

const GENERIC_FAMILY = /(?:^|,)\s*(?:sans-serif|serif|system-ui|ui-sans-serif|ui-serif|monospace|-apple-system)\s*$/i
/** Chinese needs its own faces; a heading's Latin stack alone falls back badly. */
const CJK_FALLBACK =
  '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif'

/**
 * The translation is a caption for the paragraph, not a copy of it. A heading's
 * own size would make the caption read like a second headline, so the size is
 * pulled back to whatever the surrounding text actually uses.
 */
function captionSize(element: HTMLElement, inside: boolean) {
  const own = parseFloat(getComputedStyle(element).fontSize) || 16
  if (inside) return own
  const parent = element.parentElement
  const context = parent ? parseFloat(getComputedStyle(parent).fontSize) : 0
  return context > 0 ? Math.min(own, context) : own
}

/** Keeps a heading's tight leading without letting it collapse on small text. */
function captionLeading(style: CSSStyleDeclaration, size: number) {
  const leading = parseFloat(style.lineHeight)
  const ratio = isFinite(leading) && leading > 0 ? leading / size : 1.6
  return String(Math.min(1.8, Math.max(1.4, ratio)))
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
  const anchor = captionAnchor(element, paragraph.nodes)
  const translated = document.createElement('div')
  translated.dataset.miloTranslation = 'true'
  translated.setAttribute('translate', 'no')
  translated.lang = 'zh-CN'
  translated.textContent = text
  const sourceStyle = getComputedStyle(element)
  // A caption placed inside its own container has to claim a whole row: the
  // container may be a grid or flex layout that would otherwise squeeze it into
  // one narrow column beside the text it translates.
  const containerDisplay = getComputedStyle(anchor).display
  const inside =
    /^(LI|TD|TH|DD|DT|BODY)$/.test(anchor.tagName) ||
    /flex|grid/.test(
      anchor.parentElement ? getComputedStyle(anchor.parentElement).display : ''
    )
  const ownGrid = /grid/.test(containerDisplay)
  const size = captionSize(element, inside)
  const family = sourceStyle.fontFamily.replace(GENERIC_FAMILY, '').trim()
  Object.assign(translated.style, {
    display: 'block',
    color: sourceStyle.color,
    fontFamily: `${family ? family + ',' : ''}${CJK_FALLBACK}`,
    fontSize: `${size}px`,
    fontWeight: '400',
    fontStyle: 'normal',
    fontVariant: 'normal',
    lineHeight: captionLeading(sourceStyle, size),
    textAlign: sourceStyle.textAlign,
    // Indent and tracking belong to the source language's typography.
    textIndent: '0',
    letterSpacing: 'normal',
    wordSpacing: 'normal',
    textTransform: 'none',
    textDecoration: 'none',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    margin: inside ? '0.3em 0 0' : '0.35em 0 0',
    padding: '0',
    opacity: '0.88',
    width: 'auto',
    height: 'auto',
    maxWidth: '100%',
    background: 'none',
    border: '0',
    // 独占一整行，别被容器塞进标题旁边那条窄列。
    ...(ownGrid ? { gridColumn: '1 / -1' } : {}),
    ...(inside && !ownGrid && /flex/.test(containerDisplay)
      ? { flexBasis: '100%' }
      : {})
  })
  if (inside) anchor.appendChild(translated)
  else anchor.insertAdjacentElement('afterend', translated)
  return translated
}
