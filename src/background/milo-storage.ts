import { message } from '@/_helpers/browser-api'
import {
  addEncounter,
  createMiloWord,
  MiloWord,
  MiloWordInput,
  normalizeWord
} from '@/models/MiloWord'

const STORAGE_KEY = 'milo_words_v1'
type WordMap = Record<string, MiloWord>

let saveQueue: Promise<unknown> = Promise.resolve()

async function readWordMap(): Promise<WordMap> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  const stored = result[STORAGE_KEY]
  return stored && typeof stored === 'object' && !Array.isArray(stored)
    ? stored
    : {}
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
      return { ...created, encounters, encounterCount: encounters.length }
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
          encounterCount: encounters.length
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
