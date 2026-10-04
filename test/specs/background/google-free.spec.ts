import {
  parseGoogleBatch,
  parseGoogleDictionary
} from '@/background/direct-translation'

jest.mock('@/background/translation-cache', () => {
  const actual = jest.requireActual('@/background/translation-cache')
  return { ...actual, TranslationCache: class extends actual.TranslationCache {
    constructor(scope: string, _entries: number, _bytes: number, _now: any, _hash: any, storageKey: string) {
      super(scope, 500, 1024 * 1024, Date.now, async (text: string) => require('crypto').createHash('sha256').update(text).digest('hex'), storageKey)
    }
  } }
})

const dictionary = {
  sentences: [{ trans: '韧性', orig: 'resilience' }, { src_translit: 'rɪˈzɪlyəns' }],
  dict: [{ pos: '名词', terms: ['弹性', '韧性', '回弹', '复原力', '恢复力', '多余'] }, { pos: '动词', terms: [] }],
  definitions: [{ pos: '名词', entry: [{ gloss: 'the capacity to recover quickly from difficulties.', example: 'the <b>resilience</b> of youth' }, { gloss: '' }] }],
  examples: { example: [{ text: 'the <b>resilience</b> of the &quot;economy&quot;' }] }
}

describe('free Google translation', () => {
  it('parses phonetic, senses, definitions and examples from the dictionary response', () => {
    expect(parseGoogleDictionary(dictionary)).toEqual({
      meaning: '韧性；弹性；回弹',
      phonetic: '/rɪˈzɪlyəns/',
      partOfSpeech: 'n.',
      senses: [{ pos: 'n.', meaning: '弹性；韧性；回弹；复原力；恢复力' }],
      definitions: [{ pos: 'n.', gloss: 'the capacity to recover quickly from difficulties.', example: 'the <b>resilience</b> of youth' }],
      examples: ['the resilience of the "economy"']
    })
    expect(() => parseGoogleDictionary({ sentences: [] })).toThrow('翻译结果无效')
  })

  it('accepts every batch response shape', () => {
    expect(parseGoogleBatch(['你好', 'en'], 1)).toEqual(['你好'])
    expect(parseGoogleBatch(['甲', '乙'], 2)).toEqual(['甲', '乙'])
    expect(parseGoogleBatch([['甲', 'en'], ['乙', 'en']], 2)).toEqual(['甲', '乙'])
    expect(() => parseGoogleBatch({}, 1)).toThrow('翻译结果无效')
  })

  describe('as the zero-configuration default', () => {
    let data: Record<string, any>
    let originalFetch: any
    let fetchMock: jest.Mock
    beforeEach(() => {
      jest.resetModules()
      data = {}
      originalFetch = window.fetch
      ;(browser.storage.local.get as any).callsFake(async () => ({ ...data }))
      ;(browser.storage.local.set as any).callsFake(async patch => Object.assign(data, patch))
      ;(browser.storage.local.remove as any).callsFake(async key => { delete data[key] })
      fetchMock = jest.fn(async (url: string, request: any) => ({
        ok: true,
        status: 200,
        json: async () =>
          url.includes('/single?')
            ? dictionary
            : request.body.getAll('q').map((text: string) => [`译:${text}`, 'en'])
      }))
      window.fetch = fetchMock
    })
    afterEach(() => {
      window.fetch = originalFetch
      for (const name of ['get', 'set', 'remove']) (browser.storage.local[name] as any).resetBehavior()
    })

    it('is configured on a fresh install and looks words up without a key', async () => {
      const api = require('@/background/ai-translation')
      const settings = await api.getAISettings()
      expect(settings.provider).toBe('google-free')
      expect(settings.configured).toBe(true)
      const result = await api.translateWordWithAI('resilience', undefined, 'Some context.')
      expect(result.phonetic).toBe('/rɪˈzɪlyəns/')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, request] = fetchMock.mock.calls[0]
      expect(url).toContain('https://translate.googleapis.com/translate_a/single?')
      expect(url).toContain('q=resilience')
      expect(request.credentials).toBe('omit')
      // Context does not change the free lookup, so the cached result is reused.
      await api.translateWordWithAI('resilience', undefined, 'Other context.')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('falls back to free translation when the selected AI service has no key', async () => {
      const api = require('@/background/ai-translation')
      await api.saveAISettings({ provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: '' })
      expect((await api.getAISettings()).configured).toBe(false)
      expect(await api.translateParagraphsWithAI([{ id: 'a', text: 'One.' }, { id: 'b', text: 'Two.' }])).toEqual([
        { id: 'a', text: '译:One.' },
        { id: 'b', text: '译:Two.' }
      ])
      const [url, request] = fetchMock.mock.calls[0]
      expect(url).toContain('https://translate.googleapis.com/translate_a/t?')
      expect(url).toContain('tl=zh-CN')
      expect(request.method).toBe('POST')
    })

    it('translates input drafts to the configured input language', async () => {
      const api = require('@/background/ai-translation')
      expect(await api.translateInputWithAI('巴黎便宜酒店')).toBe('译:巴黎便宜酒店')
      expect(fetchMock.mock.calls[0][0]).toContain('tl=en')
    })

    it('explains rate limiting without asking for a key first', async () => {
      fetchMock.mockImplementation(async () => ({ ok: false, status: 429, json: async () => ({}) }))
      const api = require('@/background/ai-translation')
      await expect(api.translateWordWithAI('busy')).rejects.toThrow('免费翻译暂时繁忙')
    })
  })
})
