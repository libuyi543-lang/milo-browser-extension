import React, { FC, useCallback, useEffect, useRef, useState } from 'react'
import { ShadowPortal } from '@/components/ShadowPortal'
import { SALADICT_PANEL } from '@/_helpers/saladict'
import { Word } from '@/_helpers/record-manager'
import {
  translateWord,
  TranslationResult,
  cancelTranslation,
  speak
} from '@/services/translation'
import { isExtensionContextValid } from '@/_helpers/extension-lifecycle'
import {
  findMiloWord,
  saveMiloWord,
  setMiloWordStatus
} from '@/services/miloStorage'
import { MiloWord, timesMet, wordStatus } from '@/models/MiloWord'
import { popupPosition } from '@/content/floating-ui/position'

export interface MiloSelection {
  word: Word
  x: number
  y: number
}

interface MiloWordPopupProps {
  selection: MiloSelection | null
  onClose: () => void
}

interface CardObserver {
  observe(element: Element): void
  disconnect(): void
}

const style = <style>{require('./MiloWordPopup.shadow.scss').toString()}</style>

export const MiloWordPopup: FC<MiloWordPopupProps> = ({
  selection,
  onClose
}) => {
  const [translation, setTranslation] = useState<TranslationResult | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [retry, setRetry] = useState(0)
  const [record, setRecord] = useState<MiloWord | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const generation = useRef(0)
  const savingLock = useRef(false)
  const observer = useRef<CardObserver | null>(null)
  const [size, setSize] = useState({ width: 328, height: 242 })
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  })
  const cardRef = useCallback((node: HTMLElement | null) => {
    if (observer.current) observer.current.disconnect()
    const ResizeObserverClass = (window as any).ResizeObserver as
      | (new (callback: () => void) => CardObserver)
      | undefined
    if (!node || !ResizeObserverClass) return
    const measure = () => {
      const rect = node.getBoundingClientRect()
      if (rect.width && rect.height)
        setSize(previous =>
          Math.abs(previous.width - rect.width) > 0.5 ||
          Math.abs(previous.height - rect.height) > 0.5
            ? { width: rect.width, height: rect.height }
            : previous
        )
    }
    observer.current = new ResizeObserverClass(measure)
    observer.current.observe(node)
  }, [])
  useEffect(() => {
    const resize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      if (observer.current) observer.current.disconnect()
    }
  }, [])

  useEffect(() => {
    let canceled = false
    let pending = false
    const sessionId = `word_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`
    generation.current += 1
    savingLock.current = false
    setTranslation(null)
    setError('')
    setSaving(false)
    setSaved(false)
    setRecord(null)
    setStatusBusy(false)
    if (selection && isExtensionContextValid())
      findMiloWord(selection.word.text)
        .then(found => {
          if (!canceled) setRecord(found)
        })
        .catch(() => undefined)
    const timer = selection
      ? setTimeout(() => {
          pending = true
          translateWord(selection.word.text, sessionId, selection.word.context)
            .then(result => {
              if (!canceled) setTranslation(result)
            })
            .catch(error => {
              if (!canceled)
                setError(error.message || '释义暂不可用，请重新划词重试')
            })
            .finally(() => {
              pending = false
            })
        }, 150)
      : undefined
    return () => {
      canceled = true
      if (timer !== undefined) clearTimeout(timer)
      if (pending && isExtensionContextValid())
        cancelTranslation(sessionId).catch(() => undefined)
    }
  }, [selection, retry])

  // Subtitle words can be looked up in fullscreen video; follow the card there.
  useEffect(() => {
    const host = document.getElementById('milo-word-popup-root')
    const parent = document.fullscreenElement || document.documentElement
    if (selection && host && host.parentElement !== parent)
      parent.appendChild(host)
  }, [selection])

  const position = selection
    ? popupPosition(
        selection.x,
        selection.y,
        viewport.width,
        viewport.height,
        size.width,
        size.height
      )
    : { left: 0, top: 0 }

  return (
    <ShadowPortal
      id="milo-word-popup-root"
      shadowRootClassName={SALADICT_PANEL}
      head={style}
      in={!!selection}
      timeout={120}
    >
      {() =>
        selection && (
          <article
            ref={cardRef}
            className="milo-card"
            style={position}
            role="dialog"
            aria-label="Milo 单词释义"
          >
            <button className="milo-close" aria-label="关闭" onClick={onClose}>
              ×
            </button>
            <div className="milo-word">{selection.word.text}</div>
            {record && (
              <div className="milo-record">
                <span className="milo-status" data-status={wordStatus(record)}>
                  {wordStatus(record) === 'known' ? '已掌握' : '学习中'}
                </span>
                {record.word.toLowerCase() !==
                  selection.word.text.toLowerCase() && (
                  <span>{record.word} · </span>
                )}
                遇见 {timesMet(record)} 次
                <button
                  className="milo-status-toggle"
                  disabled={statusBusy}
                  onClick={onToggleStatus}
                >
                  {wordStatus(record) === 'known'
                    ? '改回学习中'
                    : '标记为已掌握'}
                </button>
              </div>
            )}
            <div className="milo-pronunciation">
              <span>{translation && translation.phonetic}</span>
              <button onClick={() => speak(selection.word.text, 'en-US')}>
                朗读
              </button>
            </div>
            <div className="milo-meaning" role="status">
              {translation ? (
                <>
                  <span className="milo-pos">{translation.partOfSpeech}</span>
                  {translation.meaning}
                </>
              ) : (
                error || '正在查找释义…'
              )}
            </div>
            {translation && translation.senses && (
              <ul className="milo-senses">
                {translation.senses.slice(1, 4).map(sense => (
                  <li key={sense.pos + sense.meaning}>
                    <span className="milo-pos">{sense.pos}</span>
                    {sense.meaning}
                  </li>
                ))}
              </ul>
            )}
            {selection.word.context && (
              <p className="milo-sentence">“{selection.word.context}”</p>
            )}
            {translation && translation.examples && (
              <ul className="milo-examples">
                {translation.examples.slice(0, 3).map(example => (
                  <li key={example}>{example}</li>
                ))}
              </ul>
            )}
            <button
              className="milo-save"
              disabled={!translation || saving || saved}
              onClick={onSave}
            >
              {saved
                ? '✓ 已加入 Milo'
                : saving
                ? '正在保存…'
                : record
                ? '＋ 记下这个例句'
                : '＋ 加入 Milo'}
            </button>
            {error && !translation && (
              <button
                className="milo-retry"
                onClick={() => setRetry(value => value + 1)}
              >
                重试查词
              </button>
            )}
          </article>
        )
      }
    </ShadowPortal>
  )

  async function onSave() {
    if (!selection || !translation || savingLock.current || saved) return
    const currentGeneration = generation.current
    savingLock.current = true
    setSaving(true)
    setError('')
    try {
      const word = await saveMiloWord({
        word: selection.word.text,
        meaning: translation.meaning,
        phonetic: translation.phonetic,
        partOfSpeech: translation.partOfSpeech,
        sentence: selection.word.context,
        title: selection.word.title,
        url: selection.word.url
      })
      if (currentGeneration === generation.current) {
        setSaved(true)
        setRecord(word)
      }
    } catch (_) {
      if (currentGeneration === generation.current) setError('保存失败，请重试')
    } finally {
      if (currentGeneration === generation.current) {
        savingLock.current = false
        setSaving(false)
      }
    }
  }

  async function onToggleStatus() {
    if (!record || statusBusy) return
    const currentGeneration = generation.current
    setStatusBusy(true)
    try {
      const updated = await setMiloWordStatus(
        record.word,
        wordStatus(record) === 'known' ? 'learning' : 'known'
      )
      if (currentGeneration === generation.current) setRecord(updated)
    } catch (_) {
      if (currentGeneration === generation.current) setError('修改失败，请重试')
    } finally {
      if (currentGeneration === generation.current) setStatusBusy(false)
    }
  }
}

export default MiloWordPopup
