import { message } from '@/_helpers/browser-api'
import { ImageTranslation, VisionProvider } from '@/models/MediaTranslation'
export async function translateImage(
  dataURL: string,
  provider: VisionProvider,
  sessionId: string
): Promise<ImageTranslation> {
  const result = await message.send<'MILO_TRANSLATE_IMAGE'>({
    type: 'MILO_TRANSLATE_IMAGE',
    payload: { dataURL, provider, sessionId }
  })
  if (!result || result.error || !result.result)
    throw new Error((result && result.error) || '图像翻译失败')
  return result.result
}
export async function transcribeAudio(
  dataURL: string,
  sessionId: string
): Promise<string> {
  const result = await message.send<'MILO_TRANSCRIBE_AUDIO'>({
    type: 'MILO_TRANSCRIBE_AUDIO',
    payload: { dataURL, sessionId }
  })
  if (!result || result.error || typeof result.text !== 'string')
    throw new Error((result && result.error) || '音频转录失败')
  return result.text
}
