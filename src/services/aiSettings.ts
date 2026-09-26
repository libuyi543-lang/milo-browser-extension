import { message } from '@/_helpers/browser-api'

export const getAISettings = () =>
  message.send<'MILO_AI_SETTINGS'>({ type: 'MILO_AI_SETTINGS' })
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
