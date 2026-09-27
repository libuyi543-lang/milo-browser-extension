export interface TranslationResult {
  meaning: string
  phonetic?: string
  partOfSpeech?: string
}

export interface TranslationProvider {
  translate(
    text: string,
    sessionId?: string,
    context?: string
  ): Promise<TranslationResult>
}
