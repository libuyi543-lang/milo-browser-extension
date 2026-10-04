import {
  ParagraphItem,
  translateParagraphs,
  cancelPageTranslation
} from '@/services/translation/paragraphs'
import { MAX_PARAGRAPHS } from '@/services/translation/limits'
import { Cue, cueAt, tokenize } from './timedtext'
import { SavedWords } from './saved-words'

/** A subtitle word the user wants to look up, with where it was heard. */
export interface SubtitleWord {
  word: string
  sentence: string
  title: string
  url: string
  x: number
  y: number
}

type Translate = (
  items: readonly ParagraphItem[],
  sessionId?: string
) => Promise<readonly ParagraphItem[]>

interface Options {
  video: HTMLVideoElement
  cues: Cue[]
  videoId: string
  onWord: (word: SubtitleWord) => void
  onStatus: (status: string) => void
  translate?: Translate
  cancel?: (sessionId: string) => void
  saved?: Pick<SavedWords, 'match' | 'seen' | 'subscribe'>
  learning?: () => boolean
}

/** Translate this many lines ahead of playback; the rest waits until it is near. */
const LOOKAHEAD = 40
/** One request may not carry more paragraphs than the background accepts. */
const BATCH = MAX_PARAGRAPHS
const DWELL = 450
/** Space the word card needs below the subtitle (card height plus gaps). */
const CARD_ROOM = 290
export const READY_STATUS = '双语字幕已开启 · 鼠标移到字幕上暂停，点单词查词'

const STYLE = `
:host{all:initial}
*{box-sizing:border-box}
.box{pointer-events:auto;display:inline-block;max-width:100%;padding:5px 14px 7px;border-radius:8px;background:rgba(16,24,19,.76);color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.42;text-align:center;transition:background-color .15s ease-out;cursor:default}
.box:hover{background:rgba(16,24,19,.9)}
.box[hidden]{display:none}
.source{font-weight:500;overflow-wrap:anywhere}
.w{padding:0 1px;border-radius:4px;cursor:pointer;transition:background-color .12s,color .12s}
.w.saved{box-shadow:inset 0 -.14em #e8c34f;color:#fff6d6}
.w:hover,.w[data-active=true]{background:#f2d36b;color:#1b281e;box-shadow:none}
.target{margin-top:2px;font-size:.8em;color:#d6e4d0;overflow-wrap:anywhere;transition:filter .18s ease-out}
:host([data-learning]) .box:not(:hover) .target:not([data-pending=true]){filter:blur(.32em)}
.target:empty{display:none}
.target[data-pending=true]{opacity:.45}
@media (prefers-reduced-motion:reduce){.box,.w,.target{transition:none}}
@media print{.box{display:none}}
`

export function createInteractiveSubtitles(options: Options) {
  const { video, cues, videoId, onWord, onStatus, saved } = options
  const translate = options.translate || translateParagraphs
  const cancel =
    options.cancel ||
    ((id: string) => {
      cancelPageTranslation(id).catch(() => undefined)
    })
  const translations = new Map<number, string>()
  let current = -2
  let painted = ''
  let destroyed = false
  let busy = false
  let session = ''
  let failedUntil = 0
  let inside = false
  let cardOpen = false
  let pausedByUs = false
  let dwell: number | undefined
  /** The looked-up word, kept marked when the line is repainted. */
  let active: { cue: number; word: number } | null = null

  const host = document.createElement('div')
  host.className = 'milo-external'
  host.dataset.miloSubtitles = 'true'
  host.dataset.miloInteractive = 'true'
  Object.assign(host.style, {
    all: 'initial',
    position: 'fixed',
    zIndex: '2147483646',
    pointerEvents: 'none',
    textAlign: 'center'
  })
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = STYLE
  const box = document.createElement('div')
  box.className = 'box'
  box.hidden = true
  const source = document.createElement('div')
  source.className = 'source'
  source.lang = 'en'
  const target = document.createElement('div')
  target.className = 'target'
  target.lang = 'zh-CN'
  box.append(source, target)
  root.append(style, box)

  const time = () => (Number(video.currentTime) || 0) * 1000

  /** The line on screen, or the next one during a pause between lines. */
  const anchor = () => {
    const now = time()
    const index = cueAt(cues, now)
    if (index >= 0) return index
    let low = 0
    let high = cues.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (cues[middle].start <= now) low = middle + 1
      else high = middle
    }
    return Math.min(low, cues.length - 1)
  }

  const resume = () => {
    if (!pausedByUs) return
    pausedByUs = false
    if (destroyed || !video.paused) return
    const played = video.play()
    if (played && typeof played.catch === 'function')
      played.catch(() => undefined)
  }

  const clearDwell = () => {
    if (dwell !== undefined) clearTimeout(dwell)
    dwell = undefined
  }

  const position = () => {
    const parent = document.fullscreenElement || document.documentElement
    if (host.parentElement !== parent) parent.appendChild(host)
    const rect = video.getBoundingClientRect()
    const visible =
      rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight
    host.style.display = visible ? 'block' : 'none'
    if (!visible) return
    const bottom = Math.max(54, rect.height * 0.12)
    Object.assign(host.style, {
      left: `${rect.left + rect.width * 0.05}px`,
      width: `${rect.width * 0.9}px`,
      top: `${rect.bottom - bottom}px`,
      transform: 'translateY(-100%)',
      fontSize: `${Math.round(Math.min(30, Math.max(15, rect.width / 38)))}px`
    })
  }

  const render = () => {
    const cue = cues[current]
    const translation = cue ? translations.get(current) : undefined
    const key = `${current}|${
      translation === undefined ? '' : translation
    }|${failedUntil > 0}`
    if (key === painted) return
    painted = key
    if (!cue) {
      box.hidden = true
      source.textContent = ''
      target.textContent = ''
      return
    }
    box.hidden = false
    source.textContent = ''
    for (const token of tokenize(cue.text)) {
      if (!token.word) {
        source.appendChild(document.createTextNode(token.text))
        continue
      }
      const word = document.createElement('span')
      word.className = 'w'
      word.textContent = token.text
      const entry = saved && saved.match(token.text)
      if (entry && entry.status === 'learning') {
        word.classList.add('saved')
        word.title = `单词本 · ${entry.meaning}`
        saved!.seen(entry.word)
      }
      source.appendChild(word)
    }
    if (active && active.cue === current) {
      const word = source.querySelectorAll<HTMLElement>('.w')[active.word]
      if (word) word.dataset.active = 'true'
    }
    const pending = translation === undefined
    target.dataset.pending = String(pending)
    target.textContent = pending ? (failedUntil ? '' : '…') : translation!
  }

  const pump = async (): Promise<void> => {
    if (busy || destroyed || !cues.length || Date.now() < failedUntil) return
    const from = Math.max(0, anchor() - 1)
    const batch: number[] = []
    let length = 0
    for (
      let index = from;
      index < cues.length && index < from + LOOKAHEAD && batch.length < BATCH;
      index++
    ) {
      if (translations.has(index)) continue
      if (length + cues[index].text.length > 3000 && batch.length) break
      batch.push(index)
      length += cues[index].text.length
    }
    if (!batch.length) return
    busy = true
    session = `subtitle_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`
    let ok = false
    try {
      const result = await translate(
        batch.map(index => ({ id: String(index), text: cues[index].text })),
        session
      )
      if (destroyed) return
      const byId = new Map(result.map(item => [item.id, item.text]))
      // A missing line stays blank instead of being requested again and again.
      batch.forEach(index =>
        translations.set(index, (byId.get(String(index)) || '').trim())
      )
      if (failedUntil) onStatus(READY_STATUS)
      failedUntil = 0
      ok = true
    } catch (error) {
      if (destroyed) return
      failedUntil = Date.now() + 10000
      onStatus(
        `字幕翻译失败：${(error && error.message) || '请稍后重试'} · 将自动重试`
      )
    } finally {
      busy = false
      session = ''
    }
    render()
    if (ok) return pump()
  }

  const tick = () => {
    if (destroyed) return
    position()
    const learning = !!options.learning && options.learning()
    if (learning !== host.hasAttribute('data-learning'))
      host.toggleAttribute('data-learning', learning)
    const index = cueAt(cues, time())
    if (index !== current) {
      current = index
      render()
    }
    pump().catch(() => undefined)
  }

  const open = (element: HTMLElement) => {
    const cue = cues[current]
    const word = (element.textContent || '').replace(/’/g, "'")
    if (!cue || !word) return
    clearDwell()
    source
      .querySelectorAll<HTMLElement>('.w[data-active=true]')
      .forEach(node => delete node.dataset.active)
    element.dataset.active = 'true'
    active = {
      cue: current,
      word: Array.from(source.querySelectorAll('.w')).indexOf(element)
    }
    cardOpen = true
    const rect = element.getBoundingClientRect()
    const line = box.getBoundingClientRect()
    // Anchor the card to the whole subtitle so it never covers the translation.
    const below = line.bottom + CARD_ROOM <= window.innerHeight
    onWord({
      word,
      sentence: cue.text,
      title: document.title.replace(/\s*-\s*YouTube\s*$/, ''),
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(
        videoId
      )}&t=${Math.floor(cue.start / 1000)}s`,
      x: rect.left,
      y: below ? line.bottom : line.top
    })
  }

  box.addEventListener('pointerenter', () => {
    inside = true
    if (!video.paused) {
      video.pause()
      pausedByUs = true
    }
  })
  box.addEventListener('pointerleave', () => {
    inside = false
    clearDwell()
    if (!cardOpen) resume()
  })
  box.addEventListener('pointerover', event => {
    const element = event.target as HTMLElement
    if (!element.classList || !element.classList.contains('w')) return
    clearDwell()
    dwell = window.setTimeout(() => open(element), DWELL)
  })
  box.addEventListener('pointerout', clearDwell)
  box.addEventListener('click', event => {
    const element = event.target as HTMLElement
    if (event.isTrusted && element.classList && element.classList.contains('w'))
      open(element)
  })
  // Keep the player's click-to-pause and double-click fullscreen away from Milo.
  for (const type of [
    'click',
    'dblclick',
    'mousedown',
    'mouseup',
    'pointerdown',
    'pointerup',
    'keydown',
    'keyup'
  ])
    host.addEventListener(type, event => event.stopPropagation())

  // A word saved from the card is underlined at once.
  const unsubscribe = saved
    ? saved.subscribe(() => {
        painted = ''
        render()
      })
    : () => undefined

  onStatus(READY_STATUS)
  tick()

  return {
    tick,
    position,
    /** The word card closed: carry on playing unless the pointer is still on the subtitle. */
    cardClosed() {
      cardOpen = false
      active = null
      source
        .querySelectorAll<HTMLElement>('.w[data-active=true]')
        .forEach(node => delete node.dataset.active)
      if (!inside) resume()
    },
    destroy() {
      destroyed = true
      unsubscribe()
      clearDwell()
      if (session) cancel(session)
      session = ''
      pausedByUs = false
      host.remove()
    }
  }
}

export type InteractiveSubtitles = ReturnType<typeof createInteractiveSubtitles>
