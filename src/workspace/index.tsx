import React, { useEffect, useState } from 'react'
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
const groups = [
  { title: '翻译工具', items: tabs.slice(0, 4) },
  { title: '我的积累', items: tabs.slice(4, 6) },
  { title: '偏好设置', items: tabs.slice(6) }
]
const currentRoute = () => {
  const hash = window.location.hash.slice(1)
  if (hash.startsWith('live-audio:')) return 'live-audio'
  return tabs.some(([id]) => id === hash) ? hash : 'text'
}
const Workspace = () => {
  const [tab, setTab] = useState(currentRoute)
  const [, setConfigured] = useState(false)
  const navigate = (id: string) => {
    setTab(id)
    if (window.location.hash !== '#' + id) window.location.hash = id
  }
  useEffect(() => {
    const update = () => {
      setTab(currentRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return (
    <div className="workspace">
      <aside className="navigation">
        <a className="brand" href="#text" aria-label="Milo 文本翻译">
          <img src="assets/icon-48.png" alt="" />
          <strong>Milo</strong>
        </a>
        <p className="navigation-intro">
          阅读里的理解，
          <br />
          表达里的自如。
        </p>
        <nav aria-label="工作台导航">
          {groups.map(group => (
            <div className="navigation-group" key={group.title}>
              <span className="navigation-label">{group.title}</span>
              {group.items.map(([id, name]) => (
                <button
                  key={id}
                  aria-current={tab === id ? 'page' : undefined}
                  onClick={() => navigate(id)}
                >
                  {name}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="navigation-footer">
          <span className="local-dot" />
          词库与设置保存在本地<small>Milo 桌面工作台</small>
        </div>
      </aside>
      <main
        className={`workspace-main ${
          tab === 'text' ? 'workspace-main-text' : ''
        }`}
      >
        <div hidden={tab !== 'text'}>
          <TextTool
            active={tab === 'text'}
            onConfigure={() => navigate('ai')}
          />
        </div>
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
