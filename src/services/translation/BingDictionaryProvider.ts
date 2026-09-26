import { message } from '@/_helpers/browser-api'
import { TranslationProvider, TranslationResult } from './TranslationProvider'

/** Adapts the existing Bing dictionary engine and background/offscreen bridge. */
export function parseBingResult(value: any): TranslationResult {
  const result = value && value.result
  if (result && result.type === 'lex' && Array.isArray(result.cdef)) {
    const definitions = result.cdef.filter(
      (item: any) => item && typeof item.def === 'string' && item.def.trim()
    )
    if (definitions.length) {
      return {
        meaning: definitions
          .slice(0, 3)
          .map((item: any) => item.def.trim())
          .join('；'),
        partOfSpeech: definitions[0].pos || undefined
      }
    }
  }
  if (
    result &&
    result.type === 'machine' &&
    typeof result.mt === 'string' &&
    result.mt.trim()
  ) {
    return { meaning: result.mt.trim() }
  }
  throw new Error('暂时没有找到可靠释义，请稍后重试')
}

export const BingDictionaryProvider: TranslationProvider = {
  async translate(text) {
    const response = await message.send<'FETCH_DICT_RESULT'>({
      type: 'FETCH_DICT_RESULT',
      payload: { id: 'bing', text, payload: { isPDF: false } }
    })
    return parseBingResult(response)
  }
}
