export interface WordSense {
  /** Abbreviated part of speech, e.g. "adj." */
  pos: string
  meaning: string
}

export interface WordDefinition {
  pos: string
  gloss: string
  example?: string
}

export interface TranslationResult {
  meaning: string
  phonetic?: string
  partOfSpeech?: string
  /** Chinese meanings grouped by part of speech. */
  senses?: WordSense[]
  /** English dictionary definitions. */
  definitions?: WordDefinition[]
  examples?: string[]
}

export interface TranslationProvider {
  translate(
    text: string,
    sessionId?: string,
    context?: string
  ): Promise<TranslationResult>
}
