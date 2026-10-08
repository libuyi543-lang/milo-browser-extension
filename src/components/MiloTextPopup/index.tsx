import React, { FC, useEffect, useRef, useState } from 'react'
import { ShadowPortal } from '@/components/ShadowPortal'
import { SALADICT_PANEL } from '@/_helpers/saladict'
import { LANGUAGES, LanguageCode } from '@/models/TranslationPreferences'
import { getPreferences, translateText } from '@/services/translation/general'
import { cancelTranslation } from '@/services/translation/cancel'
import { speak } from '@/services/translation/speech'
import { popupPosition } from '@/content/floating-ui/position'
export interface TextSelection {
  text: string
  x: number
  y: number
}
const style = (
  <style>
    {require('../MiloWordPopup/MiloWordPopup.shadow.scss').toString()}
  </style>
)
export const MiloTextPopup: FC<{
  selection: TextSelection | null
  onClose: () => void
}> = ({ selection, onClose }) => {
  const [target, setTarget] = useState<LanguageCode>('zh-CN')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  useEffect(() => {
    if (selection)
      getPreferences()
        .then(prefs =>
          setTarget(
            /[\u3400-\u9fff]/.test(selection.text) && /^zh/.test(prefs.target)
              ? prefs.inputTarget
              : prefs.target
          )
        )
        .catch(() => undefined)
  }, [selection])
  useEffect(() => {
    const current = ++generation.current
    const session = `text_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`
    setText('')
    setError('')
    setBusy(!!selection)
    const timer = selection
      ? setTimeout(() => {
          translateText(selection.text, target, session)
            .then(result => {
              if (current === generation.current) setText(result)
            })
            .catch(error => {
              if (current === generation.current) setError(error.message)
            })
            .finally(() => {
              if (current === generation.current) setBusy(false)
            })
        }, 150)
      : undefined
    return () => {
      generation.current++
      if (timer) clearTimeout(timer)
      cancelTranslation(session).catch(() => undefined)
    }
  }, [selection, target])
  return (
    <ShadowPortal
      id="milo-text-popup-root"
      shadowRootClassName={SALADICT_PANEL}
      head={style}
      in={!!selection}
      timeout={120}
    >
      {() =>
        selection && (
          <article
            className="milo-card"
            style={popupPosition(
              selection.x,
              selection.y,
              window.innerWidth,
              window.innerHeight,
              328,
              350
            )}
            role="dialog"
            aria-label="Milo 文本翻译"
          >
            <button
              className="milo-close"
              aria-label="关闭文本翻译"
              onClick={onClose}
            >
              ×
            </button>
            <div className="milo-footer">Milo · 文本翻译</div>
            <p className="milo-sentence">{selection.text.slice(0, 400)}</p>
            <select
              aria-label="译文语言"
              value={target}
              onChange={event => setTarget(event.target.value as LanguageCode)}
            >
              {LANGUAGES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <p className="milo-meaning" role="status">
              {busy ? '正在翻译…' : error || text}
            </p>
            <button
              className="milo-save"
              disabled={!text}
              onClick={() => speak(text, target)}
            >
              朗读译文
            </button>
            <button
              className="milo-save"
              disabled={!text}
              onClick={() =>
                navigator.clipboard
                  .writeText(text)
                  .catch(() => setError('复制失败，请手动选择译文'))
              }
            >
              复制译文
            </button>
          </article>
        )
      }
    </ShadowPortal>
  )
}
