import { message } from '@/_helpers/browser-api'
import { cancelTranslation } from './cancel'

export interface ParagraphItem {
  id: string
  text: string
}

export async function translateParagraphs(
  items: readonly ParagraphItem[],
  sessionId?: string
): Promise<readonly ParagraphItem[]> {
  const result = await message.send<'MILO_TRANSLATE_PARAGRAPHS'>({
    type: 'MILO_TRANSLATE_PARAGRAPHS',
    payload: { items: items.slice(), sessionId }
  })
  if (result.error || !result.translations)
    throw new Error(result.error || '页面翻译失败')
  return result.translations
}

export function cancelPageTranslation(sessionId: string): Promise<boolean> {
  return cancelTranslation(sessionId)
}
