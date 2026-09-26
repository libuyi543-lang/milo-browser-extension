import { message } from '@/_helpers/browser-api'
import { MiloWord, MiloWordInput } from '@/models/MiloWord'

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
