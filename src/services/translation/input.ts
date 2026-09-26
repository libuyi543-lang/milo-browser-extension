import { message } from '@/_helpers/browser-api'

export async function translateInputToEnglish(
  text: string,
  sessionId: string
): Promise<string> {
  const response = await message.send<'MILO_TRANSLATE_INPUT'>({
    type: 'MILO_TRANSLATE_INPUT',
    payload: { text, sessionId }
  })
  if (!response) throw new Error('Milo 后台尚未更新，请重新加载扩展并刷新此页')
  if (
    !response ||
    response.error ||
    typeof response.text !== 'string' ||
    !response.text.trim()
  )
    throw new Error((response && response.error) || '输入翻译失败，请重试')
  return response.text
}
