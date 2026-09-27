import { message } from '@/_helpers/browser-api'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { MiloWord } from '@/models/MiloWord'
import { listMiloWords } from '@/services/miloStorage'
import { translateCurrentPage } from '@/services/aiSettings'
import { AISettingsPanel } from './AISettingsPanel'
import { PopupErrorBoundary } from './ErrorBoundary'
import './milo.scss'

document.title = 'Milo'

const App = () => {
  const [words, setWords] = useState<readonly MiloWord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState(false)
  const [aiTip, setAITip] = useState('')
  const [showPin, setShowPin] = useState(false)

  useEffect(() => {
    let active = true
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
        <h1 className="milo-logo">
          <img src="assets/icon-48.png" width="28" height="28" alt="" />
          Milo
        </h1>
        <span className="milo-count">{words.length} 个词</span>
      </header>
      <button
        className="milo-pin-help milo-link"
        aria-expanded={showPin}
        onClick={() => setShowPin(!showPin)}
      >
        固定到浏览器工具栏
      </button>
      {showPin && (
        <p className="milo-key-note">
          点击 Chrome 右上角的拼图图标，找到 Milo，点击右侧图钉。之后可直接点
          Milo 图标管理 API。
        </p>
      )}
      <p className="milo-lead">阅读时遇见的词，都有来处。</p>
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
}

ReactDOM.render(
  <PopupErrorBoundary>
    <App />
  </PopupErrorBoundary>,
  document.getElementById('root')
)
