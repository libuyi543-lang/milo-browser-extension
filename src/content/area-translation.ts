import { message } from '@/_helpers/browser-api'
export function setupAreaTranslation() {
  let mask: HTMLElement | null = null
  let start: { x: number; y: number } | null = null
  let rectangle: HTMLElement | null = null
  const close = () => {
    if (mask) mask.remove()
    mask = null
    start = null
    rectangle = null
  }
  const begin = () => {
    close()
    mask = document.createElement('div')
    mask.className = 'milo-external'
    mask.tabIndex = -1
    Object.assign(mask.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      cursor: 'crosshair',
      background: '#18261718'
    })
    const label = document.createElement('div')
    label.textContent = 'Milo · 拖动圈选文字区域，Esc 取消'
    Object.assign(label.style, {
      position: 'absolute',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#fafcf4',
      color: '#344d36',
      padding: '10px 18px',
      borderRadius: '9px',
      font: '14px/1.5 sans-serif'
    })
    mask.appendChild(label)
    mask.onmousedown = event => {
      if (!event.isTrusted) return
      event.preventDefault()
      start = { x: event.clientX, y: event.clientY }
      rectangle = document.createElement('div')
      Object.assign(rectangle.style, {
        position: 'absolute',
        border: '2px solid #5c8b62',
        background: '#f6fcf02a'
      })
      mask!.appendChild(rectangle)
    }
    mask.onmousemove = event => {
      if (!start || !rectangle) return
      Object.assign(rectangle.style, {
        left: Math.min(start.x, event.clientX) + 'px',
        top: Math.min(start.y, event.clientY) + 'px',
        width: Math.abs(event.clientX - start.x) + 'px',
        height: Math.abs(event.clientY - start.y) + 'px'
      })
    }
    mask.onmouseup = event => {
      if (!event.isTrusted || !start) return
      const payload = {
        x: Math.min(start.x, event.clientX),
        y: Math.min(start.y, event.clientY),
        width: Math.abs(event.clientX - start.x),
        height: Math.abs(event.clientY - start.y),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      }
      close()
      if (payload.width < 10 || payload.height < 10) return
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          message
            .send<'MILO_CAPTURE_REGION'>({
              type: 'MILO_CAPTURE_REGION',
              payload
            })
            .catch(() => undefined)
        )
      )
    }
    document.documentElement.appendChild(mask)
    mask.focus()
    return Promise.resolve(true)
  }
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close()
  }
  message.addListener('MILO_BEGIN_AREA', begin)
  document.addEventListener('keydown', key, true)
  return () => {
    close()
    message.removeListener('MILO_BEGIN_AREA', begin)
    document.removeEventListener('keydown', key, true)
  }
}
