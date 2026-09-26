import { message } from '@/_helpers/browser-api'
import { TranslationProvider } from './TranslationProvider'

export const AITranslationProvider: TranslationProvider = {
  async translate(text, sessionId) {
    const response = await message.send<'MILO_TRANSLATE_WORD'>({
      type: 'MILO_TRANSLATE_WORD',
      payload: { text, sessionId }
    })
    if (response.error || !response.result)
      throw new Error(response.error || '翻译失败，请重试')
    return response.result
  }
}
