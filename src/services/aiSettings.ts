import { message } from '@/_helpers/browser-api'
import { AI_PROVIDERS, AISettings, AISettingsInput } from '@/models/AIProvider'

export function validateAISettings(value: unknown): AISettings {
  const settings = value as Partial<AISettings> | null
  if (!settings || !settings.provider || !Array.isArray(settings.profiles))
    throw new Error(
      'Milo 后台版本尚未更新，请在扩展管理页点击 Milo 的「重新加载」，再重新打开图标。'
    )
  if (
    !AI_PROVIDERS.some(item => item.id === settings.provider) ||
    typeof settings.configured !== 'boolean' ||
    typeof settings.model !== 'string' ||
    !settings.model ||
    !settings.cache ||
    !Number.isFinite(settings.cache.entries) ||
    !Number.isFinite(settings.cache.bytes) ||
    AI_PROVIDERS.some(provider => {
      const profile = settings.profiles!.find(
        item => item && item.id === provider.id
      )
      return (
        !profile ||
        typeof profile.model !== 'string' ||
        !profile.model ||
        typeof profile.configured !== 'boolean'
      )
    })
  )
    throw new Error('AI 设置格式异常，请重新加载 Milo 后重试。')
  // Return only the public contract, even if a malformed background includes extra fields.
  return {
    provider: settings.provider,
    configured: settings.configured,
    model: settings.model,
    profiles: settings.profiles.map(item => ({
      id: item.id,
      model: item.model,
      configured: item.configured,
      ...(item.region ? { region: item.region } : {}),
      ...(item.endpoint ? { endpoint: item.endpoint } : {})
    })),
    cache: { entries: settings.cache.entries, bytes: settings.cache.bytes }
  }
}

export const getAISettings = async () =>
  validateAISettings(
    await message.send<'MILO_AI_SETTINGS'>({ type: 'MILO_AI_SETTINGS' })
  )
export async function saveAISettings(input: AISettingsInput) {
  const response = await message.send<'MILO_SAVE_AI_SETTINGS'>({
    type: 'MILO_SAVE_AI_SETTINGS',
    payload: input
  })
  if (response.error) throw new Error(response.error)
  return validateAISettings(response)
}
export async function testAIConnection() {
  const response = await message.send<'MILO_TEST_AI_CONNECTION'>({
    type: 'MILO_TEST_AI_CONNECTION'
  })
  if (response.error || !response.ok)
    throw new Error(response.error || '连接测试失败')
  return response
}
export async function saveAPIKey(apiKey: string) {
  const response = await message.send<'MILO_SET_API_KEY'>({
    type: 'MILO_SET_API_KEY',
    payload: { apiKey }
  })
  if (response.error) throw new Error(response.error)
  return response
}
export const translateCurrentPage = () =>
  message.send<'MILO_TRANSLATE_ACTIVE_PAGE'>({
    type: 'MILO_TRANSLATE_ACTIVE_PAGE'
  })

export async function clearTranslationCache() {
  const result = await message.send<'MILO_CLEAR_TRANSLATION_CACHE'>({
    type: 'MILO_CLEAR_TRANSLATION_CACHE'
  })
  if (result.error) throw new Error(result.error)
  return result
}
