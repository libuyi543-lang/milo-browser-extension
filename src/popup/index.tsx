import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { MiloWord } from '@/models/MiloWord'
import { listMiloWords } from '@/services/miloStorage'
import {
  getAISettings,
  saveAPIKey,
  translateCurrentPage,
  clearTranslationCache
} from '@/services/aiSettings'
import './milo.scss'

document.title = 'Milo'

const App = () => {
  const [words, setWords] = useState<readonly MiloWord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setAPIKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [aiTip, setAITip] = useState('')
  const [cacheEntries, setCacheEntries] = useState(0)

  useEffect(() => {
    let active = true
    getAISettings()
      .then(settings => {
        if (active) {
          setConfigured(settings.configured)
          setShowSettings(!settings.configured)
          setCacheEntries(settings.cache.entries)
        }
      })
      .catch(() => {
        if (active) setAITip('设置读取失败，请重新打开扩展')
      })
    listMiloWords()
      .then(result => {
        if (active) setWords(result)
      })
      .catch(() => {
        if (active) setError('读取单词本失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="milo-popup">
      <header className="milo-header">
        <h1 className="milo-logo">Milo</h1>
        <span className="milo-count">{words.length} 个词</span>
      </header>
      <p className="milo-lead">阅读时遇见的词，都有来处。</p>
      <div className="milo-ai">
        <div className="milo-ai-heading">
          <span>DeepSeek V4 Flash</span>
          <button
            className="milo-link"
            onClick={() => setShowSettings(!showSettings)}
          >
            设置
          </button>
        </div>
        {showSettings && (
          <form
            onSubmit={event => {
              event.preventDefault()
              saveKey()
            }}
          >
            <label className="milo-key-label" htmlFor="milo-api-key">
              {configured ? '已配置密钥，可在此替换' : 'DeepSeek API Key'}
            </label>
            <input
              id="milo-api-key"
              className="milo-key"
              type="password"
              value={apiKey}
              autoComplete="off"
              placeholder={configured ? '输入新密钥' : 'sk-…'}
              onChange={event => setAPIKey(event.target.value)}
            />
            <button
              className="milo-action"
              disabled={!apiKey.trim() || savingKey}
            >
              {savingKey ? '正在保存…' : '保存密钥'}
            </button>
            <p className="milo-key-note">
              仅保存在当前浏览器，翻译时直连 DeepSeek。
            </p>
            <p className="milo-key-note">
              已缓存 {cacheEntries} 条译文，重复内容优先复用本地结果。
            </p>
            <button
              type="button"
              className="milo-link"
              onClick={async () => {
                try {
                  await clearTranslationCache()
                  setCacheEntries(0)
                  setAITip('翻译缓存已清除，单词本仍保留')
                } catch (error) {
                  setAITip(error.message || '缓存清除失败')
                }
              }}
            >
              清除翻译缓存
            </button>
          </form>
        )}
        <button
          className="milo-action"
          disabled={!configured}
          onClick={async () => {
            try {
              await translateCurrentPage()
              setAITip('已开始，请回到网页查看译文')
            } catch (_) {
              setAITip('此页面不能翻译，请打开普通网页')
            }
          }}
        >
          翻译 / 恢复网页正文
        </button>
        <p className="milo-key-note">
          ⌘ A 翻译正文，再按一次恢复原文。
          <br />
          Windows 使用 Ctrl+A；输入框内仍可全选。
        </p>
        {aiTip && (
          <p className="milo-ai-tip" role="status">
            {aiTip}
          </p>
        )}
      </div>
      {error ? (
        <div className="milo-empty">{error}</div>
      ) : loading ? (
        <div className="milo-empty">正在打开单词本…</div>
      ) : words.length ? (
        <div className="milo-list">
          {words.slice(0, 12).map(word => (
            <div className="milo-item" key={word.id}>
              <div className="milo-item-head">
                <span className="milo-word">{word.word}</span>
                <span className="milo-encounters">
                  遇见 {word.encounterCount} 次
                </span>
              </div>
              <div className="milo-meaning">{word.meaning}</div>
              {word.encounters[word.encounters.length - 1].sentence && (
                <div className="milo-sentence">
                  “{word.encounters[word.encounters.length - 1].sentence}”
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="milo-empty">去网页划选一个英文单词，开始收藏。</div>
      )}
      <footer className="milo-foot">Milo Browser Extension · 本地保存</footer>
    </main>
  )

  async function saveKey() {
    setSavingKey(true)
    setAITip('')
    try {
      const settings = await saveAPIKey(apiKey)
      setConfigured(settings.configured)
      setAPIKey('')
      setShowSettings(false)
      setAITip('密钥已保存')
    } catch (error) {
      setAITip(error.message || '密钥保存失败，请重试')
    } finally {
      setSavingKey(false)
    }
  }
}

ReactDOM.render(<App />, document.getElementById('root'))
