export interface VideoControlState {
  enabled: boolean
  video: HTMLVideoElement | null
  status: string
}
interface VideoSizeObserver {
  observe(element: Element): void
  unobserve(element: Element): void
  disconnect(): void
}
export function supportsVideoControls(host = window.location.hostname) {
  return /(^|\.)(youtube\.com|youtube-nocookie\.com|x\.com|twitter\.com)$/.test(
    host
  )
}
export function videoContainer(video: HTMLVideoElement): HTMLElement {
  return (video.closest('#movie_player') ||
    video.closest('[data-testid="videoPlayer"]') ||
    video.closest('[data-testid="videoComponent"],ytd-reel-video-renderer') ||
    video.parentElement ||
    video) as HTMLElement
}
export function isCaptionPlayer(video: HTMLVideoElement) {
  if (/(^|\.)youtube(?:-nocookie)?\.com$/.test(window.location.hostname))
    return !!video.closest('#movie_player,ytd-reel-video-renderer')
  return true
}
interface ControlRecord {
  host: HTMLElement
  button: HTMLButtonElement
  status: HTMLElement
  /** Shown above the control bar; the bar itself has no room for text. */
  toast: HTMLElement | null
  toastShell: HTMLElement | null
  toastText: string
  toastTimer: number | undefined
}
const FONT =
  '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif'
const STYLE = `
:host{color-scheme:light}
*{box-sizing:border-box}
.controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font:12px/1.5 ${FONT}}
button{display:inline-flex;align-items:center;gap:7px;border:1px solid #bcd0ea;border-radius:999px;background:#f7faff;color:#3f74c4;padding:6px 12px;font:600 12px/1.5 ${FONT};cursor:pointer;white-space:nowrap}
button:hover{background:#eef5fd}
button:focus-visible{outline:2px solid #7fa9dd;outline-offset:3px}
button[aria-pressed=true]{background:#4a7fc4;border-color:#4a7fc4;color:#fff}
.mark{font:700 14px Georgia,serif;opacity:.85}
.status{color:#6d7c88;max-width:480px;overflow-wrap:anywhere}
@media(prefers-color-scheme:dark){.status{color:#9db1c7}}
/* In YouTube's control bar the button becomes an icon of the same size and
   weight as the ones beside it, and the label and status move out of the way. */
:host([data-mode=bar]) .controls{display:block;width:48px;height:100%;font-size:0}
:host([data-mode=bar]) .label{display:none}
:host([data-mode=bar]) .status{display:none}
:host([data-mode=bar]) button{width:48px;height:100%;justify-content:center;gap:0;border:0;border-radius:0;background:none;color:#fff;padding:0;opacity:.9}
:host([data-mode=bar]) button:hover{background:rgba(255,255,255,.1);opacity:1}
:host([data-mode=bar]) button:focus-visible{outline:2px solid #fff;outline-offset:-4px}
:host([data-mode=bar]) button[aria-pressed=true]{background:none;color:#fff;opacity:1}
:host([data-mode=bar]) button[aria-pressed=true] .mark{box-shadow:inset 0 -.22em #e8c34f;color:#fff6d6}
:host([data-mode=bar]) .mark{font:700 20px Georgia,serif;opacity:1;line-height:1}
:host([data-fullscreen=true]) .status{display:none}
`
const TOAST_STYLE = `
:host{all:initial}
.toast{position:fixed;z-index:2147483646;max-width:min(560px,86vw);padding:6px 12px;border-radius:8px;background:#1f2a33e0;color:#eff5fc;font:12px/1.5 ${FONT};pointer-events:none;overflow-wrap:anywhere;opacity:0;transition:opacity .2s ease-out}
.toast[data-visible=true]{opacity:1}
@media (prefers-reduced-motion:reduce){.toast{transition:none}}
`
/** Anything fixed inside a fullscreen element must live inside it to be seen. */
function appendToOverlayLayer(element: HTMLElement) {
  const layer = document.fullscreenElement || document.body
  element.style.position = document.fullscreenElement ? 'absolute' : ''
  layer.appendChild(element)
}

/** How long a status message stays on screen before it gets out of the way. */
const TOAST_MS = 5000

/** Puts the message where it belongs. It never touches the timer. */
function positionToast(record: ControlRecord, player: HTMLVideoElement) {
  if (!record.toast) return
  if (!record.toastText) {
    record.toast.dataset.visible = 'false'
    return
  }
  const rect = player.getBoundingClientRect()
  Object.assign(record.toast.style, {
    left: `${Math.round(rect.left + 16)}px`,
    bottom: `${Math.round(
      Math.max(16, window.innerHeight - rect.bottom + 56)
    )}px`,
    display: rect.width ? 'block' : 'none'
  })
}

/**
 * A new status arrived. Show it once and let it expire on its own — positioning
 * runs on every scan, so restarting the countdown there would keep the message
 * on screen forever.
 */
function showToast(record: ControlRecord, player: HTMLVideoElement) {
  if (!record.toast) {
    const shell = document.createElement('div')
    shell.className = 'milo-external'
    shell.dataset.miloVideoToast = 'true'
    const root = shell.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = TOAST_STYLE
    const toast = document.createElement('div')
    toast.className = 'toast'
    toast.setAttribute('role', 'status')
    toast.setAttribute('aria-live', 'polite')
    root.append(style, toast)
    appendToOverlayLayer(shell)
    record.toast = toast
    record.toastShell = shell
  }
  const text = record.toastText
  const toast = record.toast!
  if (toast.textContent !== text) toast.textContent = text
  positionToast(record, player)
  if (!text) return
  toast.dataset.visible = 'true'
  if (record.toastTimer !== undefined) clearTimeout(record.toastTimer)
  record.toastTimer = window.setTimeout(() => {
    record.toastTimer = undefined
    if (record.toast) record.toast.dataset.visible = 'false'
  }, TOAST_MS)
}

export function setupVideoControls(toggle: (video: HTMLVideoElement) => void) {
  const records = new Map<HTMLVideoElement, ControlRecord>()
  let state: VideoControlState = { enabled: false, video: null, status: '' }
  let timer: number | undefined
  let closed = false
  let sizeObserver: VideoSizeObserver | null = null
  const watched = new Set<HTMLVideoElement>()
  if (!supportsVideoControls())
    return {
      update: (_state: VideoControlState) => undefined,
      cleanup: () => undefined
    }
  const youtube = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(
    window.location.hostname
  )
  const statusText = (on: boolean, video: HTMLVideoElement) =>
    on && state.enabled && state.video === video
      ? state.status
      : 'Milo · 双语字幕'
  const paint = () =>
    records.forEach((record, video) => {
      const on = state.enabled && state.video === video
      if (record.button.getAttribute('aria-pressed') !== String(on))
        record.button.setAttribute('aria-pressed', String(on))
      record.button.setAttribute(
        'aria-label',
        on ? '关闭字幕翻译' : '开启字幕翻译'
      )
      record.button.title = on
        ? '点击关闭 Milo 双语字幕'
        : youtube
        ? '开启英文 / 中文双语字幕，鼠标移到字幕上可暂停查词'
        : '开启 Milo 双语字幕'
      const text = statusText(on, video)
      if (record.status.textContent !== text) record.status.textContent = text
      if (record.host.dataset.mode === 'bar' && text !== record.toastText) {
        record.toastText = text
        showToast(record, video)
      }
    })
  const anchor = (video: HTMLVideoElement) => {
    const player = videoContainer(video)
    const below = player
      .closest('ytd-watch-flexy')
      ?.querySelector<HTMLElement>('#below')
    // Where YouTube keeps the CC button, next to the quality and info icons.
    const bar = youtube
      ? player.querySelector<HTMLElement>('.ytp-right-controls')
      : null
    return { player, below, bar }
  }
  const scan = () => {
    if (closed) return
    const videos = new Set(Array.from(document.querySelectorAll('video')))
    watched.forEach(item => {
      if (!videos.has(item)) {
        sizeObserver?.unobserve(item)
        watched.delete(item)
      }
    })
    records.forEach((record, video) => {
      if (!videos.has(video)) {
        record.host.remove()
        records.delete(video)
      }
    })
    videos.forEach(video => {
      if (!isCaptionPlayer(video)) return
      if (!watched.has(video)) {
        watched.add(video)
        sizeObserver?.observe(video)
      }
      const rect = (youtube
        ? videoContainer(video)
        : video
      ).getBoundingClientRect()
      if (rect.width < 80 || rect.height < 45) return
      let record = records.get(video)
      if (!record) {
        const host = document.createElement('div')
        host.className = 'milo-external'
        host.dataset.miloVideoControls = 'true'
        host.dataset.mode = 'below'
        Object.assign(host.style, {
          display: 'block',
          width: '100%',
          maxWidth: '100%',
          margin: '8px 0',
          flex: '0 0 auto'
        })
        const root = host.attachShadow({ mode: 'open' })
        const style = document.createElement('style')
        style.textContent = STYLE
        const row = document.createElement('div')
        row.className = 'controls'
        const button = document.createElement('button')
        button.type = 'button'
        const mark = document.createElement('span')
        mark.className = 'mark'
        mark.textContent = 'M'
        mark.setAttribute('aria-hidden', 'true')
        const label = document.createElement('span')
        label.className = 'label'
        label.textContent = '字幕翻译'
        button.append(mark, label)
        const status = document.createElement('span')
        status.className = 'status'
        status.setAttribute('role', 'status')
        status.setAttribute('aria-live', 'polite')
        row.append(button, status)
        root.append(style, row)
        host.addEventListener('click', event => {
          event.preventDefault()
          event.stopPropagation()
        })
        host.addEventListener('keydown', event => event.stopPropagation())
        host.addEventListener('keyup', event => event.stopPropagation())
        button.addEventListener('click', event => {
          event.preventDefault()
          event.stopPropagation()
          if (event.isTrusted) toggle(video)
        })
        record = {
          host,
          button,
          status,
          toast: null,
          toastShell: null,
          toastText: '',
          toastTimer: undefined
        }
        records.set(video, record)
      }
      const { player, below, bar } = anchor(video)
      const fullscreen = document.fullscreenElement
      const inFullscreen =
        !!fullscreen &&
        fullscreen.contains(video) &&
        fullscreen.tagName !== 'VIDEO'
      // YouTube's own control bar is where a subtitle switch belongs: it sits
      // with the CC button, fades out with the rest of the chrome, and needs no
      // room of its own on the page.
      const inBar = !!bar && (!fullscreen || inFullscreen)
      record.host.dataset.mode = inBar ? 'bar' : 'below'
      record.host.dataset.fullscreen = String(!inBar && inFullscreen)
      record.host.title = inBar
        ? statusText(state.enabled && state.video === video, video)
        : ''
      if (inBar) {
        Object.assign(record.host.style, {
          display: 'inline-block',
          width: '48px',
          // Fill the bar, like the CC and settings buttons beside it.
          height: '100%',
          maxWidth: '',
          margin: '0',
          flex: '0 0 auto',
          position: '',
          left: '',
          bottom: '',
          zIndex: ''
        })
        if (record.host.parentElement !== bar)
          bar!.insertBefore(record.host, bar!.firstElementChild)
      } else {
        Object.assign(
          record.host.style,
          inFullscreen
            ? {
                display: 'block',
                position: 'absolute',
                left: '16px',
                bottom: '64px',
                width: 'auto',
                maxWidth: '',
                margin: '0',
                zIndex: '2147483647'
              }
            : {
                display: 'block',
                position: '',
                left: '',
                bottom: '',
                width: '100%',
                maxWidth: '100%',
                margin: '8px 0',
                zIndex: ''
              }
        )
        if (inFullscreen) {
          if (record.host.parentElement !== fullscreen)
            fullscreen!.appendChild(record.host)
        } else if (below) {
          if (record.host.parentElement !== below) below.prepend(record.host)
        } else if (
          player.parentElement &&
          (record.host.parentElement !== player.parentElement ||
            player.nextElementSibling !== record.host)
        ) {
          player.insertAdjacentElement('afterend', record.host)
        }
      }
      positionToast(record, video)
    })
    paint()
  }
  const schedule = () => {
    if (timer === undefined)
      timer = window.setTimeout(() => {
        timer = undefined
        scan()
      }, 200)
  }
  const observer = new MutationObserver(schedule)
  const ResizeObserverClass = (window as any).ResizeObserver as
    | (new (callback: () => void) => VideoSizeObserver)
    | undefined
  if (ResizeObserverClass) sizeObserver = new ResizeObserverClass(schedule)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('resize', schedule)
  document.addEventListener('fullscreenchange', schedule)
  scan()
  return {
    update(value: VideoControlState) {
      state = value
      paint()
    },
    cleanup() {
      closed = true
      sizeObserver?.disconnect()
      watched.clear()
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('fullscreenchange', schedule)
      if (timer !== undefined) clearTimeout(timer)
      records.forEach(record => {
        if (record.toastTimer !== undefined) clearTimeout(record.toastTimer)
        record.host.remove()
        record.toastShell?.remove()
      })
      records.clear()
    }
  }
}
