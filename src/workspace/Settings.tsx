import React, { useEffect, useState } from 'react'
import {
  DEFAULT_PREFERENCES,
  LANGUAGES,
  TranslationPreferences
} from '@/models/TranslationPreferences'
import { getPreferences, savePreferences } from '@/services/translation/general'
export const Settings = () => {
  const [prefs, setPrefs] = useState<TranslationPreferences>({
    ...DEFAULT_PREFERENCES
  })
  const [status, setStatus] = useState('')
  useEffect(() => {
    getPreferences()
      .then(setPrefs)
      .catch(error => setStatus(error.message))
  }, [])
  const update = (patch: Partial<TranslationPreferences>) =>
    setPrefs(value => ({ ...value, ...patch }))
  return (
    <section>
      <h2>阅读设置</h2>
      <p>
        保存后刷新当前阅读网页。自动网站规则会发送匹配页面的正文给当前 AI 服务。
      </p>
      <div className="settings-grid">
        <label>
          原文语言
          <select
            value={prefs.source}
            onChange={e => update({ source: e.target.value as any })}
          >
            <option value="auto">自动识别</option>
            {LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          阅读目标语言
          <select
            value={prefs.target}
            onChange={e => update({ target: e.target.value as any })}
          >
            {LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          输入框目标语言
          <select
            value={prefs.inputTarget}
            onChange={e => update({ inputTarget: e.target.value as any })}
          >
            {LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          显示模式
          <select
            value={prefs.display}
            onChange={e => update({ display: e.target.value as any })}
          >
            <option value="bilingual">双语对照</option>
            <option value="translation">只显示译文</option>
          </select>
        </label>
        <label>
          译文样式
          <select
            value={prefs.style}
            onChange={e => update({ style: e.target.value as any })}
          >
            <option value="plain">融入原文</option>
            <option value="muted">淡色</option>
            <option value="boxed">浅色底</option>
            <option value="underline">虚线强调</option>
          </select>
        </label>
      </div>
      <div className="checks">
        <label>
          <input
            type="checkbox"
            checked={prefs.dynamic}
            onChange={e => update({ dynamic: e.target.checked })}
          />{' '}
          自动翻译新加载的正文
        </label>
        <label>
          <input
            type="checkbox"
            checked={prefs.hover}
            onChange={e => update({ hover: e.target.checked })}
          />{' '}
          鼠标悬停段落，按 Control 翻译 / 恢复
        </label>
        <label>
          <input
            type="checkbox"
            checked={prefs.subtitles}
            onChange={e => update({ subtitles: e.target.checked })}
          />{' '}
          页面有可读字幕时自动开启双语字幕
        </label>
        <label>
          <input
            type="checkbox"
            checked={prefs.floatingButton}
            onChange={e => update({ floatingButton: e.target.checked })}
          />{' '}
          在网页右侧显示 Milo 悬浮按钮（点击翻译 / 恢复正文）
        </label>
        <label>
          <input
            type="checkbox"
            checked={prefs.highlightWords}
            onChange={e => update({ highlightWords: e.target.checked })}
          />{' '}
          在网页和字幕中标出单词本里“学习中”的词
        </label>
        <label>
          <input
            type="checkbox"
            checked={prefs.learningMode}
            onChange={e => update({ learningMode: e.target.checked })}
          />{' '}
          学习模式：中文译文先模糊，鼠标移上去再显示
        </label>
      </div>
      <label>
        自动翻译的网站域名（每行一个，* 代表全部网站）
        <textarea
          rows={3}
          value={prefs.automaticSites.join('\n')}
          onChange={e =>
            update({ automaticSites: e.target.value.split(/\n|,/) })
          }
          placeholder="example.com"
        />
      </label>
      <label>
        不翻译的网站（优先于自动规则）
        <textarea
          rows={3}
          value={prefs.excludedSites.join('\n')}
          onChange={e =>
            update({ excludedSites: e.target.value.split(/\n|,/) })
          }
        />
      </label>
      {prefs.floatingButton && (
        <label>
          不显示悬浮按钮的网站
          <textarea
            rows={2}
            value={prefs.floatingHiddenSites.join('\n')}
            onChange={e =>
              update({ floatingHiddenSites: e.target.value.split(/\n|,/) })
            }
          />
        </label>
      )}
      <label>
        AI 术语表（原文 = 指定译法，每行一个；传统翻译服务依照自身能力）
        <textarea
          rows={5}
          maxLength={4000}
          value={prefs.glossary}
          onChange={e => update({ glossary: e.target.value })}
          placeholder="machine learning = 机器学习"
        />
      </label>
      <button
        onClick={async () => {
          try {
            setPrefs(await savePreferences(prefs))
            setStatus('已保存，请刷新阅读网页')
          } catch (error) {
            setStatus(error.message)
          }
        }}
      >
        保存阅读设置
      </button>
      <p role="status">{status}</p>
    </section>
  )
}
