import { message } from '@/_helpers/browser-api'
import { Message } from '@/typings/message'
import { translateText, getPreferences } from '@/services/translation/general'
import { cancelTranslation } from '@/services/translation/cancel'

export function setupVideoSubtitles() {
  let enabled = false
  let interval: number | undefined
  let overlay: HTMLElement | null = null
  let video: HTMLVideoElement | null = null
  let original = ''
  let generation = 0
  let pending = ''
  let disposed = false
  let audioOverlay: HTMLElement | null = null
  const tracks = new Map<TextTrack, TextTrackMode>()
  const clear = () => {
    generation++
    if (pending) cancelTranslation(pending).catch(() => undefined)
    pending = ''
    if (interval !== undefined) clearInterval(interval)
    interval = undefined
    if (overlay) overlay.remove()
    overlay = null
    original = ''
    tracks.forEach((mode, track) => {
      track.mode = mode
    })
    tracks.clear()
    video = null
  }
  const tick = async () => {
    const visible = Array.from(document.querySelectorAll('video')).filter(
      item => item.getBoundingClientRect().width > 0
    )
    const player =
      visible.find(item => !item.paused) ||
      visible.sort(
        (a, b) =>
          b.getBoundingClientRect().width * b.getBoundingClientRect().height -
          a.getBoundingClientRect().width * a.getBoundingClientRect().height
      )[0]
    if (!player) return
    if (video !== player) {
      clear()
      video = player
      interval = window.setInterval(tick, 350)
    }
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
    for (const track of chosen ? [chosen] : []) {
      if (track.kind !== 'subtitles' && track.kind !== 'captions') continue
      if (!tracks.has(track)) {
        tracks.set(track, track.mode)
        track.mode = 'hidden'
      }
      if (track.activeCues && track.activeCues.length) {
        source = Array.from(track.activeCues)
          .map(cue => (cue as VTTCue).text.replace(/<[^>]+>/g, ''))
          .join('\n')
        break
      }
    }
    if (!source) {
      const nodes = document.querySelectorAll(
        '.ytp-caption-segment,[data-uia="player-timedtext"] span,.atvwebplayersdk-captions-text'
      )
      source = Array.from(nodes)
        .map(node => node.textContent || '')
        .join(' ')
        .trim()
    }
    if (source === original) return
    original = source
    const version = ++generation
    if (pending) cancelTranslation(pending).catch(() => undefined)
    if (!source) {
      if (overlay) overlay.textContent = ''
      return
    }
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.className = 'milo-external'
      overlay.dataset.miloSubtitles = 'true'
      Object.assign(overlay.style, {
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
      ;(document.fullscreenElement || document.documentElement).appendChild(
        overlay
      )
    }
    const rect = player.getBoundingClientRect()
    Object.assign(overlay.style, {
      left: `${rect.left + rect.width * 0.1}px`,
      top: `${rect.top + rect.height * 0.68}px`,
      width: `${rect.width * 0.8}px`
    })
    overlay.textContent = source
    const session = `subtitle_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`
    pending = session
    try {
      const prefs = await getPreferences()
      const result = await translateText(
        source.slice(0, 6000),
        prefs.target,
        session
      )
      if (enabled && version === generation && overlay)
        overlay.textContent = source + '\n' + result
    } catch (error) {
      if (version === generation && overlay)
        overlay.textContent =
          source + '\nMilo · ' + (error.message || '字幕翻译失败')
    } finally {
      if (pending === session) pending = ''
    }
  }
  const toggle = () => {
    enabled = !enabled
    clear()
    if (enabled) {
      interval = window.setInterval(tick, 350)
      tick()
    }
    return Promise.resolve(enabled)
  }
  const audioCaption = (messageValue: Message) => {
    const value = (messageValue as Message<'MILO_AUDIO_CAPTION'>).payload
    if (!value.source) {
      if (audioOverlay) audioOverlay.remove()
      audioOverlay = null
      return Promise.resolve(true)
    }
    const player = document.querySelector('video')
    if (!player) return Promise.resolve(false)
    if (!audioOverlay) {
      audioOverlay = document.createElement('div')
      audioOverlay.className = 'milo-external'
      Object.assign(audioOverlay.style, {
        position: 'fixed',
        zIndex: '2147483646',
        background: '#16231bdd',
        color: '#f8fbf4',
        padding: '9px 15px',
        borderRadius: '8px',
        font: '16px/1.5 sans-serif',
        textAlign: 'center',
        whiteSpace: 'pre-wrap',
        pointerEvents: 'none'
      })
      ;(document.fullscreenElement || document.documentElement).appendChild(
        audioOverlay
      )
    }
    const rect = player.getBoundingClientRect()
    Object.assign(audioOverlay.style, {
      left: rect.left + rect.width * 0.1 + 'px',
      top: rect.top + rect.height * 0.65 + 'px',
      width: rect.width * 0.8 + 'px'
    })
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
    if (audioOverlay) audioOverlay.remove()
    message.removeListener('MILO_AUDIO_CAPTION', audioCaption)
    enabled = false
    clear()
    message.removeListener('MILO_TOGGLE_SUBTITLES', toggle)
  }
}
