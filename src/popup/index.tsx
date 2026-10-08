import { message } from '@/_helpers/browser-api'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { TranslationPreferences } from '@/models/TranslationPreferences'
import { getPreferences, savePreferences } from '@/services/translation/general'
import { listMiloWords } from '@/services/miloStorage'
import { translateCurrentPage } from '@/services/aiSettings'
import { AISettingsPanel } from './AISettingsPanel'
import { PopupErrorBoundary } from './ErrorBoundary'
import './milo.scss'

document.title = 'Milo'

const App = () => {
  const [wordCount, setWordCount] = useState(0)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState(false)
  const [aiTip, setAITip] = useState('')
  const [prefs, setPrefs] = useState<TranslationPreferences | null>(null)

  useEffect(() => {
    let active = true
    listMiloWords()
      .then(result => {
        if (active) setWordCount(result.length)
      })
      .catch(() => {
        if (active) setError('读取单词本失败')
      })
    getPreferences()
      .then(result => {
        if (active) setPrefs(result)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const toggle = async (
    key: 'highlightWords' | 'learningMode',
    value: boolean
  ) => {
    if (!prefs) return
    setPrefs({ ...prefs, [key]: value })
    try {
      // Open pages pick the change up at once; no reload needed.
      setPrefs(await savePreferences({ ...prefs, [key]: value }))
    } catch (_) {
      setPrefs(prefs)
      setAITip('设置保存失败，请重试')
    }
  }

  return (
    <main className="milo-popup">
      <header className="milo-header">
        <h1 className="milo-logo">
          <img src="assets/icon-48.png" width="28" height="28" alt="" />
          Milo
        </h1>
        <span className="milo-count">{wordCount} 个词</span>
      </header>
      <p className="milo-lead">阅读时遇见的词，都有来处。</p>
      {prefs && (
        <div className="milo-learning">
          <label>
            <input
              type="checkbox"
              checked={prefs.highlightWords}
              onChange={e => toggle('highlightWords', e.target.checked)}
            />
            <span>
              标出生词
              <small>单词本里“学习中”的词在网页和字幕中高亮</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.learningMode}
              onChange={e => toggle('learningMode', e.target.checked)}
            />
            <span>
              学习模式
              <small>中文译文先模糊，鼠标移上去再显示</small>
            </span>
          </label>
        </div>
      )}
      <AISettingsPanel onConfigured={setConfigured} />
      <button
        className="milo-action"
        onClick={() => browser.runtime.openOptionsPage()}
      >
        工具与阅读设置
      </button>
      <button
        className="milo-link"
        onClick={async () => {
          const tabs = await browser.tabs.query({
            active: true,
            currentWindow: true
          })
          if (tabs[0]?.id)
            message
              .send(tabs[0].id, { type: 'MILO_TOGGLE_SUBTITLES' })
              .catch(() => setAITip('请在普通视频网页中使用'))
        }}
      >
        切换视频字幕翻译
      </button>
      <div className="milo-reading-actions">
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
          <br />
          输入框内连续敲三下空格：翻译为设定语言（默认英文）。
        </p>
        {aiTip && (
          <p className="milo-ai-tip" role="status">
            {aiTip}
          </p>
        )}
      </div>
      {error && <div className="milo-empty">{error}</div>}
      <footer className="milo-foot">Milo Browser Extension · 本地保存</footer>
    </main>
  )
}

ReactDOM.render(
  <PopupErrorBoundary>
    <App />
  </PopupErrorBoundary>,
  document.getElementById('root')
)
