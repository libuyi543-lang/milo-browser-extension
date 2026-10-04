import {
  clampTop,
  FloatingButtonAction,
  parsePreferences,
  PREFERENCES_KEY as KEY,
  TranslationPreferences
} from '@/models/TranslationPreferences'
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

/** Content scripts may only change the button; the site comes from the sender tab. */
export async function updateFloatingButton(
  input: FloatingButtonAction,
  url: string | undefined
): Promise<TranslationPreferences> {
  const preferences = await getPreferences()
  if (input.action === 'move')
    return savePreferences({ ...preferences, floatingTop: clampTop(input.top) })
  if (input.action === 'hide-all')
    return savePreferences({ ...preferences, floatingButton: false })
  if (input.action !== 'hide-site') throw new Error('操作无效')
  const host = url ? new URL(url).hostname : ''
  if (!host) throw new Error('无法识别当前网站')
  return savePreferences({
    ...preferences,
    floatingHiddenSites: [...preferences.floatingHiddenSites, host]
  })
}
