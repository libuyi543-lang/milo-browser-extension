import React, { useEffect, useRef, useState } from 'react'
import { LANGUAGES, LanguageCode } from '@/models/TranslationPreferences'
import { AISettings, getAIProvider } from '@/models/AIProvider'
import { getAISettings } from '@/services/aiSettings'
import { getPreferences, translateText } from '@/services/translation/general'
import { cancelTranslation } from '@/services/translation/cancel'

const LIMIT = 6500
const EXAMPLE =
  'Learning a language is not just about remembering words. It is about discovering new ways to see the world.'
const LanguageOptions = () => (
  <>
    <optgroup label="常用语言">
      {LANGUAGES.slice(0, 13).map(([code, name]) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </optgroup>
    <optgroup label="更多语言">
      {LANGUAGES.slice(13).map(([code, name]) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </optgroup>
  </>
)

export const TextTool = ({
  active = true,
  onConfigure = () => undefined
}: {
  active?: boolean
  onConfigure?: () => void
}) => {
  const [source, setSource] = useState('')
  const [origin, setOrigin] = useState<LanguageCode>('auto')
  const [target, setTarget] = useState<LanguageCode>('zh-CN')
  const [result, setResult] = useState<{
    text: string
    source: string
    origin: string
    target: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [settings, setSettings] = useState<AISettings | null>(null)
  const [settingsError, setSettingsError] = useState('')
  const session = useRef('')
  const generation = useRef(0)
  const preferencesLoaded = useRef(false)
  const copyGeneration = useRef(0)
  const input = useRef<HTMLTextAreaElement>(null)
  const stale =
    !!result &&
    (result.source !== source ||
      result.target !== target ||
      result.origin !== origin)
  const translated = result ? result.text : ''
  const cancel = () => {
    generation.current++
    if (session.current)
      cancelTranslation(session.current).catch(() => undefined)
    session.current = ''
    setBusy(false)
  }
  useEffect(() => {
    if (!active) {
      cancel()
      return
    }
    let current = true
    getAISettings()
      .then(value => {
        if (current) {
          setSettings(value)
          setSettingsError('')
        }
      })
      .catch(error => {
        if (current) {
          setSettings(null)
          setSettingsError(error.message)
        }
      })
    if (!preferencesLoaded.current)
      getPreferences()
        .then(value => {
          if (current && !preferencesLoaded.current) {
            setOrigin(value.source)
            setTarget(value.target)
            preferencesLoaded.current = true
          }
        })
        .catch(() => undefined)
    return () => {
      current = false
      copyGeneration.current++
      generation.current++
      if (session.current)
        cancelTranslation(session.current).catch(() => undefined)
    }
  }, [active])
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2400)
    return () => window.clearTimeout(timer)
  }, [copied])
  const edit = () => {
    preferencesLoaded.current = true
    cancel()
    copyGeneration.current++
    setCopied(false)
    setError('')
    setNotice('')
  }
  const run = async () => {
    if (busy || !source.trim() || !settings?.configured) return
    const version = ++generation.current
    const id = `manual_${Date.now()}_${version}`
    session.current = id
    setBusy(true)
    setError('')
    setNotice('')
    setCopied(false)
    copyGeneration.current++
    try {
      const text = await translateText(source, target, id, origin)
      if (version === generation.current)
        setResult({ text, source, origin, target })
    } catch (error) {
      if (version === generation.current)
        setError(error.message || '翻译失败，请重试')
    } finally {
      if (version === generation.current) {
        setBusy(false)
        session.current = ''
      }
    }
  }
  const status = busy
    ? '正在翻译，可随时停止'
    : error
    ? '翻译未完成'
    : stale
    ? '内容已修改，等待重新翻译'
    : result
    ? '翻译完成'
    : '准备开始'
  return (
    <section
      className="text-tool"
      aria-labelledby="text-tool-title"
      onKeyDown={event => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key === 'Enter' &&
          !(event.nativeEvent as any).isComposing
        ) {
          event.preventDefault()
          run()
        }
        if (event.key === 'Escape' && busy) {
          event.preventDefault()
          cancel()
          setNotice('已停止，原文已保留')
        }
      }}
    >
      <header className="text-heading">
        <div>
          <span className="workspace-eyebrow">阅读 · 表达</span>
          <h2 id="text-tool-title">文本翻译</h2>
          <p>让文字跨过语言，也保留原来的意思。</p>
        </div>
        <button
          className="service-link"
          onClick={onConfigure}
          title={settings?.model}
        >
          <span
            className={`service-dot ${settings?.configured ? 'is-ready' : ''}`}
          />
          {settings ? getAIProvider(settings.provider).name : '翻译服务'}
          <span className="service-detail">
            {settings?.configured ? '更换' : '配置'} ↗
          </span>
        </button>
      </header>
      {(settingsError || (settings && !settings.configured)) && (
        <div className="configuration-note" role="status">
          <span>{settingsError || '添加 API Key 后，就可以开始翻译。'}</span>
          <button className="link" onClick={onConfigure}>
            配置翻译服务 →
          </button>
        </div>
      )}
      <div className="translation-editor" aria-busy={busy}>
        <div className="language-bar">
          <label htmlFor="text-source-language">
            <span>原文语言</span>
            <select
              id="text-source-language"
              value={origin}
              onChange={e => {
                edit()
                setOrigin(e.target.value)
              }}
            >
              <option value="auto">自动识别</option>
              <LanguageOptions />
            </select>
          </label>
          <button
            className="swap-languages"
            aria-label="交换语言"
            title={
              origin === 'auto'
                ? '指定原文语言后可交换语言'
                : '交换原文与译文语言'
            }
            disabled={origin === 'auto'}
            onClick={() => {
              edit()
              setOrigin(target)
              setTarget(origin)
              if (result && !stale) {
                setSource(result.text.slice(0, LIMIT))
                setResult(null)
                if (result.text.length > LIMIT)
                  setNotice('译文超过上限，已保留前 6500 字符')
              }
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4" />
            </svg>
          </button>
          <label htmlFor="text-target-language">
            <span>译文语言</span>
            <select
              id="text-target-language"
              value={target}
              onChange={e => {
                edit()
                setTarget(e.target.value)
              }}
            >
              <LanguageOptions />
            </select>
          </label>
        </div>
        <div className="text-editors two-columns">
          <div className="text-pane">
            <div className="pane-heading">
              <label htmlFor="text-source">原文</label>
              <button
                className="pane-action"
                disabled={!source && !result}
                onClick={() => {
                  edit()
                  setSource('')
                  setResult(null)
                  input.current?.focus()
                }}
              >
                清空
              </button>
            </div>
            <textarea
              ref={input}
              id="text-source"
              aria-label="原文"
              placeholder="在这里输入或粘贴需要翻译的文字…"
              rows={12}
              maxLength={LIMIT}
              value={source}
              onChange={e => {
                edit()
                setSource(e.target.value)
              }}
              onPaste={event => {
                const field = event.currentTarget
                const pasted = event.clipboardData.getData('text')
                const remaining =
                  LIMIT -
                  source.length +
                  field.selectionEnd -
                  field.selectionStart
                if (pasted.length > remaining) {
                  event.preventDefault()
                  edit()
                  setSource(
                    source.slice(0, field.selectionStart) +
                      pasted.slice(0, remaining) +
                      source.slice(field.selectionEnd)
                  )
                  setNotice('文本超过上限，已保留前 6500 字符')
                }
              }}
            />
            <div className="pane-footer">
              <button
                className="pane-action"
                onClick={() => {
                  edit()
                  setSource(EXAMPLE)
                  input.current?.focus()
                }}
                disabled={!!source}
              >
                试试示例
              </button>
              <span className={source.length >= LIMIT ? 'at-limit' : ''}>
                {source.length.toLocaleString()} / 6,500
              </span>
            </div>
          </div>
          <div className={`text-pane result-pane ${stale ? 'is-stale' : ''}`}>
            <div className="pane-heading">
              <label htmlFor="text-result">译文</label>
              <span className={`result-state ${busy ? 'is-working' : ''}`}>
                {busy ? '翻译中' : stale ? '待更新' : result ? '已完成' : ''}
              </span>
            </div>
            <textarea
              id="text-result"
              aria-label="译文"
              rows={12}
              value={translated}
              readOnly
              placeholder={
                busy
                  ? '正在理解原文，译文很快就会出现在这里…'
                  : '译文将在这里显示'
              }
            />
            <div className="pane-footer">
              <span>
                {stale
                  ? '原文或语言已修改，请重新翻译'
                  : busy
                  ? '保留段落与换行'
                  : result
                  ? `${translated.length.toLocaleString()} 字符`
                  : '支持多语言与术语表'}
              </span>
              <button
                className="pane-action"
                disabled={!translated || stale || busy}
                onClick={async () => {
                  const version = ++copyGeneration.current
                  try {
                    await navigator.clipboard.writeText(translated)
                    if (version === copyGeneration.current) {
                      setCopied(true)
                      setNotice('译文已复制')
                    }
                  } catch (_) {
                    if (version === copyGeneration.current)
                      setNotice('复制未成功，请选中译文手动复制')
                  }
                }}
              >
                {copied ? '✓ 已复制' : '复制译文'}
              </button>
            </div>
          </div>
        </div>
        <div className="translation-toolbar">
          <div className="translation-status" role="status" aria-live="polite">
            <span className={`status-dot ${busy ? 'is-working' : ''}`} />
            {notice || status}
          </div>
          <div className="translate-controls">
            <span className="keyboard-hint">⌘ / Ctrl + Enter</span>
            {busy ? (
              <button
                className="translate-button secondary"
                onClick={() => {
                  cancel()
                  setNotice('已停止，原文已保留')
                }}
              >
                停止翻译
              </button>
            ) : (
              <button
                className="translate-button"
                disabled={!source.trim() || !settings?.configured}
                onClick={run}
              >
                {error ? '重新翻译' : '翻译'}
                <span aria-hidden="true"> →</span>
              </button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <div className="text-error" role="alert">
          <strong>暂时没能完成翻译</strong>
          <p>{error}</p>
          <button className="link" onClick={onConfigure}>
            检查服务配置 →
          </button>
        </div>
      )}
      <footer className="text-footnote">
        <span>仅发送当前文本到所选翻译服务</span>
        <span>修改原文会取消正在进行的请求</span>
      </footer>
    </section>
  )
}
