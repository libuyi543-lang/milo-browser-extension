import { message } from '@/_helpers/browser-api'
import {
  DEFAULT_PREFERENCES,
  LanguageCode,
  TranslationPreferences,
  parsePreferences
} from '@/models/TranslationPreferences'
export async function getPreferences(): Promise<TranslationPreferences> {
  const result = await message.send<'MILO_GET_PREFERENCES'>({
    type: 'MILO_GET_PREFERENCES'
  })
  return result ? parsePreferences(result) : { ...DEFAULT_PREFERENCES }
}
export async function savePreferences(
  value: TranslationPreferences
): Promise<TranslationPreferences> {
  const result = await message.send<'MILO_SAVE_PREFERENCES'>({
    type: 'MILO_SAVE_PREFERENCES',
    payload: value
  })
  if (result.error || !result.preferences)
    throw new Error(result.error || '设置保存失败')
  return result.preferences
}
export async function translateText(
  text: string,
  target?: LanguageCode,
  sessionId?: string,
  source?: LanguageCode
): Promise<string> {
  const result = await message.send<'MILO_TRANSLATE_TEXT'>({
    type: 'MILO_TRANSLATE_TEXT',
    payload: { text, target, sessionId, source }
  })
  if (!result || result.error || !result.text)
    throw new Error(
      (result && result.error) || '翻译失败，请重新加载扩展后重试'
    )
  return result.text
}
