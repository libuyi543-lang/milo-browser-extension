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
export function setupVideoControls(toggle: (video: HTMLVideoElement) => void) {
  const records = new Map<
    HTMLVideoElement,
    { host: HTMLElement; button: HTMLButtonElement; status: HTMLElement }
  >()
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
      const text = on ? state.status : 'Milo · 双语字幕'
      if (record.status.textContent !== text) record.status.textContent = text
    })
  const anchor = (video: HTMLVideoElement) => {
    const player = videoContainer(video)
    const below = player
      .closest('ytd-watch-flexy')
      ?.querySelector<HTMLElement>('#below')
    return { player, below }
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
        Object.assign(host.style, {
          display: 'block',
          width: '100%',
          maxWidth: '100%',
          margin: '8px 0',
          flex: '0 0 auto'
        })
        const root = host.attachShadow({ mode: 'open' })
        const style = document.createElement('style')
        style.textContent = `:host{color-scheme:light}:host([data-fullscreen=true]) .status{display:none}*{box-sizing:border-box}.controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button{display:inline-flex;align-items:center;gap:7px;border:1px solid #bacbb7;border-radius:999px;background:#fbfcf7;color:#3e664b;padding:6px 12px;font:600 12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;white-space:nowrap}button:hover{background:#eef4e6}button:focus-visible{outline:2px solid #83a878;outline-offset:3px}button[aria-pressed=true]{background:#426951;border-color:#426951;color:#fff}.mark{font:700 14px Georgia,serif;opacity:.85}.status{color:#737e6c;max-width:480px;overflow-wrap:anywhere}@media(prefers-color-scheme:dark){.status{color:#9cab99}}`
        const row = document.createElement('div')
        row.className = 'controls'
        const button = document.createElement('button')
        button.type = 'button'
        const mark = document.createElement('span')
        mark.className = 'mark'
        mark.textContent = 'M'
        mark.setAttribute('aria-hidden', 'true')
        const label = document.createElement('span')
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
        record = { host, button, status }
        records.set(video, record)
      }
      const { player, below } = anchor(video)
      const fullscreen = document.fullscreenElement
      const inFullscreen =
        !!fullscreen &&
        fullscreen.contains(video) &&
        fullscreen.tagName !== 'VIDEO'
      record.host.dataset.fullscreen = String(inFullscreen)
      Object.assign(
        record.host.style,
        inFullscreen
          ? {
              position: 'absolute',
              left: '16px',
              bottom: '64px',
              width: 'auto',
              zIndex: '2147483647'
            }
          : { position: '', left: '', bottom: '', width: '100%', zIndex: '' }
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
      records.forEach(record => record.host.remove())
      records.clear()
    }
  }
}
