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

export function startMiloStorageServer(): void {
  message.addListener('MILO_SAVE_WORD', msg => saveMiloWordLocally(msg.payload))
  message.addListener('MILO_LIST_WORDS', () => listMiloWordsLocally())
}
