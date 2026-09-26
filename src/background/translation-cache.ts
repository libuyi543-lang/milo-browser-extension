export type CacheKind = 'word' | 'paragraph' | 'input'
interface CacheEntry {
  key: string
  kind: CacheKind
  value: any
  createdAt: number
  usedAt: number
}
export interface CacheWrite {
  kind: CacheKind
  text: string
  value: any
}
const STORAGE_KEY = 'milo_translation_cache_v1'
const WORD_TTL = 30 * 24 * 60 * 60 * 1000
const PARAGRAPH_TTL = 7 * 24 * 60 * 60 * 1000

async function fingerprint(text: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  )
  return Array.from(new Uint8Array(hash), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

/** Bounded local results, independent of the provider's billable prompt-prefix cache. */
export class TranslationCache {
  private entries = new Map<string, CacheEntry>()
  private loading: Promise<void> | null = null
  private writes: Promise<void> = Promise.resolve()
  private bytes = 0

  constructor(
    private scope: string,
    private maxEntries = 500,
    private maxBytes = 1024 * 1024,
    private now: () => number = Date.now,
    private hash = fingerprint,
    private storageKey = STORAGE_KEY
  ) {
    this.maxEntries = Math.max(1, maxEntries)
    this.maxBytes = Math.max(256, maxBytes)
  }

  private size(entry: CacheEntry) {
    return new Blob([JSON.stringify(entry)]).size + 2
  }

  private expired(entry: CacheEntry) {
    return (
      this.now() - entry.createdAt >
      (entry.kind === 'word' ? WORD_TTL : PARAGRAPH_TTL)
    )
  }

  private remove(key: string) {
    const entry = this.entries.get(key)
    if (entry) this.bytes -= this.size(entry)
    this.entries.delete(key)
  }

  private trim() {
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes)
      this.remove(this.entries.keys().next().value)
  }

  private load(): Promise<void> {
    if (!this.loading)
      this.loading = browser.storage.local.get(this.storageKey).then(stored => {
        const data = stored[this.storageKey]
        if (!data || data.scope !== this.scope || !Array.isArray(data.entries))
          return
        const entries = data.entries
          .filter(
            (entry: CacheEntry) =>
              entry &&
              typeof entry.key === 'string' &&
              (entry.kind === 'word' ||
                entry.kind === 'paragraph' ||
                entry.kind === 'input') &&
              Number.isFinite(entry.createdAt) &&
              Number.isFinite(entry.usedAt) &&
              !this.expired(entry)
          )
          .sort((a: CacheEntry, b: CacheEntry) => a.usedAt - b.usedAt)
          .slice(-this.maxEntries)
        for (const entry of entries) {
          this.remove(entry.key)
          this.entries.set(entry.key, entry)
          this.bytes += this.size(entry)
        }
        this.trim()
      })
    return this.loading
  }

  private key(kind: CacheKind, text: string) {
    return this.hash(`${this.scope}|${kind}|${text}`)
  }

  private persist(): Promise<void> {
    this.writes = this.writes
      .catch(() => undefined)
      .then(() =>
        browser.storage.local.set({
          [this.storageKey]: {
            scope: this.scope,
            entries: Array.from(this.entries.values())
          }
        })
      )
    return this.writes
  }

  async get(kind: CacheKind, text: string): Promise<any | undefined> {
    await this.load()
    const key = await this.key(kind, text)
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (this.expired(entry)) {
      this.remove(key)
      return undefined
    }
    this.remove(key)
    entry.usedAt = this.now()
    this.entries.set(key, entry)
    this.bytes += this.size(entry)
    return entry.value
  }

  async put(items: CacheWrite[]): Promise<void> {
    await this.load()
    const keys = await Promise.all(
      items.map(item => this.key(item.kind, item.text))
    )
    items.forEach((item, index) => {
      const key = keys[index]
      this.remove(key)
      const entry: CacheEntry = {
        key,
        kind: item.kind,
        value: item.value,
        createdAt: this.now(),
        usedAt: this.now()
      }
      this.entries.set(key, entry)
      this.bytes += this.size(entry)
    })
    this.trim()
    await this.persist()
  }

  async info() {
    await this.load()
    for (const [key, entry] of this.entries)
      if (this.expired(entry)) this.remove(key)
    return { entries: this.entries.size, bytes: this.bytes }
  }

  async clear() {
    await this.load()
    this.entries.clear()
    this.bytes = 0
    await this.persist()
    return this.info()
  }
}
