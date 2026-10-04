import { message } from '@/_helpers/browser-api'
import {
  addEncounter,
  createMiloWord,
  MiloWord,
  MiloWordInput,
  MiloWordStatus,
  normalizeWord,
  SavedWordEntry,
  timesMet,
  wordStatus
} from '@/models/MiloWord'
import { baseCandidates } from '@/models/word-forms'

const STORAGE_KEY = 'milo_words_v1'
/** A reload or a re-render of the same page within this window is not a new sighting. */
const SEEN_AGAIN_AFTER = 6 * 60 * 60 * 1000
type WordMap = Record<string, MiloWord>

let saveQueue: Promise<unknown> = Promise.resolve()

async function readWordMap(): Promise<WordMap> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  const stored = result[STORAGE_KEY]
  return stored && typeof stored === 'object' && !Array.isArray(stored)
    ? stored
    : {}
}

function queue<T>(task: () => Promise<T>): Promise<T> {
  const operation = saveQueue.then(task)
  saveQueue = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}

const has = (words: WordMap, key: string) =>
  Object.prototype.hasOwnProperty.call(words, key)

export function setMiloWordStatusLocally(
  word: string,
  status: MiloWordStatus
): Promise<MiloWord> {
  return queue(async () => {
    if (status !== 'learning' && status !== 'known') throw new Error('状态无效')
    const words = await readWordMap()
    const key = normalizeWord(word)
    if (!has(words, key)) throw new Error('单词本里还没有这个词')
    words[key] = { ...words[key], status }
    await browser.storage.local.set({ [STORAGE_KEY]: words })
    return words[key]
  })
}

/** Count saved words that turned up again; the same page only counts once in a while. */
export function markMiloWordsSeenLocally(
  keys: readonly string[],
  url: string
): Promise<number> {
  return queue(async () => {
    const words = await readWordMap()
    const now = Date.now()
    let counted = 0
    for (const key of Array.from(new Set(keys)).slice(0, 300)) {
      if (typeof key !== 'string' || !has(words, key)) continue
      const word = words[key]
      if (
        word.lastSeen &&
        word.lastSeen.url === url &&
        now - word.lastSeen.at < SEEN_AGAIN_AFTER
      )
        continue
      // Seeing a word on the page where it was just saved is not meeting it again.
      const last = word.encounters[word.encounters.length - 1]
      if (
        last &&
        seenUrl(last.url) === url &&
        now - last.createdAt < SEEN_AGAIN_AFTER
      )
        continue
      words[key] = {
        ...word,
        seenCount: (word.seenCount || 0) + 1,
        lastSeen: { url, at: now }
      }
      counted += 1
    }
    if (counted) await browser.storage.local.set({ [STORAGE_KEY]: words })
    return counted
  })
}

export async function miloWordIndexLocally(): Promise<SavedWordEntry[]> {
  await saveQueue
  const words = await readWordMap()
  return Object.keys(words).map(key => ({
    word: key,
    meaning: words[key].meaning,
    status: wordStatus(words[key]),
    times: timesMet(words[key])
  }))
}

/** The saved record for a looked-up word, also when it appears inflected ("studies"). */
export async function findMiloWordLocally(
  word: string
): Promise<MiloWord | null> {
  await saveQueue
  const words = await readWordMap()
  const key = baseCandidates(normalizeWord(word)).find(item => has(words, item))
  return key ? words[key] : null
}

export function saveMiloWordLocally(input: MiloWordInput): Promise<MiloWord> {
  const operation = saveQueue.then(async () => {
    const key = normalizeWord(input.word)
    if (!key) throw new Error('单词不能为空')
    const words = await readWordMap()
    const createdAt = Date.now()
    const previous = Object.prototype.hasOwnProperty.call(words, key)
      ? words[key]
      : undefined
    const word = previous
      ? addEncounter(previous, input, createdAt)
      : createMiloWord(
          input,
          `milo_${createdAt.toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          createdAt
        )
    words[key] = word
    await browser.storage.local.set({ [STORAGE_KEY]: words })
    return word
  })
  saveQueue = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}

export async function listMiloWordsLocally(): Promise<MiloWord[]> {
  await saveQueue
  const words = await readWordMap()
  return Object.keys(words)
    .map(key => words[key])
    .sort(
      (a, b) =>
        b.encounters[b.encounters.length - 1].createdAt -
        a.encounters[a.encounters.length - 1].createdAt
    )
}

export function deleteMiloWordLocally(
  word: string
): Promise<MiloWord | undefined> {
  const operation = saveQueue.then(async () => {
    const words = await readWordMap()
    const key = normalizeWord(word)
    const removed = words[key]
    if (!Object.prototype.hasOwnProperty.call(words, key)) return undefined
    delete words[key]
    await browser.storage.local.set({ [STORAGE_KEY]: words })
    return removed
  })
  saveQueue = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}

export function importMiloWordsLocally(input: unknown): Promise<number> {
  const operation = saveQueue.then(async () => {
    if (!Array.isArray(input) || input.length > 20000)
      throw new Error('备份格式无效或词条超过 20000 条')
    const validated = input.map((item: any) => {
      if (
        !item ||
        typeof item.word !== 'string' ||
        typeof item.meaning !== 'string' ||
        !Array.isArray(item.encounters) ||
        !item.encounters.length ||
        item.encounters.length > 10000 ||
        !Number.isFinite(item.createdAt)
      )
        throw new Error('备份词条格式无效')
      const created = createMiloWord(
        {
          word: item.word,
          meaning: item.meaning,
          phonetic: item.phonetic,
          partOfSpeech: item.partOfSpeech,
          sentence: item.encounters[0].sentence,
          title: item.source && item.source.title,
          url: item.source && item.source.url
        },
        typeof item.id === 'string'
          ? item.id.slice(0, 160)
          : `milo_import_${Date.now()}`,
        item.createdAt
      )
      const encounters = item.encounters.map((encounter: any) => {
        if (
          !encounter ||
          !Number.isFinite(encounter.createdAt) ||
          (encounter.sentence !== undefined &&
            typeof encounter.sentence !== 'string') ||
          (encounter.title !== undefined &&
            typeof encounter.title !== 'string') ||
          (encounter.url !== undefined && typeof encounter.url !== 'string')
        )
          throw new Error('备份语境格式无效')
        return {
          createdAt: encounter.createdAt,
          sentence: encounter.sentence?.slice(0, 1200),
          title: encounter.title?.slice(0, 300),
          url: encounter.url?.slice(0, 2000)
        }
      })
      return {
        ...created,
        encounters,
        encounterCount: encounters.length,
        status: item.status === 'known' ? ('known' as const) : undefined,
        seenCount:
          Number.isInteger(item.seenCount) && item.seenCount > 0
            ? Math.min(item.seenCount, 1000000)
            : undefined
      }
    })
    const words = await readWordMap()
    for (const item of validated) {
      const previous = Object.prototype.hasOwnProperty.call(
        words,
        item.normalizedWord
      )
        ? words[item.normalizedWord]
        : undefined
      if (!previous) words[item.normalizedWord] = item
      else {
        const unique = new Map(
          previous.encounters.map(encounter => [
            JSON.stringify([
              encounter.createdAt,
              encounter.sentence || '',
              encounter.title || '',
              encounter.url || ''
            ]),
            encounter
          ])
        )
        item.encounters.forEach((encounter: any) =>
          unique.set(
            JSON.stringify([
              encounter.createdAt,
              encounter.sentence || '',
              encounter.title || '',
              encounter.url || ''
            ]),
            encounter
          )
        )
        const encounters = Array.from(unique.values()).sort(
          (a, b) => a.createdAt - b.createdAt
        )
        words[item.normalizedWord] = {
          ...previous,
          encounters,
          encounterCount: encounters.length,
          status: previous.status || item.status,
          seenCount:
            Math.max(previous.seenCount || 0, item.seenCount || 0) || undefined
        }
      }
    }
    await browser.storage.local.set({ [STORAGE_KEY]: words })
    return validated.length
  })
  saveQueue = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}

export function startMiloStorageServer(): void {
  message.addListener('MILO_SAVE_WORD', msg => saveMiloWordLocally(msg.payload))
  message.addListener('MILO_LIST_WORDS', () => listMiloWordsLocally())
  message.addListener('MILO_WORD_INDEX', () => miloWordIndexLocally())
  message.addListener('MILO_FIND_WORD', msg =>
    findMiloWordLocally(msg.payload.word)
  )
  message.addListener('MILO_WORD_STATUS', async msg => {
    try {
      return {
        word: await setMiloWordStatusLocally(
          msg.payload.word,
          msg.payload.status
        )
      }
    } catch (error) {
      return { error: error.message }
    }
  })
  message.addListener('MILO_WORDS_SEEN', (msg, sender) => {
    // The page address comes from the sender, not from the page script.
    const url = seenUrl(sender.url)
    return url
      ? markMiloWordsSeenLocally(msg.payload.words, url)
      : Promise.resolve(0)
  })
  message.addListener('MILO_NOTEBOOK_UPDATE', async (msg, sender) => {
    try {
      if (!sender.url || !sender.url.startsWith(browser.runtime.getURL('')))
        throw new Error('只能在 Milo 单词本中修改记录')
      if (msg.payload.action === 'delete')
        return { deleted: await deleteMiloWordLocally(msg.payload.word || '') }
      return { imported: await importMiloWordsLocally(msg.payload.words) }
    } catch (error) {
      return { error: error.message }
    }
  })
}

/** One address per page or video: no hash, and for YouTube only the video id. */
export function seenUrl(raw: string | undefined): string {
  if (!raw || !/^https?:/.test(raw)) return ''
  try {
    const url = new URL(raw)
    url.hash = ''
    if (/(^|\.)youtube\.com$/.test(url.hostname) && url.pathname === '/watch')
      return `https://www.youtube.com/watch?v=${url.searchParams.get('v') ||
        ''}`
    return url.href.slice(0, 2000)
  } catch (_) {
    return ''
  }
}
