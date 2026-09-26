import { AI_PROVIDERS } from '@/models/AIProvider'
import { createChatRequest, parseChatJSON } from '@/background/ai-provider'

jest.mock('@/background/translation-cache', () => {
  const actual = jest.requireActual('@/background/translation-cache')
  return { ...actual, TranslationCache: class extends actual.TranslationCache {
    constructor(scope: string, _entries: number, _bytes: number, _now: any, _hash: any, storageKey: string) {
      super(scope, 500, 1024 * 1024, Date.now, async (text: string) => require('crypto').createHash('sha256').update(text).digest('hex'), storageKey)
    }
  } }
})

describe('AI service configuration and routing', () => {
  let data: Record<string, any>
  let originalFetch: any
  let fetchMock: jest.Mock
  beforeEach(() => {
    jest.resetModules()
    data = { milo_deepseek_api_key: 'legacy-demo-token' }
    originalFetch = window.fetch
    ;(browser.storage.local.get as any).callsFake(async () => ({ ...data }))
    ;(browser.storage.local.set as any).callsFake(async patch => Object.assign(data, patch))
    ;(browser.storage.local.remove as any).callsFake(async key => { delete data[key] })
    fetchMock = jest.fn(async (_url, request) => {
      const body = JSON.parse(request.body)
      const input = JSON.parse(body.messages[1].content)
      const result = Array.isArray(input) ? { translations: input.map(item => ({ id: item.id, text: '示例正文。' })) } : { meaning: body.model + ' 释义', partOfSpeech: 'n.' }
      return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] }) }
    })
    window.fetch = fetchMock
  })
  afterEach(() => {
    window.fetch = originalFetch
    for (const name of ['get', 'set', 'remove']) (browser.storage.local[name] as any).resetBehavior()
  })

  it('migrates the old DeepSeek key, preserves other provider profiles and never returns secrets to UI', async () => {
    const api = require('@/background/ai-translation')
    expect((await api.getAISettings()).configured).toBe(true)
    await api.saveAISettings({ provider: 'zhipu', model: 'glm-4.7-flash', apiKey: 'zhipu-demo-token' })
    expect(data.milo_deepseek_api_key).toBeUndefined()
    expect(data.milo_ai_settings_v1.profiles.deepseek.apiKey).toBe('legacy-demo-token')
    const settings = await api.saveAISettings({ provider: 'deepseek', model: 'deepseek-v4-flash' })
    expect(settings.profiles.find(item => item.id === 'zhipu').configured).toBe(true)
    expect(JSON.stringify(settings)).not.toContain('demo-token')
    await api.saveAISettings({ provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: '' })
    expect((await api.getAISettings()).configured).toBe(false)
    expect(data.milo_ai_settings_v1.profiles.zhipu.apiKey).toBe('zhipu-demo-token')
  })

  it.each(AI_PROVIDERS.map(item => [item.id, item]))('routes word and paragraph requests to %s using its own key and model', async (_id, definition: any) => {
    const api = require('@/background/ai-translation')
    await api.saveAISettings({ provider: definition.id, model: definition.defaultModel, apiKey: 'provider-demo-token' })
    const result = await api.translateWordWithAI('word')
    expect(result.meaning).toContain(definition.defaultModel)
    expect(await api.translateParagraphsWithAI([{ id: 'a', text: 'A public sample paragraph.' }])).toEqual([{ id: 'a', text: '示例正文。' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [url, request] of fetchMock.mock.calls) {
      expect(url).toBe(definition.endpoint)
      const body = JSON.parse(request.body)
      expect(body.model).toBe(definition.defaultModel)
      if (definition.id === 'xiaomi') {
        expect(request.headers['api-key']).toBe('provider-demo-token')
        expect(body.max_completion_tokens).toBeDefined()
        expect(body.max_tokens).toBeUndefined()
      } else expect(request.headers.Authorization).toBe('Bearer provider-demo-token')
      if (definition.id === 'minimax') {
        expect(body.reasoning_split).toBe(true)
        expect(body.response_format).toBeUndefined()
        expect(body.thinking).toBeUndefined()
      } else expect(body.response_format.type).toBe('json_object')
    }
  })

  it('does not share another provider/model cache, but reuses a saved provider after switching back', async () => {
    const api = require('@/background/ai-translation')
    await api.translateWordWithAI('word')
    await api.saveAISettings({ provider: 'xiaomi', model: 'mimo-v2.6-flash', apiKey: 'xiaomi-demo-token' })
    await api.translateWordWithAI('word')
    await api.saveAISettings({ provider: 'deepseek', model: 'deepseek-v4-flash' })
    await api.translateWordWithAI('word')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await api.saveAISettings({ provider: 'deepseek', model: 'deepseek-v4-pro' })
    expect((await api.translateWordWithAI('word')).meaning).toContain('deepseek-v4-pro')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('tests the network even if hello was cached and reports invalid credentials', async () => {
    const api = require('@/background/ai-translation')
    await api.translateWordWithAI('hello')
    await api.testAIConnection()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 401 }))
    await expect(api.testAIConnection()).rejects.toThrow('API Key 无效')
  })

  it('rejects invalid providers/models/keys before writing and preserves the previous configuration', async () => {
    const api = require('@/background/ai-translation')
    await expect(api.saveAISettings({ provider: 'unknown', model: 'test' })).rejects.toThrow('不支持')
    await expect(api.saveAISettings({ provider: 'zhipu', model: 'invalid model', apiKey: 'valid-demo-token' })).rejects.toThrow('模型名称')
    await expect(api.saveAISettings({ provider: 'zhipu', model: 'glm-4.7-flash', apiKey: 'bad\nkey' })).rejects.toThrow('API Key')
    expect(data.milo_ai_settings_v1).toBeUndefined()
    expect((await api.getAISettings()).provider).toBe('deepseek')
  })

  it('allows provider-specific key formats and serializes simultaneous profile saves', async () => {
    const api = require('@/background/ai-translation')
    await Promise.all([
      api.saveAISettings({ provider: 'zhipu', model: 'glm-4.7-flash', apiKey: 'account-id.demo-signature' }),
      api.saveAISettings({ provider: 'minimax', model: 'MiniMax-M2.7', apiKey: 'eyJ.demo.signature' })
    ])
    expect(data.milo_ai_settings_v1.profiles.zhipu.apiKey).toBe('account-id.demo-signature')
    expect(data.milo_ai_settings_v1.profiles.minimax.apiKey).toBe('eyJ.demo.signature')
  })

  it('clears only the active provider cache without deleting another cache or words', async () => {
    const api = require('@/background/ai-translation')
    data.milo_words_v1 = { kept: true }
    await api.translateWordWithAI('word')
    await api.saveAISettings({ provider: 'xiaomi', model: 'mimo-v2.6-flash', apiKey: 'xiaomi-demo-token' })
    await api.translateWordWithAI('word')
    await api.clearTranslationCache()
    expect(data.milo_translation_cache_v1.entries).toHaveLength(1)
    expect(data.milo_translation_cache_v1_xiaomi.entries).toHaveLength(0)
    expect(data.milo_words_v1).toEqual({ kept: true })
  })

  it.each(['word', 'connection'])('cancels an active %s request when the service changes', async kind => {
    let signal: AbortSignal | undefined
    fetchMock.mockImplementation((_url, request) => new Promise((_resolve, reject) => {
      signal = request.signal
      signal!.addEventListener('abort', () => { const error = new Error('Canceled'); error.name = 'AbortError'; reject(error) })
    }))
    const api = require('@/background/ai-translation')
    const promise = kind === 'word' ? api.translateWordWithAI('word') : api.testAIConnection()
    const canceled = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    for (let i = 0; i < 80; i += 1) await Promise.resolve()
    expect(signal).toBeDefined()
    await api.saveAISettings({ provider: 'xiaomi', model: 'mimo-v2.6-flash', apiKey: 'xiaomi-demo-token' })
    await canceled
    expect(signal!.aborted).toBe(true)
  })
})

describe('provider response compatibility', () => {
  it('parses MiniMax thinking and fenced JSON while rejecting prose and incomplete output', () => {
    expect(parseChatJSON('<think>hidden reasoning</think>\n```json\n{"meaning":"你好"}\n```')).toEqual({ meaning: '你好' })
    expect(() => parseChatJSON('Not JSON')).toThrow('格式')
    expect(() => parseChatJSON('{"meaning":')).toThrow('格式')
  })
  it('disables MiniMax-M3 thinking with a small output budget but preserves M2 reasoning support', () => {
    const request = createChatRequest({ provider: 'minimax', model: 'MiniMax-M3', apiKey: 'demo-token' }, 'JSON', {}, 700)
    expect(request.body.thinking).toEqual({ type: 'disabled' })
    expect(request.body.max_completion_tokens).toBe(700)
  })
})
