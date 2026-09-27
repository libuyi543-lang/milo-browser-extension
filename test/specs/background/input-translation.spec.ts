jest.mock('@/background/translation-cache', () => {
  const actual = jest.requireActual('@/background/translation-cache')
  return { ...actual, TranslationCache: class extends actual.TranslationCache {
    constructor(scope: string, _entries: number, _bytes: number, _now: any, _hash: any, storageKey: string) {
      super(scope, 500, 1024 * 1024, Date.now, async (text: string) => require('crypto').createHash('sha256').update(text).digest('hex'), storageKey)
    }
  } }
})

describe('explicit Chinese input → English translation', () => {
  let fetchMock: jest.Mock
  let originalFetch: any
  let data: Record<string, any>
  beforeEach(() => {
    jest.resetModules(); data = { milo_deepseek_api_key: 'legacy-demo-token' }; originalFetch = window.fetch
    ;(browser.storage.local.get as any).callsFake(async () => ({ ...data }))
    ;(browser.storage.local.set as any).callsFake(async patch => Object.assign(data, patch))
    ;(browser.storage.local.remove as any).callsFake(async key => { delete data[key] })
    fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"text":"cheap hotels in Paris"}' } }] }) }))
    window.fetch = fetchMock
  })
  afterEach(() => { window.fetch = originalFetch; for (const name of ['get', 'set', 'remove']) (browser.storage.local[name] as any).resetBehavior() })

  it('sends only the requested draft, shares duplicates and reuses persisted English output', async () => {
    const api = require('@/background/ai-translation')
    const results = await Promise.all([api.translateInputWithAI('巴黎便宜酒店'), api.translateInputWithAI('巴黎便宜酒店')])
    expect(results).toEqual(['cheap hotels in Paris', 'cheap hotels in Paris'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(JSON.parse(body.messages[1].content)).toEqual({ text: '巴黎便宜酒店' })
    expect(body.messages[0].content).toContain('英文')
    fetchMock.mockClear(); jest.resetModules()
    await require('@/background/ai-translation').translateInputWithAI('巴黎便宜酒店')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.stringify(data.milo_translation_cache_v1)).not.toContain('巴黎便宜酒店')
  })

  it('isolates manual source-language overrides from defaults and other cached languages', async () => {
    data.milo_translation_preferences_v1 = { source: 'fr', target: 'zh-CN' }
    const api = require('@/background/ai-translation')
    await api.translateGeneralText('A shared draft.', 'zh-CN', undefined, 'en')
    await api.translateGeneralText('A shared draft.', 'zh-CN', undefined, 'en')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).messages[1].content).source).toBe('en')
    await api.translateGeneralText('A shared draft.', 'zh-CN')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(JSON.parse(fetchMock.mock.calls[1][1].body).messages[1].content).source).toBe('fr')
    expect(data.milo_translation_preferences_v1.source).toBe('fr')
    await expect(api.translateGeneralText('A shared draft.', 'zh-CN', undefined, 'bad-language')).rejects.toThrow('不支持')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses the active AI provider and its own credentials', async () => {
    const api = require('@/background/ai-translation')
    await api.saveAISettings({ provider: 'xiaomi', model: 'mimo-v2.6-flash', apiKey: 'xiaomi-demo-token' })
    await api.translateInputWithAI('巴黎便宜酒店')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.xiaomimimo.com/v1/chat/completions')
    expect(fetchMock.mock.calls[0][1].headers['api-key']).toBe('xiaomi-demo-token')
  })

  it('rejects empty, English-only and overlong selections without sending requests', async () => {
    const api = require('@/background/ai-translation')
    for (const text of ['', 'hello', '中'.repeat(2001)]) await expect(api.translateInputWithAI(text)).rejects.toThrow('请选择')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid model output and does not cache failures', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"text":""}' } }] }) }))
    const api = require('@/background/ai-translation')
    await expect(api.translateInputWithAI('巴黎便宜酒店')).rejects.toThrow('有效英文')
    await api.translateInputWithAI('巴黎便宜酒店')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('cancels an in-flight input translation when its reader closes', async () => {
    let signal: AbortSignal | undefined
    fetchMock.mockImplementation((_url, request) => new Promise((_resolve, reject) => {
      signal = request.signal
      signal!.addEventListener('abort', () => { const error = new Error('Canceled'); error.name = 'AbortError'; reject(error) })
    }))
    const api = require('@/background/ai-translation'); const stop = new AbortController()
    const promise = api.translateInputWithAI('巴黎便宜酒店', stop.signal)
    const canceled = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    for (let i = 0; i < 80; i += 1) await Promise.resolve()
    expect(signal).toBeDefined(); stop.abort(); await canceled
    expect(signal!.aborted).toBe(true)
  })
})
