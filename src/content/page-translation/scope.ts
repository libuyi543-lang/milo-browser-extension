import { collectParagraphs, ReadingParagraph } from './paragraphs'

const X_HOST = /(^|\.)(x\.com|twitter\.com)$/i
const X_BODY =
  '[data-testid="tweetText"], [data-testid="twitterArticleRichTextView"]'
const OUTSIDE_READING =
  'nav,aside,[role="navigation"],[role="complementary"],[data-testid="sidebarColumn"]'

function outermost(roots: HTMLElement[]): HTMLElement[] {
  return roots.filter(
    root => !roots.some(other => other !== root && other.contains(root))
  )
}

/** Site-specific reading content is deliberately narrow; X never falls back to its whole UI. */
export function readingRoots(
  root: HTMLElement,
  hostname = window.location.hostname
): HTMLElement[] {
  if (hostname === 'docs.google.com')
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        '.kix-lineview-text-block,[role=document][contenteditable=false]'
      )
    )
  if (X_HOST.test(hostname)) {
    const primary =
      root.querySelector<HTMLElement>('[data-testid="primaryColumn"]') || root
    return outermost(
      Array.from(primary.querySelectorAll<HTMLElement>(X_BODY)).filter(
        element => !element.closest(OUTSIDE_READING)
      )
    )
  }
  const articleBodies = Array.from(
    root.querySelectorAll<HTMLElement>('[itemprop="articleBody"]')
  ).filter(element => !element.closest(OUTSIDE_READING))
  if (articleBodies.length) return outermost(articleBodies)

  const main = root.querySelector<HTMLElement>('main,[role="main"]') || root
  const articles = Array.from(
    main.querySelectorAll<HTMLElement>('article')
  ).filter(element => !element.closest(OUTSIDE_READING))
  if (articles.length) return outermost(articles)
  return [main]
}

export function collectReadingParagraphs(
  root: HTMLElement,
  hostname = window.location.hostname,
  target = 'zh-CN'
): ReadingParagraph[] {
  const seen = new Set<HTMLElement>()
  const visibility = new WeakMap<HTMLElement, boolean>()
  return readingRoots(root, hostname).reduce<ReadingParagraph[]>(
    (all, readingRoot) => {
      for (const paragraph of collectParagraphs(
        readingRoot,
        visibility,
        target
      )) {
        if (!seen.has(paragraph.element)) {
          seen.add(paragraph.element)
          all.push(paragraph)
        }
      }
      return all
    },
    []
  )
}
