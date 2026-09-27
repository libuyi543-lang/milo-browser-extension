import { ChatConfiguration } from './ai-provider'
export function isDirectProvider(provider: string) {
  return ['deepl', 'google', 'microsoft'].includes(provider)
}
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
  let endpoint = ''
  let body: any
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.provider === 'deepl') {
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
  const results =
    config.provider === 'deepl'
      ? data.translations?.map((item: any) => item.text)
      : config.provider === 'google'
      ? data.data?.translations?.map((item: any) =>
          decodeEntities(item.translatedText)
        )
      : Array.isArray(data)
      ? data.map(item => item.translations?.[0]?.text)
      : undefined
  if (
    !Array.isArray(results) ||
    results.length !== items.length ||
    results.some(text => typeof text !== 'string' || !text.trim())
  )
    throw new Error('翻译结果无效')
  if (Array.isArray(input))
    return {
      translations: items.map((item, index) => ({
        id: item.id,
        text: results[index]
      }))
    }
  return input.word ? { meaning: results[0] } : { text: results[0] }
}
