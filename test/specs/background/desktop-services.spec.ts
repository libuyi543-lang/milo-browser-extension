import { directTranslation } from '@/background/direct-translation'
import { parseImageTranslation } from '@/background/media-translation'
describe('desktop service adapters', () => {
  let original: any
  beforeEach(() => {
    original = window.fetch
  })
  afterEach(() => {
    window.fetch = original
    jest.restoreAllMocks()
  })
  it('maps DeepL free keys, target language and context without bearer auth', async () => {
    const mock = jest.fn(async (_url: any, _request: any) => ({
      ok: true,
      json: async () => ({ translations: [{ text: '你好' }] })
    }))
    window.fetch = mock as any
    expect(
      await directTranslation(
        {
          provider: 'deepl',
          model: 'prefer_quality_optimized',
          apiKey: 'demo-token:fx'
        },
        { word: 'hello', context: 'Hello, friend.' },
        new AbortController().signal
      )
    ).toEqual({ meaning: '你好' })
    expect(mock.mock.calls[0][0]).toBe(
      'https://api-free.deepl.com/v2/translate'
    )
    const request = mock.mock.calls[0][1] as any
    expect(request.headers.Authorization).toBe('DeepL-Auth-Key demo-token:fx')
    expect(JSON.parse(request.body).target_lang).toBe('ZH-HANS')
  })
  it('uses Google API-key headers and decodes returned entities', async () => {
    const mock = jest.fn(async (_url: any, _request: any) => ({
      ok: true,
      json: async () => ({
        data: { translations: [{ translatedText: '你好 &amp; 世界' }] }
      })
    }))
    window.fetch = mock as any
    expect(
      await directTranslation(
        { provider: 'google', model: 'v2', apiKey: 'demo-token' },
        { text: 'Hello world', target: 'zh-CN' },
        new AbortController().signal
      )
    ).toEqual({ text: '你好 & 世界' })
    expect((mock.mock.calls[0][1] as any).headers['X-goog-api-key']).toBe(
      'demo-token'
    )
  })
  it('uses Microsoft region headers and matches batch IDs', async () => {
    const mock = jest.fn(async (_url: any, _request: any) => ({
      ok: true,
      json: async () => [
        { translations: [{ text: '一' }] },
        { translations: [{ text: '二' }] }
      ]
    }))
    window.fetch = mock as any
    expect(
      await directTranslation(
        {
          provider: 'microsoft',
          model: 'v3',
          apiKey: 'demo-token',
          region: 'eastasia'
        },
        [
          { id: 'a', text: 'One' },
          { id: 'b', text: 'Two' }
        ],
        new AbortController().signal
      )
    ).toEqual({
      translations: [
        { id: 'a', text: '一' },
        { id: 'b', text: '二' }
      ]
    })
    expect(
      (mock.mock.calls[0][1] as any).headers['Ocp-Apim-Subscription-Region']
    ).toBe('eastasia')
  })
  it('validates OCR boxes and never accepts nonfinite/empty rectangles', () => {
    expect(
      parseImageTranslation({
        regions: [
          { original: 'Hello', translation: '你好', box: [-10, 0, 1100, 200] }
        ]
      }).regions[0].box
    ).toEqual([0, 0, 1000, 200])
    expect(() =>
      parseImageTranslation({
        regions: [{ original: 'x', translation: 'x', box: [10, 10, 0, 10] }]
      })
    ).toThrow()
    expect(() =>
      parseImageTranslation({
        regions: [
          { original: 'x', translation: 'x', box: [0, 0, Infinity, 10] }
        ]
      })
    ).toThrow()
  })
})
