import React, { FC, useEffect, useState } from 'react'
import {
  AI_PROVIDERS,
  AIProviderId,
  AISettings,
  getAIProvider
} from '@/models/AIProvider'
import {
  getAISettings,
  saveAISettings,
  testAIConnection,
  clearTranslationCache
} from '@/services/aiSettings'

export const AISettingsPanel: FC<{
  onConfigured: (value: boolean) => void
}> = ({ onConfigured }) => {
  const [settings, setSettings] = useState<AISettings | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [provider, setProvider] = useState<AIProviderId>('deepseek')
  const [model, setModel] = useState(AI_PROVIDERS[0].defaultModel)
  const [apiKey, setAPIKey] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [region, setRegion] = useState('')
  const [busy, setBusy] = useState('')
  const [tip, setTip] = useState('')
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    getAISettings()
      .then(value => {
        if (!active) return
        setSettings(value)
        setProvider(value.provider)
        setModel(value.model)
        setRegion(
          value.profiles.find(item => item.id === value.provider)?.region || ''
        )
        setEndpoint(
          value.profiles.find(item => item.id === value.provider)?.endpoint ||
            ''
        )
        setExpanded(!value.configured)
        onConfigured(value.configured)
      })
      .catch(error => {
        if (active) {
          setTip(error.message || '设置读取失败，请重新加载 Milo')
          setError(true)
          onConfigured(false)
        }
      })
    return () => {
      active = false
    }
  }, [onConfigured, retry])
  const definition = getAIProvider(provider)
  const profile =
    settings && settings.profiles.find(item => item.id === provider)
  const configured = !!profile && profile.configured

  return (
    <section className="milo-ai" aria-label="AI 翻译服务">
      <div className="milo-ai-heading">
        <span>
          {settings ? getAIProvider(settings.provider).name : 'AI 翻译服务'}
          {settings && settings.configured ? ' · 已配置' : ''}
        </span>
        <button
          className="milo-link"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          disabled={!!busy}
        >
          管理 API
        </button>
      </div>
      {expanded && (
        <form
          onSubmit={event => {
            event.preventDefault()
            save(false)
          }}
        >
          <div
            className="milo-provider-grid"
            role="group"
            aria-label="选择 AI 服务"
          >
            {AI_PROVIDERS.map(item => (
              <button
                type="button"
                key={item.id}
                className="milo-provider"
                aria-pressed={provider === item.id}
                disabled={!!busy || !settings}
                onClick={() => {
                  setProvider(item.id)
                  const saved =
                    settings &&
                    settings.profiles.find(value => value.id === item.id)
                  setModel(saved ? saved.model : item.defaultModel)
                  setRegion(saved?.region || '')
                  setEndpoint(saved?.endpoint || '')
                  setAPIKey('')
                  setTip('')
                  setError(false)
                }}
              >
                {item.name}
                <span>
                  {settings && settings.provider === item.id
                    ? '当前使用'
                    : settings &&
                      settings.profiles.find(
                        value => value.id === item.id && value.configured
                      )
                    ? '已保存'
                    : '未配置'}
                </span>
              </button>
            ))}
          </div>
          {provider === 'custom' && (
            <>
              <label className="milo-key-label" htmlFor="milo-endpoint">
                API 地址
              </label>
              <input
                id="milo-endpoint"
                className="milo-key"
                value={endpoint}
                disabled={!!busy}
                placeholder="https://your-service.example/v1"
                onChange={e => setEndpoint(e.target.value)}
                spellCheck={false}
              />
              <p className="milo-key-note">
                仅兼容 Chat Completions 接口。此服务密钥只发送到这里填写的地址。
              </p>
            </>
          )}
          {provider === 'microsoft' && (
            <>
              <label className="milo-key-label">
                Azure 资源区域（全局密钥可留空）
              </label>
              <input
                className="milo-key"
                value={region}
                onChange={e => setRegion(e.target.value)}
                placeholder="eastasia"
              />
            </>
          )}
          <label className="milo-key-label" htmlFor="milo-model">
            模型
          </label>
          <input
            id="milo-model"
            className="milo-key"
            list="milo-model-list"
            value={model}
            disabled={!!busy}
            onChange={event => setModel(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id="milo-model-list">
            {definition.models.map(value => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <label className="milo-key-label" htmlFor="milo-api-key">
            {definition.name} API Key
          </label>
          <input
            id="milo-api-key"
            className="milo-key"
            type="password"
            value={apiKey}
            disabled={!!busy}
            autoComplete="off"
            spellCheck={false}
            placeholder={
              configured
                ? '已保存，留空保留；输入可替换'
                : '粘贴此服务的 API Key'
            }
            onChange={event => setAPIKey(event.target.value)}
          />
          <p className="milo-key-note">
            密钥仅保存在本浏览器，不回显。
            <a
              href={definition.consoleURL}
              target="_blank"
              rel="noopener noreferrer"
            >
              获取密钥 ↗
            </a>
          </p>
          <div className="milo-setting-actions">
            <button
              className="milo-action"
              disabled={
                !!busy ||
                !settings ||
                !model.trim() ||
                (!apiKey.trim() && !configured)
              }
            >
              {busy === 'save' ? '正在保存…' : '保存并使用'}
            </button>
            <button
              type="button"
              className="milo-secondary"
              disabled={
                !!busy ||
                !settings ||
                !model.trim() ||
                (!apiKey.trim() && !configured)
              }
              onClick={() => save(true)}
            >
              {busy === 'test' ? '正在测试…' : '保存并测试'}
            </button>
          </div>
          <p className="milo-key-note">
            测试会发送 hello 查询，产生少量 API 用量。模型需在你的账户中可用。
            {provider === 'minimax' ? ' M2.x 包含推理，响应可能较慢。' : ''}
          </p>
          {configured && (
            <button
              type="button"
              className="milo-link milo-remove-key"
              disabled={!!busy}
              onClick={async () => {
                setBusy('remove')
                setTip('')
                setError(false)
                try {
                  const value = await saveAISettings({
                    provider,
                    model,
                    apiKey: '',
                    endpoint: provider === 'custom' ? endpoint : undefined,
                    region: provider === 'microsoft' ? region : undefined
                  })
                  setSettings(value)
                  setAPIKey('')
                  onConfigured(value.configured)
                  setTip('此服务密钥已移除，其他服务仍保留')
                } catch (error) {
                  setError(true)
                  setTip(error.message || '移除失败，请重试')
                } finally {
                  setBusy('')
                }
              }}
            >
              移除此服务密钥
            </button>
          )}
          <div className="milo-cache-settings">
            <span className="milo-key-note">
              当前服务已缓存 {settings ? settings.cache.entries : 0} 条译文
            </span>
            <button
              type="button"
              className="milo-link"
              disabled={!!busy}
              onClick={async () => {
                setBusy('cache')
                setError(false)
                try {
                  await clearTranslationCache()
                  const value = await getAISettings()
                  setSettings(value)
                  setTip('当前服务缓存已清除，单词本仍保留')
                } catch (error) {
                  setError(true)
                  setTip(error.message || '缓存清除失败')
                } finally {
                  setBusy('')
                }
              }}
            >
              清除缓存
            </button>
          </div>
        </form>
      )}
      {tip && (
        <p
          className={`milo-ai-tip${error ? ' milo-ai-error' : ''}`}
          role={error ? 'alert' : 'status'}
        >
          {tip}
        </p>
      )}
      {error && !settings && (
        <div className="milo-setting-actions">
          <button
            type="button"
            className="milo-secondary"
            onClick={() => browser.tabs.create({ url: 'chrome://extensions' })}
          >
            打开扩展管理
          </button>
          <button
            type="button"
            className="milo-secondary"
            onClick={() => {
              setTip('')
              setError(false)
              setRetry(value => value + 1)
            }}
          >
            重新读取设置
          </button>
        </div>
      )}
    </section>
  )

  async function save(test: boolean) {
    if (busy) return
    setBusy(test ? 'test' : 'save')
    setTip('')
    setError(false)
    try {
      const value = await saveAISettings({
        provider,
        model,
        apiKey: apiKey.trim() || undefined,
        endpoint: provider === 'custom' ? endpoint : undefined,
        region: provider === 'microsoft' ? region : undefined
      })
      setSettings(value)
      setAPIKey('')
      onConfigured(value.configured)
      if (test) {
        await testAIConnection()
        setTip(`${definition.name} · ${value.model} 连接正常`)
      } else setTip(`已使用 ${definition.name}，划词与正文翻译均生效`)
    } catch (error) {
      setError(true)
      setTip(error.message || '保存失败，请重试')
    } finally {
      setBusy('')
    }
  }
}
