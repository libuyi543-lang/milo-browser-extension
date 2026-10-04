import { PREFERENCES_KEY } from '@/models/TranslationPreferences'

/**
 * Storage is locked to extension pages (the API key lives there), so content
 * scripts never see storage.onChanged. Tell open pages which of the keys they
 * follow changed; they read the new state through the usual messages. Values
 * are never sent.
 */
export const RELAYED_KEYS = ['milo_words_v1', PREFERENCES_KEY] as const

/** Saves often come in bursts (a save plus its sightings); send one note per key. */
const SETTLE = 150

export function startStoreRelay() {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const broadcast = async (key: string) => {
    timers.delete(key)
    let tabs: browser.tabs.Tab[] = []
    try {
      tabs = await browser.tabs.query({})
    } catch (_) {
      return
    }
    for (const tab of tabs) {
      if (tab.id === undefined || !/^https?:/.test(tab.url || '')) continue
      // Tabs without Milo's content script (or still loading) reject; that is fine.
      browser.tabs
        .sendMessage(tab.id, { type: 'MILO_STORE_CHANGED', payload: { key } })
        .catch(() => undefined)
    }
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    for (const key of RELAYED_KEYS) {
      if (!(key in changes) || timers.has(key)) continue
      timers.set(
        key,
        setTimeout(() => broadcast(key), SETTLE)
      )
    }
  })
}
