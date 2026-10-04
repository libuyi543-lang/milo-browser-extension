import {
  PREFERENCES_KEY,
  TranslationPreferences
} from '@/models/TranslationPreferences'
import { getPreferences } from '@/services/translation/general'
import { onStoreChange } from './store-changes'

/** Current preferences now, and again whenever they are saved in any Milo page. */
export function watchPreferences(
  callback: (preferences: TranslationPreferences) => void
): () => void {
  let stopped = false
  let latest = 0
  const read = () => {
    // Only the newest read is applied, so a slow earlier reply cannot win.
    const ticket = ++latest
    getPreferences()
      .then(preferences => {
        if (!stopped && ticket === latest) callback(preferences)
      })
      .catch(() => undefined)
  }
  const stop = onStoreChange(PREFERENCES_KEY, read)
  read()
  return () => {
    stopped = true
    stop()
  }
}
