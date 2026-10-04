import { SavedWordEntry } from '@/models/MiloWord'
import { setPageStyle } from './page-style'
import { SavedWords } from './saved-words'

const SKIP =
  'script,style,noscript,textarea,input,select,option,code,pre,kbd,samp,svg,canvas,[contenteditable]:not([contenteditable="false"]),[aria-hidden="true"],[hidden],[data-milo-translation],.milo-external,.milo-root,#milo-word-popup-root'
const WORD = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g
const HIGHLIGHT = 'milo-saved'
/** Enough for a long article; beyond this the page is a feed and more would only clutter it. */
const MAX_HITS = 1500
const HOVER_DELAY = 260

export const HIGHLIGHT_STYLE = `
::highlight(${HIGHLIGHT}){background-color:rgba(242,211,107,.28);text-decoration:underline dotted 2px #c49a1c;text-underline-offset:3px}
@media print{::highlight(${HIGHLIGHT}){background-color:transparent;text-decoration:none}}
`

const TIP_STYLE = `
:host{all:initial}
.tip{max-width:280px;padding:6px 10px 7px;border-radius:9px;background:#2f4636;color:#fff;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 4px 16px rgba(30,45,35,.22);animation:in .12s ease-out}
.word{font-weight:600;margin-right:6px}
.meta{display:block;margin-top:1px;color:#c9d8c4;font-size:11px}
@keyframes in{from{opacity:0;transform:translateY(-2px)}}
@media (prefers-reduced-motion:reduce){.tip{animation:none}}
`

export interface WordHit {
  node: Text
  start: number
  end: number
  entry: SavedWordEntry
}

type Matcher = Pick<SavedWords, 'match'>

/** Saved 学习中 words in the text under `root`, skipping code, inputs and Milo's own UI. */
export function findSavedWords(
  root: Node,
  saved: Matcher,
  limit = MAX_HITS
): WordHit[] {
  const hits: WordHit[] = []
  const check = (node: Text) => {
    const parent = node.parentElement
    if (!parent || parent.closest(SKIP)) return
    const text = node.data
    WORD.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WORD.exec(text)) && hits.length < limit) {
      const entry = saved.match(match[0])
      if (entry && entry.status === 'learning')
        hits.push({
          node,
          start: match.index,
          end: match.index + match[0].length,
          entry
        })
    }
  }
  if (root.nodeType === Node.TEXT_NODE) {
    check(root as Text)
    return hits
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return hits
  if ((root as Element).closest(SKIP)) return hits
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node =>
      /[A-Za-z]{2}/.test((node as Text).data)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
  })
  let current: Node | null
  while (hits.length < limit && (current = walker.nextNode()))
    check(current as Text)
  return hits
}

interface HighlightRegistry {
  set(name: string, value: unknown): void
  delete(name: string): void
}

/**
 * Marks saved words with the CSS Custom Highlight API, so the page's DOM is never
 * changed (frameworks keep working). Hovering a mark shows its meaning.
 */
export function setupWordHighlight(saved: SavedWords) {
  const registry: HighlightRegistry | undefined =
    typeof CSS !== 'undefined' ? (CSS as any).highlights : undefined
  const HighlightClass: any =
    typeof window !== 'undefined' ? (window as any).Highlight : undefined
  const supported = !!registry && typeof HighlightClass === 'function'
  const highlight = supported ? new HighlightClass() : null
  const byNode = new Map<Text, Array<{ range: Range; entry: SavedWordEntry }>>()
  let count = 0
  let enabled = false
  let observer: MutationObserver | null = null
  let pending = new Set<Node>()
  let flushTimer: number | undefined
  let tipHost: HTMLElement | null = null
  let tipTimer: number | undefined
  let tipRange: Range | null = null
  let frame = 0
  let queued = false
  let pointer = { x: 0, y: 0 }

  const add = (hits: WordHit[]) => {
    for (const hit of hits) {
      if (count >= MAX_HITS) break
      const range = document.createRange()
      range.setStart(hit.node, hit.start)
      range.setEnd(hit.node, hit.end)
      const list = byNode.get(hit.node) || []
      list.push({ range, entry: hit.entry })
      byNode.set(hit.node, list)
      count += 1
      if (highlight) highlight.add(range)
      // Only words a reader could actually see count as meeting them again.
      const parent = hit.node.parentElement
      if (parent && parent.getClientRects().length) saved.seen(hit.entry.word)
    }
  }

  const forget = (node: Text) => {
    const list = byNode.get(node)
    if (!list) return
    list.forEach(item => highlight && highlight.delete(item.range))
    count -= list.length
    byNode.delete(node)
  }

  const clear = () => {
    if (highlight) highlight.clear()
    byNode.clear()
    count = 0
  }

  const scanAll = () => {
    clear()
    if (enabled && document.body)
      add(findSavedWords(document.body, saved, MAX_HITS))
  }

  const flush = () => {
    flushTimer = undefined
    if (!enabled) return
    Array.from(byNode.keys()).forEach(node => {
      if (!node.isConnected) forget(node)
    })
    const nodes = Array.from(pending)
    pending = new Set()
    for (const node of nodes) {
      if (!node.isConnected || count >= MAX_HITS) continue
      if (node.nodeType === Node.TEXT_NODE) forget(node as Text)
      else {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
        let current: Node | null
        while ((current = walker.nextNode())) forget(current as Text)
      }
      add(findSavedWords(node, saved, MAX_HITS - count))
    }
  }

  const ownNode = (node: Node) => {
    const element = node instanceof Element ? node : node.parentElement
    return (
      !!element &&
      !!element.closest('.milo-external,.milo-root,[data-milo-translation]')
    )
  }

  const observe = () => {
    if (observer || !document.body) return
    observer = new MutationObserver(records => {
      for (const record of records) {
        if (ownNode(record.target)) continue
        if (record.type === 'characterData') pending.add(record.target)
        else record.addedNodes.forEach(node => pending.add(node))
      }
      if (!pending.size || flushTimer !== undefined) return
      flushTimer = window.setTimeout(flush, 500)
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true
    })
  }

  const hideTip = () => {
    if (tipTimer !== undefined) clearTimeout(tipTimer)
    tipTimer = undefined
    tipRange = null
    if (tipHost) tipHost.remove()
  }

  const showTip = (range: Range, entry: SavedWordEntry) => {
    const latest = saved.match(entry.word) || entry
    const rect = range.getBoundingClientRect()
    if (!tipHost) {
      tipHost = document.createElement('div')
      tipHost.className = 'milo-external'
      tipHost.dataset.miloWordTip = 'true'
      Object.assign(tipHost.style, {
        all: 'initial',
        position: 'fixed',
        zIndex: '2147483646',
        pointerEvents: 'none'
      })
      const root = tipHost.attachShadow({ mode: 'open' })
      const style = document.createElement('style')
      style.textContent = TIP_STYLE
      const tip = document.createElement('div')
      tip.className = 'tip'
      tip.setAttribute('role', 'tooltip')
      root.append(style, tip)
    }
    const tip = tipHost.shadowRoot!.querySelector('.tip')!
    tip.textContent = ''
    const word = document.createElement('span')
    word.className = 'word'
    word.textContent = latest.word
    const meta = document.createElement('span')
    meta.className = 'meta'
    meta.textContent = `单词本 · 学习中 · 遇见 ${latest.times} 次`
    tip.append(word, document.createTextNode(latest.meaning), meta)
    const below = rect.bottom + 70 < window.innerHeight
    Object.assign(tipHost.style, {
      left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 290))}px`,
      top: below ? `${rect.bottom + 6}px` : `${rect.top - 6}px`,
      transform: below ? 'none' : 'translateY(-100%)'
    })
    const parent = document.fullscreenElement || document.documentElement
    if (tipHost.parentElement !== parent) parent.appendChild(tipHost)
  }

  const inside = (range: Range, x: number, y: number) =>
    Array.from(range.getClientRects()).some(
      rect =>
        x >= rect.left - 1 &&
        x <= rect.right + 1 &&
        y >= rect.top - 1 &&
        y <= rect.bottom + 1
    )

  const hitAt = (x: number, y: number) => {
    const doc = document as any
    let node: Node | null = null
    let offset = 0
    if (doc.caretRangeFromPoint) {
      const caret = doc.caretRangeFromPoint(x, y)
      if (caret) {
        node = caret.startContainer
        offset = caret.startOffset
      }
    } else if (doc.caretPositionFromPoint) {
      const caret = doc.caretPositionFromPoint(x, y)
      if (caret) {
        node = caret.offsetNode
        offset = caret.offset
      }
    }
    const list = node && byNode.get(node as Text)
    if (!list) return null
    return (
      list.find(
        item =>
          offset >= item.range.startOffset &&
          offset <= item.range.endOffset &&
          inside(item.range, x, y)
      ) || null
    )
  }

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    pointer = { x: event.clientX, y: event.clientY }
    if (queued || !count) return
    queued = true
    frame = requestAnimationFrame(() => {
      frame = 0
      queued = false
      const hit = hitAt(pointer.x, pointer.y)
      if (hit && hit.range === tipRange) return
      hideTip()
      if (!hit) return
      tipRange = hit.range
      tipTimer = window.setTimeout(() => {
        tipTimer = undefined
        if (tipRange === hit.range) showTip(hit.range, hit.entry)
      }, HOVER_DELAY)
    })
  }

  const start = () => {
    if (enabled) return
    enabled = true
    if (highlight) {
      setPageStyle('highlight', HIGHLIGHT_STYLE)
      registry!.set(HIGHLIGHT, highlight)
    }
    scanAll()
    observe()
    document.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('scroll', hideTip, { passive: true, capture: true })
    document.addEventListener('pointerdown', hideTip, true)
  }

  const stop = () => {
    if (!enabled) return
    enabled = false
    hideTip()
    clear()
    if (observer) observer.disconnect()
    observer = null
    pending.clear()
    if (flushTimer !== undefined) clearTimeout(flushTimer)
    flushTimer = undefined
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    queued = false
    if (highlight) registry!.delete(HIGHLIGHT)
    setPageStyle('highlight', '')
    document.removeEventListener('pointermove', onMove)
    window.removeEventListener('scroll', hideTip, true)
    document.removeEventListener('pointerdown', hideTip, true)
  }

  const unsubscribe = saved.subscribe(() => {
    if (enabled) scanAll()
  })

  return {
    setEnabled(on: boolean) {
      if (on) start()
      else stop()
    },
    /** For tests: the words currently marked. */
    marked() {
      return Array.from(byNode.values()).flatMap(list =>
        list.map(item => item.range.toString())
      )
    },
    cleanup() {
      stop()
      unsubscribe()
      if (tipHost) tipHost.remove()
      tipHost = null
    }
  }
}
