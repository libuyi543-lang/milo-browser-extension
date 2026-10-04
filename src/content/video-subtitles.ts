import { message } from '@/_helpers/browser-api'
import { Message } from '@/typings/message'
import { translateText, getPreferences } from '@/services/translation/general'
import { cancelTranslation } from '@/services/translation/cancel'
import {
  setupVideoControls,
  videoContainer,
  isCaptionPlayer
} from './video-controls'
import { TranslationPreferences } from '@/models/TranslationPreferences'
import { isEnglishTrack, parseTimedText, timedTextInfo } from './timedtext'
import {
  createInteractiveSubtitles,
  InteractiveSubtitles,
  SubtitleWord
} from './youtube-subtitles'
import { SavedWords } from './saved-words'

/** Wait this long for YouTube to load the English track before falling back. */
const SOURCE_TIMEOUT = 8000

interface LearningOptions {
  /** Saved words to underline in Milo's subtitles. */
  saved?: SavedWords
  /** Blur the Chinese line until the pointer is on the subtitle. */
  learning?: () => boolean
}

export function setupVideoSubtitles(
  onWord: (word: SubtitleWord | null) => void = () => undefined,
  learningOptions: LearningOptions = {}
) {
  let enabled = false
  let interval: number | undefined
  let overlay: HTMLElement | null = null
  let video: HTMLVideoElement | null = null
  let selected: HTMLVideoElement | null = null
  let original = ''
  let observed = ''
  let observedAt = 0
  let generation = 0
  let pending = ''
  let disposed = false
  let audioOverlay: HTMLElement | null = null
  let preferences: TranslationPreferences | null = null
  let status = ''
  let activatedCC: HTMLButtonElement | null = null
  const tracks = new Map<TextTrack, TextTrackMode>()
  const hidden = new Map<HTMLElement, string>()
  const youtube = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(
    window.location.hostname
  )
  let nativeRequested = false
  let nativeReady = false
  let nativePending = false
  let nativeAttempts = 0
  let nativeRetryAt = 0
  let nativeReadyAt = 0
  let nativeRoute = ''
  // YouTube: Milo's own bilingual layer built from the English track.
  let interactive: InteractiveSubtitles | null = null
  let wordShown = false
  let sourceState: 'idle' | 'requesting' | 'waiting' | 'failed' = 'idle'
  let sourceAttempts = 0
  let sourceRetryAt = 0
  let sourceSince = 0
  let sourceVideoId = ''
  let fallbackNote = ''
  const captured = new Map<string, { text: string; asr: boolean }>()
  const period = youtube ? 100 : 200
  const route = () =>
    new URL(location.href).searchParams.get('v') || location.pathname
  const controls = setupVideoControls(player => togglePlayer(player))
  const updateStatus = (value: string) => {
    status = value
    controls.update({ enabled, video, status })
  }
  const clear = () => {
    generation++
    if (nativeRequested)
      message
        .send<'MILO_YOUTUBE_CAPTIONS'>({
          type: 'MILO_YOUTUBE_CAPTIONS',
          payload: { command: 'stop' }
        })
        .catch(() => undefined)
    nativeRequested = false
    nativeReady = false
    nativePending = false
    nativeAttempts = 0
    nativeRetryAt = 0
    nativeReadyAt = 0
    nativeRoute = ''
    if (interactive) interactive.destroy()
    interactive = null
    if (wordShown) onWord(null)
    wordShown = false
    sourceState = 'idle'
    sourceAttempts = 0
    sourceRetryAt = 0
    sourceSince = 0
    sourceVideoId = ''
    fallbackNote = ''
    if (pending) cancelTranslation(pending).catch(() => undefined)
    pending = ''
    if (interval !== undefined) clearInterval(interval)
    interval = undefined
    overlay?.remove()
    overlay = null
    original = ''
    observed = ''
    observedAt = 0
    tracks.forEach((mode, track) => {
      if (track.mode === 'hidden') track.mode = mode
    })
    tracks.clear()
    hidden.forEach((opacity, node) => {
      node.style.opacity = opacity
    })
    hidden.clear()
    if (activatedCC) {
      activatedCC.removeEventListener('click', userChangedCC)
      if (
        activatedCC.isConnected &&
        activatedCC.getAttribute('aria-pressed') === 'true'
      )
        activatedCC.click()
      activatedCC = null
    }
    video = null
  }
  const userChangedCC = (event: Event) => {
    if (event.isTrusted && activatedCC) {
      activatedCC.removeEventListener('click', userChangedCC)
      activatedCC = null
    }
  }
  const choose = () => {
    if (selected?.isConnected) {
      const rect = selected.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 ? selected : null
    }
    selected = null
    const visible = Array.from(document.querySelectorAll('video')).filter(
      item => {
        if (!isCaptionPlayer(item)) return false
        const rect = item.getBoundingClientRect()
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight
        )
      }
    )
    return (
      visible.find(item => !item.paused) ||
      visible.sort(
        (a, b) =>
          b.getBoundingClientRect().width * b.getBoundingClientRect().height -
          a.getBoundingClientRect().width * a.getBoundingClientRect().height
      )[0] ||
      null
    )
  }
  const position = (element: HTMLElement, player: HTMLVideoElement) => {
    const parent = document.fullscreenElement || document.documentElement
    if (element.parentElement !== parent) parent.appendChild(element)
    const rect = player.getBoundingClientRect()
    element.style.display =
      rect.bottom <= 0 || rect.top >= window.innerHeight || !rect.width
        ? 'none'
        : 'block'
    Object.assign(element.style, {
      left: `${rect.left + rect.width * 0.08}px`,
      top: `${rect.top + rect.height * 0.68}px`,
      width: `${rect.width * 0.84}px`
    })
  }
  const makeOverlay = () => {
    const element = document.createElement('div')
    element.className = 'milo-external'
    element.dataset.miloSubtitles = 'true'
    Object.assign(element.style, {
      position: 'fixed',
      zIndex: '2147483646',
      padding: '8px 15px',
      borderRadius: '8px',
      background: '#16231bdd',
      color: '#fafcf6',
      font: '17px/1.6 -apple-system,sans-serif',
      textAlign: 'center',
      pointerEvents: 'none',
      maxWidth: '85vw',
      whiteSpace: 'pre-wrap'
    })
    return element
  }
  const enableCC = (player: HTMLVideoElement) => {
    const cc = videoContainer(player).querySelector<HTMLButtonElement>(
      '.ytp-subtitles-button'
    )
    if (
      cc &&
      cc.getAttribute('aria-pressed') === 'false' &&
      cc.getAttribute('aria-disabled') !== 'true' &&
      !cc.disabled
    ) {
      cc.click()
      activatedCC = cc
      cc.addEventListener('click', userChangedCC)
    }
  }
  const hideNative = (player: HTMLVideoElement) => {
    const native = videoContainer(player).querySelector<HTMLElement>(
      '.ytp-caption-window-container'
    )
    if (native && !hidden.has(native)) {
      hidden.set(native, native.style.opacity)
      native.style.opacity = '0'
    }
  }
  const requestSource = async () => {
    sourceState = 'requesting'
    sourceAttempts++
    nativeRequested = true
    const version = generation
    updateStatus('正在读取英文字幕…')
    try {
      const result = await message.send<'MILO_YOUTUBE_CAPTIONS'>({
        type: 'MILO_YOUTUBE_CAPTIONS',
        payload: { command: 'start', language: 'en' }
      })
      if (!enabled || version !== generation) return
      if (result.ok) {
        sourceState = 'waiting'
        sourceSince = Date.now()
        sourceVideoId = result.videoId || route()
        // The player may have loaded the track before Milo was listening.
        window.postMessage({ milo: 'timedtext-replay' }, location.origin)
      } else if (result.retryable && sourceAttempts < 3) {
        sourceState = 'idle'
        sourceRetryAt = Date.now() + 1200
        updateStatus('正在等待 YouTube 字幕加载…')
      } else {
        sourceState = 'failed'
        fallbackNote = /英文字幕/.test(result.error || '')
          ? '无英文字幕'
          : '未读取到英文字幕'
      }
    } catch (_) {
      if (version === generation) {
        sourceState = 'failed'
        fallbackNote = '未读取到英文字幕'
      }
    }
  }
  /** Returns true while Milo's own layer is running or still being prepared. */
  const interactiveTick = (player: HTMLVideoElement) => {
    if (interactive) {
      hideNative(player)
      interactive.tick()
      return true
    }
    if (sourceState === 'requesting') return true
    if (sourceState === 'idle') {
      if (Date.now() >= sourceRetryAt) requestSource()
      return true
    }
    if (sourceState !== 'waiting') return false
    const raw = captured.get(sourceVideoId)
    const cues = raw ? parseTimedText(raw.text, raw.asr) : []
    if (cues.length) {
      hideNative(player)
      interactive = createInteractiveSubtitles({
        video: player,
        cues,
        videoId: sourceVideoId,
        onStatus: updateStatus,
        saved: learningOptions.saved,
        learning: learningOptions.learning,
        onWord: word => {
          wordShown = true
          onWord(word)
        }
      })
      return true
    }
    if (Date.now() - sourceSince < SOURCE_TIMEOUT) return true
    sourceState = 'failed'
    fallbackNote = '未读取到英文字幕'
    return false
  }
  const onTimedText = (event: MessageEvent) => {
    const data = event.data
    if (
      event.source !== window ||
      !data ||
      data.milo !== 'timedtext' ||
      typeof data.url !== 'string' ||
      typeof data.text !== 'string'
    )
      return
    const info = timedTextInfo(data.url)
    if (!info || !isEnglishTrack(info)) return
    captured.delete(info.videoId)
    captured.set(info.videoId, { text: data.text, asr: info.asr })
    if (captured.size > 4) captured.delete(captured.keys().next().value)
  }
  const tick = async () => {
    if (!enabled || disposed) return
    if (selected && !selected.isConnected) {
      enabled = false
      selected = null
      clear()
      updateStatus('')
      return
    }
    const player = choose()
    if (!player) {
      if (video) {
        clear()
        if (enabled) interval = window.setInterval(tick, period)
      }
      updateStatus('等待视频')
      return
    }
    if (video !== player) {
      clear()
      video = player
      if (!youtube) enableCC(player)
      interval = window.setInterval(tick, period)
      updateStatus('正在读取视频字幕…')
    }
    if (youtube) {
      if (nativeRoute && nativeRoute !== route()) {
        // Next video in the same tab: start over for it.
        clear()
        selected = null
        interval = window.setInterval(tick, period)
        return
      }
      nativeRoute = route()
      if (interactiveTick(player)) return
      const note = fallbackNote ? `${fallbackNote} · ` : ''
      if (nativeReady) {
        const cc = videoContainer(player).querySelector('.ytp-subtitles-button')
        const text = Array.from(
          videoContainer(player).querySelectorAll('.ytp-caption-segment')
        )
          .map(node => node.textContent || '')
          .join(' ')
          .trim()
        updateStatus(
          note +
            (cc?.getAttribute('aria-pressed') === 'false'
              ? '播放器 CC 已关闭，请开启字幕'
              : /[\u3400-\u9fff]/.test(text)
              ? 'YouTube 中文字幕已开启'
              : text
              ? '字幕仍是原文，请关闭后重试'
              : Date.now() - nativeReadyAt > 20000
              ? '已切换字幕轨，但画面未显示字幕；请检查原生 CC 或关闭后重试'
              : 'YouTube 中文字幕 · 等待字幕显示')
        )
        return
      }
      if (nativePending || nativeAttempts >= 3 || Date.now() < nativeRetryAt)
        return
      nativeAttempts++
      nativePending = true
      nativeRequested = true
      const version = generation
      updateStatus('正在切换 YouTube 中文字幕…')
      try {
        const result = await message.send<'MILO_YOUTUBE_CAPTIONS'>({
          type: 'MILO_YOUTUBE_CAPTIONS',
          payload: { command: 'start' }
        })
        if (!enabled || version !== generation) return
        if (result.ok) {
          nativeReady = true
          nativeReadyAt = Date.now()
          updateStatus(`${note}已切换为 YouTube 中文字幕`)
        } else if (result.retryable && nativeAttempts < 3) {
          nativeRetryAt = Date.now() + 1200
          updateStatus('正在等待 YouTube 字幕加载…')
        } else {
          nativeAttempts = 3
          updateStatus(result.error || 'YouTube 字幕切换失败，请关闭后重试')
        }
      } catch (error) {
        if (version === generation) {
          nativeAttempts = 3
          updateStatus(error.message || '字幕切换失败，请重新加载扩展')
        }
      } finally {
        if (version === generation) nativePending = false
      }
      return
    }
    if (overlay) position(overlay, player)
    let source = ''
    const available = Array.from(player.textTracks).filter(
      track => track.kind === 'subtitles' || track.kind === 'captions'
    )
    const chosen =
      available.find(
        track => track.mode === 'showing' || track.mode === 'hidden'
      ) ||
      available.find(track => /^en/.test(track.language)) ||
      available[0]
    if (chosen) {
      if (!tracks.has(chosen)) {
        tracks.set(chosen, chosen.mode)
        chosen.mode = 'hidden'
      }
      source = Array.from(chosen.activeCues || [])
        .map(cue => (cue as VTTCue).text.replace(/<[^>]+>/g, ''))
        .join('\n')
        .trim()
    }
    const container = videoContainer(player)
    if (!source) {
      const scope =
        container === player.parentElement &&
        !/youtube|(^|\.)x\.com|twitter/.test(window.location.hostname)
          ? document
          : container
      const nodes = scope.querySelectorAll(
        '.ytp-caption-segment,[data-uia="player-timedtext"] span,.atvwebplayersdk-captions-text,[data-testid="videoCaption"],[data-testid="videoCaptions"]'
      )
      source = Array.from(nodes)
        .map(node => node.textContent || '')
        .join(' ')
        .trim()
    }
    if (source !== observed) {
      observed = source
      observedAt = Date.now()
      generation++
      if (pending) cancelTranslation(pending).catch(() => undefined)
      pending = ''
      if (source) {
        if (!overlay) overlay = makeOverlay()
        position(overlay, player)
        overlay.textContent = source
        const native = container.querySelector<HTMLElement>(
          '.ytp-caption-window-container'
        )
        if (native && !hidden.has(native)) {
          hidden.set(native, native.style.opacity)
          native.style.opacity = '0'
        }
        updateStatus('正在翻译字幕…')
      } else {
        overlay?.remove()
        overlay = null
        original = ''
        updateStatus('等待字幕 · 请开启 CC；无字幕视频可用右键音频翻译')
      }
    }
    if (!source) {
      if (!observedAt)
        updateStatus('等待字幕 · 请开启 CC；无字幕视频可用右键音频翻译')
      return
    }
    if (source === original || Date.now() - observedAt < 240) return
    original = source
    const version = generation
    const session = `subtitle_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`
    pending = session
    try {
      const prefs = preferences || (await getPreferences())
      if (!enabled || version !== generation) return
      preferences = prefs
      const result = await translateText(
        source.slice(0, 6000),
        prefs.target,
        session
      )
      if (enabled && version === generation && overlay) {
        overlay.textContent = source + '\n' + result
        updateStatus('双语字幕已开启')
      }
    } catch (error) {
      if (enabled && version === generation && overlay) {
        overlay.textContent =
          source + '\nMilo · ' + (error.message || '字幕翻译失败')
        updateStatus('翻译失败 · 关闭后再开启可重试')
      }
    } finally {
      if (pending === session) pending = ''
    }
  }
  const start = () => {
    preferences = null
    interval = window.setInterval(tick, period)
    tick()
  }
  const togglePlayer = (player: HTMLVideoElement) => {
    const off = enabled && video === player
    clear()
    enabled = !off
    selected = off ? null : player
    if (enabled) start()
    else updateStatus('')
  }
  const toggle = () => {
    enabled = !enabled
    selected = null
    clear()
    if (enabled) start()
    else updateStatus('')
    return Promise.resolve(enabled)
  }
  const move = () => {
    if (interactive) interactive.position()
    if (overlay && video) position(overlay, video)
    if (audioOverlay && choose()) position(audioOverlay, choose()!)
  }
  document.addEventListener('scroll', move, true)
  window.addEventListener('resize', move)
  document.addEventListener('fullscreenchange', move)
  const audioCaption = (messageValue: Message) => {
    const value = (messageValue as Message<'MILO_AUDIO_CAPTION'>).payload
    if (!value.source) {
      audioOverlay?.remove()
      audioOverlay = null
      return Promise.resolve(true)
    }
    const player = choose()
    if (!player) return Promise.resolve(false)
    if (!audioOverlay) {
      audioOverlay = makeOverlay()
      delete audioOverlay.dataset.miloSubtitles
      audioOverlay.dataset.miloAudioSubtitles = 'true'
    }
    position(audioOverlay, player)
    audioOverlay.textContent =
      value.source.slice(0, 6000) + '\n' + value.translation.slice(0, 6000)
    return Promise.resolve(true)
  }
  message.addListener('MILO_AUDIO_CAPTION', audioCaption)
  message.addListener('MILO_TOGGLE_SUBTITLES', toggle)
  if (youtube) window.addEventListener('message', onTimedText)
  getPreferences()
    .then(prefs => {
      if (!disposed && prefs.subtitles && !enabled) toggle()
    })
    .catch(() => undefined)
  const cleanup = () => {
    disposed = true
    enabled = false
    clear()
    window.removeEventListener('message', onTimedText)
    audioOverlay?.remove()
    controls.cleanup()
    document.removeEventListener('scroll', move, true)
    window.removeEventListener('resize', move)
    document.removeEventListener('fullscreenchange', move)
    message.removeListener('MILO_AUDIO_CAPTION', audioCaption)
    message.removeListener('MILO_TOGGLE_SUBTITLES', toggle)
  }
  return Object.assign(cleanup, {
    /** The word card closed; let the video continue if Milo paused it. */
    cardClosed() {
      wordShown = false
      if (interactive) interactive.cardClosed()
    }
  })
}
