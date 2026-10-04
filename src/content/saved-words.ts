import { isExtensionContextValid } from '@/_helpers/extension-lifecycle'
import { SavedWordEntry } from '@/models/MiloWord'
import { wordForms } from '@/models/word-forms'
import { reportSeenWords, savedWordIndex } from '@/services/miloStorage'
import { onStoreChange } from './store-changes'

const WORDS_KEY = 'milo_words_v1'

interface Options {
  load?: () => Promise<readonly SavedWordEntry[]>
  report?: (words: string[]) => Promise<unknown>
}

/**
 * The reader's saved words as seen from a page: recognises them (also inflected),
 * follows changes from other tabs, and reports when one turns up again.
 */
export function createSavedWords(options: Options = {}) {
  const load = options.load || savedWordIndex
  const report = options.report || reportSeenWords
  let forms = new Map<string, SavedWordEntry>()
  let signature = ''
  let destroyed = false
  let reloadTimer: number | undefined
  let flushTimer: number | undefined
  let page = ''
  const reported = new Set<string>()
  const pending = new Set<string>()
  const listeners = new Set<() => void>()

  const apply = (entries: readonly SavedWordEntry[]) => {
    const next = new Map<string, SavedWordEntry>()
    // Exact saved words win over another word's inflection ("sing" vs "singe" + d).
    entries.forEach(entry =>
      wordForms(entry.word).forEach(form => {
        if (form !== entry.word && !next.has(form)) next.set(form, entry)
      })
    )
    entries.forEach(entry => next.set(entry.word, entry))
    forms = next
    // Sightings change counts on every page; only a new word or status repaints.
    const nextSignature = entries
      .map(entry => entry.word + (entry.status === 'known' ? '+' : ''))
      .sort()
      .join(' ')
    if (nextSignature === signature) return
    signature = nextSignature
    listeners.forEach(listener => listener())
  }

  const reload = () =>
    load()
      .then(entries => {
        if (!destroyed && Array.isArray(entries)) apply(entries)
      })
      .catch(() => undefined)

  const onStorage = () => {
    if (reloadTimer !== undefined) clearTimeout(reloadTimer)
    reloadTimer = window.setTimeout(() => {
      reloadTimer = undefined
      if (!destroyed && isExtensionContextValid()) reload()
    }, 400)
  }
  const stopListening = onStoreChange(WORDS_KEY, onStorage)
  const ready = reload()

  const flush = () => {
    flushTimer = undefined
    if (destroyed || !pending.size || !isExtensionContextValid()) return
    const words = Array.from(pending)
    pending.clear()
    report(words).catch(() => undefined)
  }

  return {
    ready,
    /** The saved word behind a token on the page, if any. */
    match(token: string): SavedWordEntry | undefined {
      if (!forms.size) return undefined
      const word = token
        .toLowerCase()
        .replace(/’/g, "'")
        .replace(/'s$/, '')
      return forms.get(word)
    },
    /** A saved 学习中 word is on screen; counted once per page. */
    seen(word: string) {
      const here = location.href.split('#')[0]
      if (here !== page) {
        page = here
        reported.clear()
      }
      if (reported.has(word)) return
      reported.add(word)
      pending.add(word)
      if (flushTimer === undefined) flushTimer = window.setTimeout(flush, 1500)
    },
    /** Called when a word is added or its status changes. */
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    destroy() {
      destroyed = true
      if (reloadTimer !== undefined) clearTimeout(reloadTimer)
      if (flushTimer !== undefined) clearTimeout(flushTimer)
      listeners.clear()
      stopListening()
    }
  }
}

export type SavedWords = ReturnType<typeof createSavedWords>
