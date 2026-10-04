import { message } from '@/_helpers/browser-api'
export interface YouTubeCaptionResult {
  ok: boolean
  error?: string
  retryable?: boolean
  mode?: 'native' | 'auto'
  videoId?: string
}
/** Runs in YouTube's MAIN world. Keep all helpers inside this function. No keys or text leave this world. */
export function manageYouTubeCaptions(
  command: 'start' | 'stop',
  target: string
): YouTubeCaptionResult {
  const player = document.getElementById('movie_player') as any
  if (
    !player ||
    typeof player.getOption !== 'function' ||
    typeof player.setOption !== 'function'
  )
    return {
      ok: false,
      retryable: true,
      error: 'YouTube 播放器尚未就绪，请等待加载后重试'
    }
  const data =
    typeof player.getVideoData === 'function' ? player.getVideoData() || {} : {}
  const videoId = String(
    data.video_id ||
      new URL(location.href).searchParams.get('v') ||
      location.pathname
  )
  const cc = player.querySelector(
    '.ytp-subtitles-button'
  ) as HTMLButtonElement | null
  const current = player.getOption('captions', 'track') || {}
  const previous = player.__MILO_NATIVE_CAPTIONS__
  const fingerprint = (track: any) =>
    String(track.languageCode || '') +
    ':' +
    String(
      (track.translationLanguage && track.translationLanguage.languageCode) ||
        ''
    )
  if (command === 'stop') {
    if (
      previous &&
      previous.videoId === videoId &&
      fingerprint(current) === previous.applied &&
      (!cc || cc.getAttribute('aria-pressed') === 'true')
    ) {
      player.setOption('captions', 'track', previous.original)
      if (!previous.enabled && cc && cc.getAttribute('aria-pressed') === 'true')
        cc.click()
    }
    delete player.__MILO_NATIVE_CAPTIONS__
    return { ok: true, videoId }
  }
  if (typeof player.loadModule === 'function') player.loadModule('captions')
  const tracks: any[] =
    player.getOption('captions', 'tracklist', { includeAsr: true }) || []
  if (!Array.isArray(tracks) || !tracks.length)
    return {
      ok: false,
      retryable: !(
        cc &&
        (cc.disabled || cc.getAttribute('aria-disabled') === 'true')
      ),
      error: '没有读取到 YouTube 字幕轨，请确认此视频提供 CC 字幕'
    }
  const english = target === 'en'
  const sameLanguage = (code: string) =>
    english
      ? /^en(-|$)/.test(String(code || ''))
      : target === 'zh-CN'
      ? ['zh-CN', 'zh-Hans', 'zh'].includes(code)
      : target === 'zh-TW'
      ? ['zh-TW', 'zh-Hant'].includes(code)
      : code === target
  const direct =
    tracks.find(
      track => track.languageCode === target && track.kind !== 'asr'
    ) ||
    tracks.find(
      track => sameLanguage(track.languageCode) && track.kind !== 'asr'
    ) ||
    tracks.find(track => sameLanguage(track.languageCode))
  // The English source drives Milo's own bilingual layer; never auto-translate into it.
  if (english && !direct)
    return {
      ok: false,
      error: '这个视频没有英文字幕，Milo 目前只支持英文视频'
    }
  const translationCode =
    target === 'zh-CN' ? 'zh-Hans' : target === 'zh-TW' ? 'zh-Hant' : target
  const languages: any[] =
    player.getOption('captions', 'translationLanguages') || []
  const language =
    Array.isArray(languages) &&
    languages.find(item => item.languageCode === translationCode)
  if (!direct && !language)
    return {
      ok: false,
      error: '这个视频没有可用的中文字幕或 YouTube 自动翻译选项'
    }
  const source =
    tracks.find(track => track.languageCode === 'en' && track.kind !== 'asr') ||
    tracks.find(track => track.languageCode === 'en') ||
    tracks.find(track => track.languageCode === current.languageCode) ||
    tracks[0]
  if (
    !direct &&
    (source.is_translateable === false || source.isTranslatable === false)
  )
    return { ok: false, error: '这个视频的字幕不允许自动翻译' }
  if (!previous || previous.videoId !== videoId)
    player.__MILO_NATIVE_CAPTIONS__ = {
      original: Object.assign(
        {},
        current,
        current.translationLanguage
          ? {
              translationLanguage: Object.assign(
                {},
                current.translationLanguage
              )
            }
          : {}
      ),
      enabled: !!cc && cc.getAttribute('aria-pressed') === 'true',
      videoId,
      applied: ''
    }
  const state = player.__MILO_NATIVE_CAPTIONS__
  if (cc && cc.getAttribute('aria-pressed') === 'false') cc.click()
  const chosen =
    direct ||
    Object.assign({}, source, {
      translationLanguage: Object.assign({}, language)
    })
  player.setOption('captions', 'track', chosen)
  const applied = player.getOption('captions', 'track') || {}
  if (
    english
      ? !sameLanguage(applied.languageCode) || !!applied.translationLanguage
      : !sameLanguage(applied.languageCode) &&
        (!applied.translationLanguage ||
          applied.translationLanguage.languageCode !== translationCode)
  )
    return {
      ok: false,
      retryable: true,
      error: 'YouTube 尚未切换字幕语言，请重试'
    }
  state.applied = fingerprint(applied)
  return { ok: true, mode: direct ? 'native' : 'auto', videoId }
}
const TIMEDTEXT_HOOK = 'milo-youtube-timedtext'

/**
 * Lets Milo read the caption file YouTube's player already downloads
 * (assets/youtube-timedtext.js). Registered at runtime because the manifest
 * merge would fold a static entry into the main content script.
 */
export async function registerYouTubeTimedTextHook() {
  const scripting = (self as any).chrome && (self as any).chrome.scripting
  if (!scripting || typeof scripting.registerContentScripts !== 'function')
    return
  const script = {
    id: TIMEDTEXT_HOOK,
    matches: ['https://www.youtube.com/*', 'https://m.youtube.com/*'],
    js: ['assets/youtube-timedtext.js'],
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: false,
    persistAcrossSessions: true
  }
  try {
    const existing = await scripting.getRegisteredContentScripts({
      ids: [TIMEDTEXT_HOOK]
    })
    if (existing.length) await scripting.updateContentScripts([script])
    else await scripting.registerContentScripts([script])
  } catch (error) {
    console.warn('Milo: YouTube caption hook unavailable', error)
  }
}

export function startYouTubeCaptionsServer() {
  registerYouTubeTimedTextHook()
  const queue = new Map<number, Promise<any>>()
  message.addListener('MILO_YOUTUBE_CAPTIONS', async (msg, sender) => {
    try {
      if (
        !sender.tab ||
        sender.tab.id === undefined ||
        (sender as any).frameId > 0 ||
        !sender.url ||
        !/(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(
          new URL(sender.url).hostname
        )
      )
        throw new Error('此入口只用于 YouTube 视频页面')
      if (!['start', 'stop'].includes(msg.payload.command))
        throw new Error('字幕操作无效')
      const language = msg.payload.language === 'en' ? 'en' : 'zh-CN'
      const tabId = sender.tab.id
      const scripting = (self as any).chrome.scripting
      if (!scripting)
        throw new Error('请更新并重新加载扩展，以启用 YouTube 字幕控制')
      const documentId = (sender as any).documentId
      const target = documentId
        ? { tabId, documentIds: [documentId] }
        : { tabId, frameIds: [0] }
      const previous = queue.get(tabId) || Promise.resolve()
      const task = previous
        .catch(() => undefined)
        .then(() =>
          scripting.executeScript({
            target,
            world: 'MAIN',
            func: manageYouTubeCaptions,
            args: [msg.payload.command, language]
          })
        )
      queue.set(tabId, task)
      const cleanup = () => {
        if (queue.get(tabId) === task) queue.delete(tabId)
      }
      task.then(cleanup, cleanup)
      const results = await task
      return (
        results[0]?.result || { ok: false, error: 'YouTube 字幕控制未返回结果' }
      )
    } catch (error) {
      return { ok: false, error: error.message || 'YouTube 字幕切换失败' }
    }
  })
}
