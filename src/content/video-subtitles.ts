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

export function setupVideoSubtitles() {
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
  const controls = setupVideoControls(player => togglePlayer(player))
  const updateStatus = (value: string) => {
    status = value
    controls.update({ enabled, video, status })
  }
  const clear = () => {
    generation++
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
        if (enabled) interval = window.setInterval(tick, 200)
      }
      updateStatus('等待视频')
      return
    }
    if (video !== player) {
      clear()
      video = player
      enableCC(player)
      interval = window.setInterval(tick, 200)
      updateStatus('正在读取视频字幕…')
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
    interval = window.setInterval(tick, 200)
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
  getPreferences()
    .then(prefs => {
      if (!disposed && prefs.subtitles && !enabled) toggle()
    })
    .catch(() => undefined)
  return () => {
    disposed = true
    enabled = false
    clear()
    audioOverlay?.remove()
    controls.cleanup()
    document.removeEventListener('scroll', move, true)
    window.removeEventListener('resize', move)
    document.removeEventListener('fullscreenchange', move)
    message.removeListener('MILO_AUDIO_CAPTION', audioCaption)
    message.removeListener('MILO_TOGGLE_SUBTITLES', toggle)
  }
}
