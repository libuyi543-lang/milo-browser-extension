import { AITranslationProvider } from './AITranslationProvider'
import { TranslationProvider } from './TranslationProvider'

const provider: TranslationProvider = AITranslationProvider

export const translateWord = (text: string, sessionId?: string) =>
  provider.translate(text, sessionId)
export { cancelTranslation } from './cancel'
export { TranslationProvider, TranslationResult } from './TranslationProvider'
