import { message } from '@/_helpers/browser-api'

/**
 * 系统自带的 window.speechSynthesis 在不同机器上挑到的嗓音差异很大 —— macOS 上
 * 常常用中文嗓音念英文，听起来含混不清。这里改成取 Google 的合成音频，音质稳定
 * 且中英文都能读对。取不到时才回退到系统嗓音。
 */

/** Google TTS 的 tl 参数只认基础语言码。 */
export const speechLang = (lang: string) =>
  /^zh/i.test(lang) ? 'zh-CN' : (lang.split('-')[0] || 'en').toLowerCase()

/** 正在播放的音频，换词朗读时先停掉上一段。 */
let current: HTMLAudioElement | null = null
/** 每次朗读一个编号，新的朗读开始后旧分片不再续播。 */
let generation = 0

export function stopSpeaking() {
  generation += 1
  if (current) {
    current.pause()
    current = null
  }
  if (typeof window !== 'undefined' && window.speechSynthesis)
    window.speechSynthesis.cancel()
}

function play(base64: string, version: number, onDone: () => void) {
  const audio = new Audio(`data:audio/mpeg;base64,${base64}`)
  current = audio
  audio.onended = () => {
    if (version === generation) onDone()
  }
  audio.onerror = () => {
    if (version === generation && current === audio) current = null
  }
  return audio.play()
}

function speakLocally(text: string, lang: string) {
  if (!window.speechSynthesis) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = speechLang(lang)
  utterance.rate = 0.9
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

export async function speak(text: string, lang = 'en-US'): Promise<void> {
  const value = text.trim()
  if (!value) return
  stopSpeaking()
  const version = generation
  try {
    const response = await message.send<'MILO_SPEAK'>({
      type: 'MILO_SPEAK',
      payload: { text: value, lang: speechLang(lang) }
    })
    if (!response || response.error || !response.audio)
      throw new Error((response && response.error) || '朗读失败')
    const parts: string[] = JSON.parse(response.audio)
    if (!parts.length) throw new Error('朗读失败')
    if (version !== generation) return
    // 长文本被切成多段，一段放完再放下一段，顺序不能乱。
    const next = (index: number) => {
      if (index >= parts.length || version !== generation) return
      play(parts[index], version, () => next(index + 1)).catch(() => undefined)
    }
    next(0)
  } catch (_) {
    if (version !== generation) return
    // 网络或权限出问题时，宁可声音差一点也要读出来。
    speakLocally(value, lang)
  }
}
