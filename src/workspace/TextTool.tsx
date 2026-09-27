import React, { useEffect, useRef, useState } from 'react'
import { LANGUAGES, LanguageCode } from '@/models/TranslationPreferences'
import { translateText } from '@/services/translation/general'
import { cancelTranslation } from '@/services/translation/cancel'
export const TextTool = () => {
  const [source, setSource] = useState('')
  const [translated, setTranslated] = useState('')
  const [target, setTarget] = useState<LanguageCode>('zh-CN')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const session = useRef('')
  useEffect(
    () => () => {
      generation.current++
      if (session.current)
        cancelTranslation(session.current).catch(() => undefined)
    },
    []
  )
  const generation = useRef(0)
  return (
    <section>
      <h2>文本翻译</h2>
      <p>粘贴文本，选择目标语言。最长 6500 字符，使用当前 AI 服务与术语表。</p>
      <label>
        译文语言
        <select
          value={target}
          onChange={e => setTarget(e.target.value as LanguageCode)}
        >
          {LANGUAGES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div className="two-columns">
        <label>
          原文
          <textarea
            rows={14}
            maxLength={6500}
            value={source}
            onChange={e => {
              generation.current++
              if (session.current)
                cancelTranslation(session.current).catch(() => undefined)
              setBusy(false)
              setSource(e.target.value)
            }}
          />
        </label>
        <label>
          译文
          <textarea rows={14} value={translated} readOnly />
        </label>
      </div>
      <div className="actions">
        <button
          disabled={busy || !source.trim()}
          onClick={async () => {
            const version = ++generation.current
            const id = `manual_${Date.now()}`
            session.current = id
            setBusy(true)
            setError('')
            try {
              const result = await translateText(source, target, id)
              if (version === generation.current) setTranslated(result)
            } catch (error) {
              if (version === generation.current) setError(error.message)
            } finally {
              if (version === generation.current) setBusy(false)
            }
          }}
        >
          {busy ? '正在翻译…' : '翻译'}
        </button>
        <button
          className="secondary"
          disabled={!busy}
          onClick={() => {
            generation.current++
            cancelTranslation(session.current).catch(() => undefined)
            setBusy(false)
          }}
        >
          停止
        </button>
        <button
          className="secondary"
          disabled={!translated}
          onClick={() =>
            navigator.clipboard
              .writeText(translated)
              .catch(() => setError('复制失败'))
          }
        >
          复制译文
        </button>
      </div>
      <p role="status">{error}</p>
    </section>
  )
}
