import { ChatConfiguration } from './ai-provider'
import { TranslationResult } from '@/services/translation/TranslationProvider'
export function isDirectProvider(provider: string) {
  return ['google-free', 'deepl', 'google', 'microsoft'].includes(provider)
}
const FREE_ENDPOINT = 'https://translate.googleapis.com/translate_a'
const POS: Record<string, string> = {
  名词: 'n.',
  动词: 'v.',
  形容词: 'adj.',
  副词: 'adv.',
  代词: 'pron.',
  介词: 'prep.',
  连词: 'conj.',
  感叹词: 'interj.',
  冠词: 'art.',
  数词: 'num.',
  缩写: 'abbr.',
  前缀: 'prefix',
  后缀: 'suffix',
  短语: 'phr.'
}
const abbreviate = (pos: unknown) =>
  typeof pos === 'string' ? POS[pos] || pos : ''
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim())
    : []
const unique = (values: string[]) => Array.from(new Set(values))
async function freeResponse(response: Response) {
  if (response.ok) return response.json()
  throw new Error(
    response.status === 429
      ? '免费翻译暂时繁忙，请稍后重试；也可以在设置中使用自己的 AI 服务'
      : `免费翻译暂不可用（${response.status}），可在设置中使用自己的 AI 服务`
  )
}

/** Parses the dj=1 dictionary response of the free Google endpoint. */
export function parseGoogleDictionary(data: any): TranslationResult {
  const sentences = Array.isArray(data && data.sentences) ? data.sentences : []
  const translation = sentences
    .map((item: any) => (typeof item.trans === 'string' ? item.trans : ''))
    .join('')
    .trim()
  const phonetic = sentences
    .map((item: any) => item.src_translit)
    .find((item: unknown) => typeof item === 'string' && item.trim())
  const senses = (Array.isArray(data && data.dict) ? data.dict : [])
    .map((entry: any) => ({
      pos: abbreviate(entry.pos),
      meaning: strings(entry.terms)
        .slice(0, 5)
        .join('；')
    }))
    .filter((sense: any) => sense.meaning)
    .slice(0, 6)
  const definitions = (Array.isArray(data && data.definitions)
    ? data.definitions
    : []
  )
    .flatMap((group: any) =>
      (Array.isArray(group.entry) ? group.entry : []).map((entry: any) => ({
        pos: abbreviate(group.pos),
        gloss: typeof entry.gloss === 'string' ? entry.gloss.trim() : '',
        ...(typeof entry.example === 'string' && entry.example.trim()
          ? { example: entry.example.trim() }
          : {})
      }))
    )
    .filter((item: any) => item.gloss)
    .slice(0, 6)
  const examples = (data &&
  data.examples &&
  Array.isArray(data.examples.example)
    ? data.examples.example
    : []
  )
    .map((item: any) =>
      typeof item.text === 'string' ? decodeEntities(stripTags(item.text)) : ''
    )
    .filter(Boolean)
    .slice(0, 4)
  const first = senses[0]
  const meaning = unique(
    [translation, ...(first ? first.meaning.split('；').slice(0, 3) : [])]
      .map(item => item.trim())
      .filter(Boolean)
  ).join('；')
  if (!meaning) throw new Error('翻译结果无效')
  return {
    meaning,
    ...(phonetic ? { phonetic: `/${phonetic.trim()}/` } : {}),
    ...(first && first.pos ? { partOfSpeech: first.pos } : {}),
    ...(senses.length ? { senses } : {}),
    ...(definitions.length ? { definitions } : {}),
    ...(examples.length ? { examples } : {})
  }
}

export async function lookupGoogleDictionary(
  word: string,
  signal?: AbortSignal
) {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'en',
    tl: 'zh-CN',
    hl: 'zh-CN',
    dj: '1',
    q: word
  })
  for (const part of ['t', 'bd', 'rm', 'md', 'ex']) params.append('dt', part)
  const response = await fetch(`${FREE_ENDPOINT}/single?${params}`, {
    signal,
    credentials: 'omit'
  })
  return parseGoogleDictionary(await freeResponse(response))
}

/** Batch text translation; results may be strings or [text, detectedLanguage]. */
export function parseGoogleBatch(data: unknown, count: number): string[] {
  if (!Array.isArray(data)) throw new Error('翻译结果无效')
  // A single sl=auto query may come back flat: ["译文", "en"].
  const rows =
    count === 1 && data.length === 2 && typeof data[0] === 'string'
      ? [data[0]]
      : data
  return rows.map(row =>
    typeof row === 'string'
      ? row
      : Array.isArray(row) && typeof row[0] === 'string'
      ? row[0]
      : ''
  )
}

async function translateGoogleBatch(
  texts: string[],
  target: string,
  source: string | undefined,
  signal: AbortSignal
) {
  const body = new URLSearchParams()
  texts.forEach(text => body.append('q', text))
  const response = await fetch(
    `${FREE_ENDPOINT}/t?client=gtx&format=text&sl=${encodeURIComponent(
      source || 'auto'
    )}&tl=${encodeURIComponent(target)}`,
    { method: 'POST', body, signal, credentials: 'omit' }
  )
  return parseGoogleBatch(await freeResponse(response), texts.length)
}
const stripTags = (text: string) => text.replace(/<[^>]*>/g, '')
function mapped(code: string, provider: string) {
  if (provider === 'deepl')
    return code === 'zh-CN'
      ? 'ZH-HANS'
      : code === 'zh-TW'
      ? 'ZH-HANT'
      : code.toUpperCase()
  if (provider === 'microsoft')
    return code === 'zh-CN' ? 'zh-Hans' : code === 'zh-TW' ? 'zh-Hant' : code
  return code
}
function decodeEntities(text: string) {
  if (typeof text !== 'string') return ''
  return text.replace(
    /&(amp|lt|gt|quot|#39|#x[0-9a-f]+|#[0-9]+);/gi,
    (_all, name: string) =>
      ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[name] ||
      String.fromCodePoint(
        name.startsWith('#x')
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10)
      ))
  )
}
export async function directTranslation(
  config: ChatConfiguration,
  input: any,
  signal: AbortSignal
) {
  const items = Array.isArray(input)
    ? input.map(item => ({ id: item.id, text: item.text }))
    : [{ id: '0', text: input.word || input.text }]
  if (items.some(item => typeof item.text !== 'string'))
    throw new Error('翻译请求无效')
  const target = mapped(
    input.word ? 'zh-CN' : input.target || 'zh-CN',
    config.provider
  )
  const source =
    input.source && input.source !== 'auto'
      ? mapped(input.source, config.provider)
      : undefined
  if (config.provider === 'google-free' && input.word)
    return lookupGoogleDictionary(input.word, signal)
  let endpoint = ''
  let body: any
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let results: string[] | undefined
  if (config.provider === 'google-free') {
    results = await translateGoogleBatch(
      items.map(item => item.text),
      target,
      source,
      signal
    )
  } else if (config.provider === 'deepl') {
    endpoint = config.apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate'
    headers.Authorization = 'DeepL-Auth-Key ' + config.apiKey
    body = {
      text: items.map(item => item.text),
      target_lang: target,
      model_type: config.model,
      preserve_formatting: true,
      ...(source ? { source_lang: source } : {}),
      ...(input.context ? { context: input.context } : {})
    }
  } else if (config.provider === 'google') {
    endpoint = 'https://translation.googleapis.com/language/translate/v2'
    headers['X-goog-api-key'] = config.apiKey
    body = {
      q: items.map(item => item.text),
      target,
      format: 'text',
      ...(source ? { source } : {})
    }
  } else {
    endpoint =
      'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=' +
      encodeURIComponent(target) +
      (source ? '&from=' + encodeURIComponent(source) : '')
    headers['Ocp-Apim-Subscription-Key'] = config.apiKey
    if (config.region) headers['Ocp-Apim-Subscription-Region'] = config.region
    body = items.map(item => ({ Text: item.text }))
  }
  if (!results) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    })
    if (!response.ok)
      throw new Error(
        response.status === 401 || response.status === 403
          ? '翻译密钥或区域无效，请检查服务设置'
          : response.status === 456
          ? '翻译服务额度已用完'
          : `翻译服务返回 ${response.status}，请检查账户、支持的语言与区域`
      )
    const data = await response.json()
    results =
      config.provider === 'deepl'
        ? data.translations?.map((item: any) => item.text)
        : config.provider === 'google'
        ? data.data?.translations?.map((item: any) =>
            decodeEntities(item.translatedText)
          )
        : Array.isArray(data)
        ? data.map(item => item.translations?.[0]?.text)
        : undefined
  }
  if (
    !Array.isArray(results) ||
    results.length !== items.length ||
    results.some(text => typeof text !== 'string' || !text.trim())
  )
    throw new Error('翻译结果无效')
  const texts = results
  if (Array.isArray(input))
    return {
      translations: items.map((item, index) => ({
        id: item.id,
        text: texts[index]
      }))
    }
  return input.word ? { meaning: texts[0] } : { text: texts[0] }
}
