import { message } from '@/_helpers/browser-api'
import { AISettingsInput } from '@/models/AIProvider'

export const getAISettings = () =>
  message.send<'MILO_AI_SETTINGS'>({ type: 'MILO_AI_SETTINGS' })
export async function saveAISettings(input: AISettingsInput) {
  const response = await message.send<'MILO_SAVE_AI_SETTINGS'>({
    type: 'MILO_SAVE_AI_SETTINGS',
    payload: input
  })
  if (response.error) throw new Error(response.error)
  return response
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
