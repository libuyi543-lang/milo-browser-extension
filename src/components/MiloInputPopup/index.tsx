import React, { FC, useEffect, useRef, useState } from 'react'
import { ShadowPortal } from '@/components/ShadowPortal'
import { SALADICT_PANEL } from '@/_helpers/saladict'
import { isExtensionContextValid } from '@/_helpers/extension-lifecycle'
import {
  InputSelection,
  replaceInputSelection
} from '@/content/input-translation/selection'
import { popupPosition } from '@/content/floating-ui/position'
import { translateInputToEnglish } from '@/services/translation/input'
import { cancelTranslation } from '@/services/translation/cancel'

const style = <style>{require('./popup.shadow.scss').toString()}</style>

export const MiloInputPopup: FC<{
  selection: InputSelection | null
  onClose: () => void
}> = ({ selection, onClose }) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const pending = useRef('')
  const locked = useRef(false)
  useEffect(() => {
    generation.current += 1
    locked.current = false
    setBusy(false)
    setError('')
    if (selection && selection.whole) translate()
    return () => {
      generation.current += 1
      if (pending.current && isExtensionContextValid())
        cancelTranslation(pending.current).catch(() => undefined)
      pending.current = ''
    }
  }, [selection])
  const position = selection
    ? popupPosition(
        selection.x,
        selection.y,
        window.innerWidth,
        window.innerHeight,
        258,
        error ? 230 : 165
      )
    : { left: 0, top: 0 }
  return (
    <ShadowPortal
      id="milo-input-popup-root"
      shadowRootClassName={SALADICT_PANEL}
      head={style}
      in={!!selection}
      timeout={120}
    >
      {() =>
        selection && (
          <aside
            className="milo-input-card"
            style={position}
            role="dialog"
            aria-label="Milo 输入翻译"
            onMouseDown={event => event.preventDefault()}
          >
            <div className="milo-input-head">
              Milo · 输入翻译
              <button aria-label="关闭输入翻译" onClick={onClose}>
                ×
              </button>
            </div>
            <p className="milo-input-source">{selection.text}</p>
            <button
              className="milo-input-action"
              disabled={busy}
              onClick={translate}
            >
              {busy ? '正在翻译成英文…' : '重试翻译'}
            </button>
            {error ? (
              <p className="milo-input-error" role="alert">
                {error}
              </p>
            ) : (
              <p className="milo-input-note">翻译后直接替换输入框内容</p>
            )}
          </aside>
        )
      }
    </ShadowPortal>
  )

  async function translate() {
    if (!selection || locked.current) return
    const version = generation.current
    const session = `input_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`
    locked.current = true
    pending.current = session
    setBusy(true)
    setError('')
    try {
      const result = await translateInputToEnglish(selection.text, session)
      if (generation.current !== version) return
      replaceInputSelection(selection, result)
      onClose()
    } catch (error) {
      if (generation.current === version)
        setError(error.message || '翻译失败，请重试')
    } finally {
      if (pending.current === session) pending.current = ''
      if (generation.current === version) {
        locked.current = false
        setBusy(false)
      }
    }
  }
}
