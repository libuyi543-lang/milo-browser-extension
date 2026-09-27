import {
  AI_PROVIDERS,
  AIProviderId,
  AISettingsInput,
  getAIProvider
} from '@/models/AIProvider'

const SETTINGS_KEY = 'milo_ai_settings_v1'
const LEGACY_KEY = 'milo_deepseek_api_key'
interface Profile {
  model: string
  apiKey: string
  endpoint?: string
  region?: string
}
interface Configuration {
  provider: AIProviderId
  profiles: Record<AIProviderId, Profile>
}
let writes: Promise<unknown> = Promise.resolve()

async function readStored(): Promise<Configuration> {
  const stored = await browser.storage.local.get([SETTINGS_KEY, LEGACY_KEY])
  const value = stored[SETTINGS_KEY]
  const profiles = {} as Record<AIProviderId, Profile>
  for (const definition of AI_PROVIDERS) {
    const previous = value && value.profiles && value.profiles[definition.id]
    profiles[definition.id] = {
      ...(definition.id === 'microsoft'
        ? {
            region:
              previous && typeof previous.region === 'string'
                ? previous.region
                : ''
          }
        : {}),
      ...(definition.id === 'custom'
        ? {
            endpoint:
              previous && typeof previous.endpoint === 'string'
                ? previous.endpoint
                : ''
          }
        : {}),
      model:
        previous && typeof previous.model === 'string' && previous.model
          ? previous.model
          : definition.defaultModel,
      apiKey:
        previous && typeof previous.apiKey === 'string'
          ? previous.apiKey
          : definition.id === 'deepseek' &&
            typeof stored[LEGACY_KEY] === 'string'
          ? stored[LEGACY_KEY]
          : ''
    }
  }
  return {
    provider:
      value && AI_PROVIDERS.some(item => item.id === value.provider)
        ? value.provider
        : 'deepseek',
    profiles
  }
}

export async function readAIConfiguration() {
  await writes
  return readStored()
}

/** Serial updates preserve other providers and migrate the existing DeepSeek key. */
export function saveAIConfiguration(input: AISettingsInput) {
  const operation = writes.then(async () => {
    getAIProvider(input.provider)
    const model = String(input.model || '').trim()
    if (!/^[a-zA-Z0-9._:/-]{1,120}$/.test(model))
      throw new Error('模型名称格式不正确')
    if (input.apiKey !== undefined && typeof input.apiKey !== 'string')
      throw new Error('API Key 格式不正确')
    const key = input.apiKey === undefined ? undefined : input.apiKey.trim()
    if (key && !/^[\x21-\x7e]{12,2048}$/.test(key))
      throw new Error('API Key 格式不正确，请粘贴完整密钥')
    const configuration = await readStored()
    const profile = configuration.profiles[input.provider]
    let endpoint = profile.endpoint
    const region =
      input.provider === 'microsoft'
        ? input.region === undefined
          ? profile.region || ''
          : input.region.trim()
        : undefined
    if (region && !/^[a-z0-9-]{1,40}$/.test(region))
      throw new Error('Azure 区域名称无效')
    if (input.provider === 'custom') {
      const url = new URL(input.endpoint || endpoint || '')
      if (
        (url.protocol !== 'https:' &&
          !(
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
          )) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error(
          'API 地址必须为 HTTPS（本机地址可用 HTTP），不能包含凭据、查询参数或片段'
        )
      if (!url.pathname.endsWith('/chat/completions'))
        url.pathname = url.pathname.replace(/\/$/, '') + '/chat/completions'
      endpoint = url.href
      if (model === 'your-model') throw new Error('请填写实际的模型名称')
    }
    const nextKey = key === undefined ? profile.apiKey : key
    const changed =
      configuration.provider !== input.provider ||
      profile.model !== model ||
      profile.apiKey !== nextKey ||
      profile.endpoint !== endpoint ||
      profile.region !== region
    configuration.provider = input.provider
    configuration.profiles[input.provider] = {
      model,
      apiKey: nextKey,
      ...(endpoint ? { endpoint } : {}),
      ...(region ? { region } : {})
    }
    await browser.storage.local.set({ [SETTINGS_KEY]: configuration })
    await browser.storage.local.remove(LEGACY_KEY)
    return changed
  })
  writes = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}
