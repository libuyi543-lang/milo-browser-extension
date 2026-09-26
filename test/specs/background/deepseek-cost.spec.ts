jest.mock('@/background/translation-cache', () => {
  const actual = jest.requireActual('@/background/translation-cache')
  return { ...actual, TranslationCache: class extends actual.TranslationCache {
    constructor(scope: string) { super(scope, 500, 1024 * 1024, Date.now, async (text: string) => require('crypto').createHash('sha256').update(text).digest('hex')) }
  } }
})

const tick = async () => { for (let i = 0; i < 60; i += 1) await Promise.resolve() }
function reply(request: any) {
  const body = JSON.parse(request.body)
  const input = JSON.parse(body.messages[1].content)
  const content = Array.isArray(input)
    ? { translations: input.map(item => ({ id: item.id, text: item.text.includes('Alpha') ? '甲段。' : item.text.includes('Beta') ? '乙段。' : '丙段。' })) }
    : { meaning: '测试释义', partOfSpeech: 'n.' }
  return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] }) }
}

describe('DeepSeek network request costs', () => {
  let data: Record<string, any>
  let originalFetch: any
  let fetchMock: jest.Mock
  beforeEach(() => {
    jest.resetModules()
    data = { milo_deepseek_api_key: 'test-token' }
    originalFetch = window.fetch
    fetchMock = jest.fn(async (_url, request) => reply(request))
    window.fetch = fetchMock
    ;(browser.storage.local.get as any).callsFake(async () => ({ ...data }))
    ;(browser.storage.local.set as any).callsFake(async patch => Object.assign(data, patch))
  })
  afterEach(() => { window.fetch = originalFetch; (browser.storage.local.get as any).resetBehavior(); (browser.storage.local.set as any).resetBehavior() })

  it('makes one request for simultaneous identical word lookups and none for repeat or restarted lookups', async () => {
    const api = require('@/background/deepseek')
    const results = await Promise.all([api.translateWordWithAI('inevitable'), api.translateWordWithAI('inevitable')])
    expect(results[0]).toEqual(results[1])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await api.translateWordWithAI('inevitable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockClear()
    jest.resetModules()
    await require('@/background/deepseek').translateWordWithAI('inevitable')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('deduplicates paragraph text, remaps IDs, and only sends new paragraphs on later requests', async () => {
    const api = require('@/background/deepseek')
    const first = await api.translateParagraphsWithAI([{ id: 'a', text: 'Alpha paragraph.' }, { id: 'b', text: 'Alpha paragraph.' }, { id: 'c', text: 'Beta paragraph.' }])
    expect(first).toEqual([{ id: 'a', text: '甲段。' }, { id: 'b', text: '甲段。' }, { id: 'c', text: '乙段。' }])
    expect(JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).messages[1].content)).toHaveLength(2)
    const second = await api.translateParagraphsWithAI([{ id: 'new', text: 'Beta paragraph.' }, { id: 'other', text: 'Gamma paragraph.' }])
    expect(second).toEqual([{ id: 'new', text: '乙段。' }, { id: 'other', text: '丙段。' }])
    expect(JSON.parse(JSON.parse(fetchMock.mock.calls[1][1].body).messages[1].content).map(item => item.text)).toEqual(['Gamma paragraph.'])
    await api.translateParagraphsWithAI([{ id: 'another', text: 'Alpha paragraph.' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failed provider response', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 429 }))
    const api = require('@/background/deepseek')
    await expect(api.translateWordWithAI('test')).rejects.toThrow('频繁')
    await api.translateWordWithAI('test')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps case-sensitive abbreviations separate instead of treating US as us', async () => {
    const api = require('@/background/deepseek')
    await api.translateWordWithAI('US')
    await api.translateWordWithAI('us')
    await api.translateWordWithAI('US')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(call => JSON.parse(JSON.parse(call[1].body).messages[1].content).word)).toEqual(['US', 'us'])
  })

  it('aborts an active fetch when its only page reader stops', async () => {
    let requestSignal: AbortSignal | undefined
    fetchMock.mockImplementation((_url, request) => new Promise((_resolve, reject) => {
      requestSignal = request.signal
      request.signal.addEventListener('abort', () => { const error = new Error('Canceled fetch'); error.name = 'AbortError'; reject(error) })
    }))
    const api = require('@/background/deepseek')
    const stop = new AbortController()
    const request = api.translateParagraphsWithAI([{ id: 'a', text: 'Alpha paragraph.' }], stop.signal)
    const canceled = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    stop.abort()
    await canceled
    await tick()
    expect(requestSignal!.aborted).toBe(true)
  })

  it('lets another page finish a shared paragraph request after one page cancels', async () => {
    let finish: () => void = () => undefined
    let requestSignal: AbortSignal | undefined
    fetchMock.mockImplementation((_url, request) => new Promise(resolve => { requestSignal = request.signal; finish = () => resolve(reply(request)) }))
    const api = require('@/background/deepseek')
    const stop = new AbortController()
    const first = api.translateParagraphsWithAI([{ id: 'a', text: 'Alpha paragraph.' }], stop.signal)
    const other = api.translateParagraphsWithAI([{ id: 'b', text: 'Alpha paragraph.' }])
    const canceled = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    stop.abort()
    await canceled
    expect(requestSignal!.aborted).toBe(false)
    finish()
    expect(await other).toEqual([{ id: 'b', text: '甲段。' }])
  })

  it.each(['page', 'word'])('never sends a canceled %s task that is waiting for a network slot', async kind => {
    const finishes: Array<() => void> = []
    fetchMock.mockImplementation((_url, request) => new Promise(resolve => { finishes.push(() => resolve(reply(request))) }))
    const api = require('@/background/deepseek')
    const one = api.translateWordWithAI('first')
    const two = api.translateWordWithAI('second')
    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const stop = new AbortController()
    const page = kind === 'page' ? api.translateParagraphsWithAI([{ id: 'a', text: 'Alpha paragraph.' }], stop.signal) : api.translateWordWithAI('queued', stop.signal)
    const canceled = expect(page).rejects.toMatchObject({ name: 'AbortError' })
    await tick()
    stop.abort()
    await canceled
    finishes.forEach(finish => finish())
    await Promise.all([one, two])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
