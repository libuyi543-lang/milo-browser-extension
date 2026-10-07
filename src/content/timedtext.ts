/** A subtitle line on the video timeline, in milliseconds. */
export interface Cue {
  start: number
  end: number
  text: string
}

export interface TimedTextInfo {
  videoId: string
  language: string
  translated: boolean
  asr: boolean
}

export interface SubtitleToken {
  text: string
  word: boolean
}

const MAX_CUES = 5000
/** Hold a line across a gap this long; a longer silence lets the screen clear. */
const BRIDGE = 5000

/** Reads the track identity from a YouTube /api/timedtext URL. */
export function timedTextInfo(url: string): TimedTextInfo | null {
  let parsed: URL
  try {
    parsed = new URL(url, 'https://www.youtube.com')
  } catch (_) {
    return null
  }
  if (!/\/api\/timedtext$/.test(parsed.pathname)) return null
  const params = parsed.searchParams
  const videoId = params.get('v') || ''
  if (!videoId) return null
  return {
    videoId,
    language: params.get('lang') || '',
    translated: !!params.get('tlang'),
    asr: params.get('kind') === 'asr'
  }
}

export function isEnglishTrack(info: TimedTextInfo | null) {
  return !!info && !info.translated && /^en(-|$)/i.test(info.language)
}

const clean = (text: string) =>
  text
    .replace(/[\u200b\u200e\u200f]/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Reading time for a line: a short one still needs about a second. */
function readingTime(text: string) {
  return 700 + 45 * text.length
}

const finish = (cues: Cue[]) => {
  const ready = cues
    .filter(cue => cue.text && isFinite(cue.start) && cue.end > cue.start)
    .sort((a, b) => a.start - b.start)
    .slice(0, MAX_CUES)
  // Every track passes through here, manual ones included. A line has to stay
  // up long enough to be read: the opening line of a video gets barely a second
  // from its own word timings, because the speaker has hardly started, and the
  // viewer sees it flash past. Give it reading time, and hold it across a short
  // pause instead of blanking the screen between lines.
  ready.forEach((cue, index) => {
    cue.end = Math.max(cue.end, cue.start + readingTime(cue.text))
    const next = ready[index + 1]
    if (next && next.start - cue.end < BRIDGE)
      cue.end = Math.max(cue.end, next.start)
  })
  return ready
}

interface Json3Event {
  tStartMs?: number
  dDurationMs?: number
  aAppend?: number
  segs?: Array<{ utf8?: string; tOffsetMs?: number }>
}

/**
 * Auto-generated tracks arrive one word at a time inside rolling windows.
 * Rejoin the words into readable lines that break on pauses, sentence ends
 * or length, so each line can be read, translated and looked up as a unit.
 */
function speechLines(events: Json3Event[]): Cue[] {
  const words: Array<{ text: string; start: number }> = []
  for (const event of events) {
    if (!event.segs || event.aAppend) continue
    const base = Number(event.tStartMs) || 0
    for (const seg of event.segs) {
      const text = clean(seg.utf8 || '')
      if (text) words.push({ text, start: base + (Number(seg.tOffsetMs) || 0) })
    }
  }
  words.sort((a, b) => a.start - b.start)
  const cues: Cue[] = []
  let current: Cue | null = null
  let last = 0
  for (const word of words) {
    if (
      current &&
      (word.start - last > 1500 ||
        current.text.length + word.text.length > 84 ||
        (/[.?!]["”']?$/.test(current.text) && current.text.length > 12))
    ) {
      cues.push(current)
      current = null
    }
    if (!current) current = { start: word.start, end: 0, text: word.text }
    else current.text += ' ' + word.text
    last = word.start
    current.end = word.start + 1200
  }
  if (current) cues.push(current)
  // Reading time and bridging are applied once in finish(), for every track.
  return cues
}

function json3(body: string, asr: boolean): Cue[] {
  const data = JSON.parse(body)
  const events: Json3Event[] = Array.isArray(data && data.events)
    ? data.events
    : []
  const spoken =
    asr ||
    events.some(
      event =>
        !!event.segs &&
        event.segs.length > 1 &&
        event.segs.some(seg => Number(seg.tOffsetMs) > 0)
    )
  if (spoken) return speechLines(events)
  return events
    .filter(event => event.segs && !event.aAppend)
    .map(event => {
      const start = Number(event.tStartMs) || 0
      return {
        start,
        end: start + (Number(event.dDurationMs) || 2000),
        text: clean(event.segs!.map(seg => seg.utf8 || '').join(''))
      }
    })
}

function xml(body: string): Cue[] {
  const doc = new DOMParser().parseFromString(body, 'text/xml')
  const decode = (text: string) =>
    text
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
  const paragraphs = Array.from(doc.getElementsByTagName('p'))
  if (paragraphs.length)
    return paragraphs.map(node => {
      const start = Number(node.getAttribute('t')) || 0
      return {
        start,
        end: start + (Number(node.getAttribute('d')) || 2000),
        text: clean(decode(node.textContent || ''))
      }
    })
  return Array.from(doc.getElementsByTagName('text')).map(node => {
    const start = (Number(node.getAttribute('start')) || 0) * 1000
    return {
      start,
      end: start + (Number(node.getAttribute('dur')) || 2) * 1000,
      text: clean(decode(node.textContent || ''))
    }
  })
}

/** Parses json3 (what the web player requests) or the XML formats. */
export function parseTimedText(body: string, asr = false): Cue[] {
  const text = (body || '').trim()
  if (!text) return []
  try {
    return finish(text.startsWith('<') ? xml(text) : json3(text, asr))
  } catch (_) {
    return []
  }
}

/** Index of the cue showing at `time`, or -1 between lines. */
export function cueAt(cues: readonly Cue[], time: number) {
  let low = 0
  let high = cues.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (cues[middle].start <= time) {
      found = middle
      low = middle + 1
    } else high = middle - 1
  }
  // Overlapping lines: prefer the latest one that is still on screen.
  for (let index = found; index >= 0 && index > found - 3; index--)
    if (time < cues[index].end) return index
  return -1
}

/** Splits a line into words that can be looked up and the text between them. */
export function tokenize(text: string): SubtitleToken[] {
  const tokens: SubtitleToken[] = []
  const pattern = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g
  let index = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > index)
      tokens.push({ text: text.slice(index, match.index), word: false })
    tokens.push({ text: match[0], word: true })
    index = match.index + match[0].length
  }
  if (index < text.length) tokens.push({ text: text.slice(index), word: false })
  return tokens
}
