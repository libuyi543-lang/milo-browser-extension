import React, { useState } from 'react'
import ReactDOM from 'react-dom'
import { Settings } from './Settings'
import { TextTool } from './TextTool'
import { DocumentTool } from './DocumentTool'
import { ImageTool } from './ImageTool'
import { MediaTool } from './MediaTool'
import { LiveAudio } from './LiveAudio'
import { Notebook } from './Notebook'
import { ZoteroTool } from './ZoteroTool'
import { AISettingsPanel } from '@/popup/AISettingsPanel'
import { PopupErrorBoundary } from '@/popup/ErrorBoundary'
import './style.scss'
document.title = 'Milo · 翻译工作台'
const tabs = [
  ['text', '文本翻译'],
  ['documents', '文档与电子书'],
  ['images', '图片与漫画'],
  ['media', '字幕与媒体'],
  ['notebook', '单词本'],
  ['zotero', 'Zotero 文献'],
  ['settings', '阅读设置'],
  ['ai', 'AI 服务']
] as const
const Workspace = () => {
  const [tab, setTab] = useState(
    window.location.hash.includes('images')
      ? 'images'
      : window.location.hash.includes('live-audio')
      ? 'live-audio'
      : window.location.hash.includes('documents')
      ? 'documents'
      : 'text'
  )
  const [, setConfigured] = useState(false)
  return (
    <div className="workspace">
      <aside className="navigation">
        <div className="brand">
          <img src="assets/icon-48.png" alt="" />
          <strong>Milo</strong>
        </div>
        <p>
          把阅读与表达，
          <br />
          留在同一条路上。
        </p>
        <nav>
          {tabs.map(([id, name]) => (
            <button
              key={id}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              {name}
            </button>
          ))}
        </nav>
        <small>
          桌面翻译工作台
          <br />
          数据保存在本地
        </small>
      </aside>
      <main className="workspace-main">
        {tab === 'text' && <TextTool />}
        {tab === 'documents' && <DocumentTool />}
        {tab === 'images' && <ImageTool />}
        {tab === 'media' && <MediaTool />}
        {tab === 'live-audio' && <LiveAudio />}
        {tab === 'notebook' && <Notebook />}
        {tab === 'zotero' && <ZoteroTool />}
        {tab === 'settings' && <Settings />}
        {tab === 'ai' && (
          <section>
            <h2>AI 服务</h2>
            <p>使用自己的服务密钥，翻译费由对应账户承担。</p>
            <AISettingsPanel onConfigured={setConfigured} />
          </section>
        )}
      </main>
    </div>
  )
}
ReactDOM.render(
  <PopupErrorBoundary>
    <Workspace />
  </PopupErrorBoundary>,
  document.getElementById('root')
)
