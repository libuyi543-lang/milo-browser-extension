import { message } from '@/_helpers/browser-api'
import { isExtensionContextValid } from '@/_helpers/extension-lifecycle'
import {
  clampTop,
  FloatingButtonAction,
  siteMatches,
  TranslationPreferences
} from '@/models/TranslationPreferences'
import { getPreferences } from '@/services/translation/general'
import { PageTranslationState } from './page-translation'

const STYLE = `
:host{all:initial;color-scheme:light}
*{box-sizing:border-box}
.dock{position:relative;display:flex;align-items:center;font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.main{position:relative;width:46px;height:40px;padding:0 8px 0 0;border:1px solid #cddbc8;border-right:0;border-radius:20px 0 0 20px;background:#fbfcf7;color:#3e664b;box-shadow:0 3px 14px rgba(40,60,45,.16);cursor:pointer;display:flex;align-items:center;justify-content:center;transform:translateX(8px);opacity:.85;transition:transform .2s ease-out,opacity .2s ease-out,background-color .2s,color .2s;touch-action:none;user-select:none}
.dock:hover .main,.main:focus-visible,.dock[data-open=true] .main,.dock[data-dragging=true] .main{transform:none;opacity:1}
.main:focus-visible{outline:2px solid #83a878;outline-offset:2px}
.mark{font:700 17px Georgia,serif;pointer-events:none}
.dock[data-state=active] .main{background:#426951;border-color:#426951;color:#fff}
.ring{position:absolute;left:4px;top:4px;width:30px;height:30px;border-radius:50%;border:2px solid transparent;border-top-color:currentColor;opacity:0;pointer-events:none}
.dock[data-state=running] .ring{opacity:.75;animation:spin .9s linear infinite}
.dock[data-state=failed] .main::after{content:"";position:absolute;left:6px;top:5px;width:8px;height:8px;border-radius:50%;background:#d0674a;border:1.5px solid #fbfcf7}
.close{position:absolute;left:-8px;top:-8px;width:18px;height:18px;padding:0;border:1px solid #cddbc8;border-radius:50%;background:#fff;color:#7a8676;font:13px/15px -apple-system,sans-serif;cursor:pointer;opacity:0;transform:scale(.7);transition:opacity .15s,transform .15s;pointer-events:none}
.dock:hover .close,.close:focus-visible,.dock[data-open=true] .close{opacity:1;transform:none;pointer-events:auto}
.dock[data-dragging=true] .close{opacity:0;pointer-events:none}
.close:hover{color:#3e664b;border-color:#9fb79a}
.menu{position:absolute;right:52px;top:50%;width:150px;padding:6px;border-radius:12px;background:#fbfcf7;box-shadow:0 6px 24px rgba(40,60,45,.2);transform:translateY(-50%);animation:pop .16s ease-out}
.menu button{display:block;width:100%;padding:7px 10px;border:0;border-radius:8px;background:transparent;color:#344b3c;font:13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;text-align:left;cursor:pointer}
.menu button:hover,.menu button:focus-visible{background:#edf3e8;outline:none}
.menu p{margin:4px 10px 2px;color:#8a9586;font-size:11px}
.toast{position:absolute;right:8px;top:50%;width:max-content;max-width:220px;padding:8px 12px;border-radius:10px;background:#344b3c;color:#fff;font:12px/1.5 -apple-system,sans-serif;transform:translateY(-50%);animation:pop .16s ease-out}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pop{from{opacity:0;transform:translateY(-50%) scale(.96)}}
@media (prefers-reduced-motion:reduce){.main,.close{transition:none}.menu,.toast{animation:none}.dock[data-state=running] .ring{animation-duration:2.4s}}
@media print{.dock{display:none}}
`

const SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform)
  ? '⌥⇧Y'
  : 'Alt+Shift+Y'

/** Whether the button belongs on this site under the given preferences. */
export function floatingButtonAllowed(
  preferences: TranslationPreferences,
  hostname: string
) {
  return (
    preferences.floatingButton &&
    !siteMatches(hostname, preferences.floatingHiddenSites) &&
    !siteMatches(hostname, preferences.excludedSites)
  )
}

export function setupFloatingButton(onClick: () => void) {
  let host: HTMLElement | null = null
  let dock: HTMLElement | null = null
  let main: HTMLButtonElement | null = null
  let menu: HTMLElement | null = null
  let top = clampTop(undefined)
  let state: PageTranslationState = {
    active: false,
    running: false,
    failed: false
  }
  let closed = false

  const send = (payload: FloatingButtonAction) =>
    isExtensionContextValid()
      ? message
          .send<'MILO_FLOATING_BUTTON'>({
            type: 'MILO_FLOATING_BUTTON',
            payload
          })
          .catch(() => undefined)
      : Promise.resolve(undefined)

  const paint = () => {
    if (!dock || !main) return
    const name = state.running
      ? 'running'
      : state.failed
      ? 'failed'
      : state.active
      ? 'active'
      : 'idle'
    dock.dataset.state = name
    const label = state.running
      ? '正在翻译，点击停止'
      : state.active
      ? '恢复原文'
      : `翻译此页（${SHORTCUT}）`
    main.setAttribute('aria-label', label)
    main.title = label
    main.setAttribute('aria-pressed', String(state.active))
  }

  const place = () => {
    if (host) host.style.top = `calc(${(top * 100).toFixed(2)}vh - 20px)`
  }

  const closeMenu = () => {
    if (menu) menu.remove()
    menu = null
    if (dock) dock.dataset.open = 'false'
  }

  const remove = () => {
    closeMenu()
    if (host) host.remove()
    host = dock = main = null
  }

  const toast = (text: string) => {
    if (!dock) return
    closeMenu()
    dock.querySelectorAll('.main,.close').forEach(node => node.remove())
    const note = document.createElement('div')
    note.className = 'toast'
    note.setAttribute('role', 'status')
    note.textContent = text
    dock.appendChild(note)
    window.setTimeout(remove, 2600)
  }

  const openMenu = () => {
    if (!dock || menu) {
      closeMenu()
      return
    }
    menu = document.createElement('div')
    menu.className = 'menu'
    menu.setAttribute('role', 'menu')
    const item = (text: string, payload: FloatingButtonAction) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.textContent = text
      button.addEventListener('click', () => {
        send(payload)
        toast('已隐藏，可在 Milo 阅读设置中重新开启')
      })
      return button
    }
    const note = document.createElement('p')
    note.textContent = `仍可用 ${SHORTCUT} 翻译网页`
    menu.append(
      item('在此网站隐藏', { action: 'hide-site' }),
      item('在所有网站隐藏', { action: 'hide-all' }),
      note
    )
    dock.dataset.open = 'true'
    dock.appendChild(menu)
    const first = menu.querySelector('button')
    if (first) first.focus()
  }

  const mount = () => {
    if (host || closed) return
    host = document.createElement('div')
    host.className = 'milo-external'
    host.dataset.miloFloatingButton = 'true'
    Object.assign(host.style, {
      all: 'initial',
      position: 'fixed',
      right: '0',
      zIndex: '2147483646'
    })
    place()
    const root = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = STYLE
    dock = document.createElement('div')
    dock.className = 'dock'
    main = document.createElement('button')
    main.type = 'button'
    main.className = 'main'
    const ring = document.createElement('span')
    ring.className = 'ring'
    const mark = document.createElement('span')
    mark.className = 'mark'
    mark.textContent = 'M'
    mark.setAttribute('aria-hidden', 'true')
    main.append(ring, mark)
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'close'
    close.textContent = '×'
    close.setAttribute('aria-label', '隐藏悬浮按钮')
    close.setAttribute('aria-haspopup', 'menu')
    close.addEventListener('click', openMenu)
    dock.append(main, close)
    root.append(style, dock)

    // Vertical drag; a press that does not move is a click.
    let drag: { y: number; top: number; moved: boolean } | null = null
    main.addEventListener('pointerdown', event => {
      if (event.button !== 0) return
      drag = { y: event.clientY, top, moved: false }
      main!.setPointerCapture(event.pointerId)
    })
    main.addEventListener('pointermove', event => {
      if (!drag) return
      const delta = event.clientY - drag.y
      if (!drag.moved && Math.abs(delta) < 5) return
      drag.moved = true
      dock!.dataset.dragging = 'true'
      top = clampTop(drag.top + delta / window.innerHeight)
      place()
    })
    const release = () => {
      if (drag && drag.moved) send({ action: 'move', top })
      if (dock) dock.dataset.dragging = 'false'
      window.setTimeout(() => {
        drag = null
      })
    }
    main.addEventListener('pointerup', release)
    main.addEventListener('pointercancel', release)
    main.addEventListener('click', event => {
      if (drag && drag.moved) return
      if (!event.isTrusted) return
      closeMenu()
      onClick()
    })
    // Keep page handlers (shortcuts, click-away, selection) out of Milo's UI.
    for (const type of [
      'click',
      'mousedown',
      'mouseup',
      'pointerdown',
      'keyup'
    ])
      host.addEventListener(type, event => event.stopPropagation())
    host.addEventListener('keydown', event => {
      event.stopPropagation()
      if ((event as KeyboardEvent).key === 'Escape') closeMenu()
    })
    paint()
    document.documentElement.appendChild(host)
  }

  const onFullscreen = () => {
    if (host) host.style.display = document.fullscreenElement ? 'none' : ''
  }
  const onOutside = (event: Event) => {
    if (menu && host && !event.composedPath().includes(host)) closeMenu()
  }
  document.addEventListener('fullscreenchange', onFullscreen)
  document.addEventListener('pointerdown', onOutside, true)

  getPreferences()
    .then(preferences => {
      top = preferences.floatingTop
      if (floatingButtonAllowed(preferences, window.location.hostname)) mount()
    })
    .catch(() => undefined)

  return {
    update(value: PageTranslationState) {
      state = value
      paint()
    },
    cleanup() {
      closed = true
      document.removeEventListener('fullscreenchange', onFullscreen)
      document.removeEventListener('pointerdown', onOutside, true)
      remove()
    }
  }
}
