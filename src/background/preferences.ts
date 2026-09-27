import {
  parsePreferences,
  TranslationPreferences
} from '@/models/TranslationPreferences'
const KEY = 'milo_translation_preferences_v1'
export async function getPreferences(): Promise<TranslationPreferences> {
  const data = await browser.storage.local.get(KEY)
  return parsePreferences(data[KEY])
}
export async function savePreferences(
  value: TranslationPreferences
): Promise<TranslationPreferences> {
  const parsed = parsePreferences(value)
  await browser.storage.local.set({ [KEY]: parsed })
  return parsed
}
