import { MiloEncounter } from './MiloEncounter'

/** 学习中 words are highlighted wherever they appear; 已掌握 words are left alone. */
export type MiloWordStatus = 'learning' | 'known'

export interface MiloWord {
  id: string
  word: string
  normalizedWord: string
  meaning: string
  phonetic?: string
  partOfSpeech?: string
  sentence?: string
  source: {
    type: 'browser'
    title?: string
    url?: string
  }
  createdAt: number
  encounterCount: number
  encounters: MiloEncounter[]
  /** Missing on words saved before v0.7, which count as 学习中. */
  status?: MiloWordStatus
  /** Times the word turned up again on a page or in a video after it was saved. */
  seenCount?: number
  lastSeen?: { url: string; at: number }
}

/** What a content script needs to recognise saved words on the page. */
export interface SavedWordEntry {
  word: string
  meaning: string
  status: MiloWordStatus
  times: number
}

export interface MiloWordInput {
  word: string
  meaning: string
  phonetic?: string
  partOfSpeech?: string
  sentence?: string
  title?: string
  url?: string
}

function clean(value?: string, limit = 1200): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)
}

export function normalizeWord(word: string): string {
  return clean(word, 80).toLowerCase()
}

export function createEncounter(
  input: MiloWordInput,
  createdAt: number
): MiloEncounter {
  return {
    sentence: clean(input.sentence) || undefined,
    title: clean(input.title, 300) || undefined,
    url: clean(input.url, 2000) || undefined,
    createdAt
  }
}

export function createMiloWord(
  input: MiloWordInput,
  id: string,
  createdAt: number
): MiloWord {
  const word = clean(input.word, 80)
  const normalizedWord = normalizeWord(word)
  const meaning = clean(input.meaning, 500)
  if (!/^[a-z][a-z'-]*$/i.test(word) || !meaning) {
    throw new Error('单词或释义无效')
  }
  const encounter = createEncounter(input, createdAt)
  return {
    id,
    word,
    normalizedWord,
    meaning,
    phonetic: clean(input.phonetic, 100) || undefined,
    partOfSpeech: clean(input.partOfSpeech, 60) || undefined,
    sentence: encounter.sentence,
    source: { type: 'browser', title: encounter.title, url: encounter.url },
    createdAt,
    encounterCount: 1,
    encounters: [encounter]
  }
}

export function addEncounter(
  existing: MiloWord,
  input: MiloWordInput,
  createdAt: number
): MiloWord {
  const encounter = createEncounter(input, createdAt)
  return {
    ...existing,
    meaning: clean(input.meaning, 500) || existing.meaning,
    encounterCount: existing.encounterCount + 1,
    encounters: existing.encounters.concat(encounter)
  }
}

export function wordStatus(word: MiloWord): MiloWordStatus {
  return word.status === 'known' ? 'known' : 'learning'
}

/** Saves plus later sightings: how often the reader has met the word. */
export function timesMet(word: MiloWord): number {
  return word.encounterCount + (word.seenCount || 0)
}
