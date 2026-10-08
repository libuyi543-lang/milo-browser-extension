/**
 * Google 的 translate_tts 端点返回 MP3，不需要 key，音质比系统嗓音稳。
 * 单次请求只读一段，长文本按标点切开依次拼接。
 */
const ENDPOINT = 'https://translate.googleapis.com/translate_tts'
const MAX_CHUNK = 180
const CACHE_LIMIT = 40
/** 已经取回的音频，按 语言+文本 复用，重复点朗读不再走网络。 */
const cache = new Map<string, string>()

/** 按标点把长句切开，避免在单词中间断开。 */
export function splitForSpeech(text: string, limit = MAX_CHUNK): string[] {
  const chunks: string[] = []
  let remaining = text.trim()
  while (remaining.length > limit) {
    const prefix = remaining.slice(0, limit)
    const punctuation = Math.max(
      prefix.lastIndexOf('. '),
      prefix.lastIndexOf('? '),
      prefix.lastIndexOf('! '),
      prefix.lastIndexOf('; '),
      prefix.lastIndexOf(', '),
      prefix.lastIndexOf('。'),
      prefix.lastIndexOf('，')
    )
    const boundary =
      punctuation > limit / 2 ? punctuation + 1 : prefix.lastIndexOf(' ')
    const cut = boundary > 0 ? boundary : limit
    chunks.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks.filter(Boolean)
}

async function fetchChunk(text: string, lang: string): Promise<string> {
  const url = `${ENDPOINT}?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(
    lang
  )}&q=${encodeURIComponent(text)}`
  const response = await fetch(url, { credentials: 'omit' })
  if (!response.ok) throw new Error('朗读服务暂时不可用')
  const buffer = await response.arrayBuffer()
  if (!buffer.byteLength) throw new Error('朗读服务返回了空音频')
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < bytes.length; index += 1)
    binary += String.fromCharCode(bytes[index])
  return btoa(binary)
}

function remember(key: string, audio: string) {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, audio)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export async function speakText(text: string, lang: string) {
  const value = String(text || '').trim().slice(0, 600)
  if (!value) throw new Error('没有可朗读的内容')
  const key = `${lang}:${value}`
  const cached = cache.get(key)
  if (cached) return cached
  const chunks = splitForSpeech(value)
  const parts: string[] = []
  for (const chunk of chunks) parts.push(await fetchChunk(chunk, lang))
  // MP3 分片不能直接拼接播放，交给客户端按顺序放。
  remember(key, JSON.stringify(parts))
  return JSON.stringify(parts)
}
