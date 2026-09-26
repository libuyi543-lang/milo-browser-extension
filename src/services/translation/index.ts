import { DeepSeekProvider } from './DeepSeekProvider'
import { TranslationProvider } from './TranslationProvider'

const provider: TranslationProvider = DeepSeekProvider

export const translateWord = (text: string, sessionId?: string) =>
  provider.translate(text, sessionId)
export { cancelTranslation } from './cancel'
export { TranslationProvider, TranslationResult } from './TranslationProvider'
