import { message } from '@/_helpers/browser-api'
import {
  MiloWord,
  MiloWordInput,
  MiloWordStatus,
  SavedWordEntry
} from '@/models/MiloWord'

/** UI-facing storage boundary. A future Milo API can implement the same methods. */
export function saveMiloWord(input: MiloWordInput): Promise<MiloWord> {
  return message.send<'MILO_SAVE_WORD'>({
    type: 'MILO_SAVE_WORD',
    payload: input
  })
}

export function listMiloWords(): Promise<readonly MiloWord[]> {
  return message.send<'MILO_LIST_WORDS'>({ type: 'MILO_LIST_WORDS' })
}

export function savedWordIndex(): Promise<readonly SavedWordEntry[]> {
  return message.send<'MILO_WORD_INDEX'>({ type: 'MILO_WORD_INDEX' })
}

export function findMiloWord(word: string): Promise<MiloWord | null> {
  return message.send<'MILO_FIND_WORD'>({
    type: 'MILO_FIND_WORD',
    payload: { word }
  })
}

export async function setMiloWordStatus(
  word: string,
  status: MiloWordStatus
): Promise<MiloWord> {
  const result = await message.send<'MILO_WORD_STATUS'>({
    type: 'MILO_WORD_STATUS',
    payload: { word, status }
  })
  if (!result || result.error || !result.word)
    throw new Error((result && result.error) || '修改失败，请重试')
  return result.word
}

export function reportSeenWords(words: string[]): Promise<number> {
  return message.send<'MILO_WORDS_SEEN'>({
    type: 'MILO_WORDS_SEEN',
    payload: { words }
  })
}
