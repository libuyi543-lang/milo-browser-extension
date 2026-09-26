import { AI_PROVIDERS } from '@/models/AIProvider'
import { message } from '@/_helpers/browser-api'
import { getAISettings, saveAISettings, validateAISettings } from '@/services/aiSettings'

function settings() {
  return { provider: 'deepseek', configured: true, model: 'deepseek-v4-flash',
    profiles: AI_PROVIDERS.map(item => ({ id: item.id, model: item.defaultModel, configured: item.id === 'deepseek' })),
    cache: { entries: 2, bytes: 1000 } }
}

describe('popup AI settings response boundary', () => {
  afterEach(() => jest.restoreAllMocks())

  it('rejects the legacy backend shape with actionable reload instructions', () => {
    expect(() => validateAISettings({ configured: true, model: 'deepseek-v4-flash', cache: { entries: 1, bytes: 100 } })).toThrow('重新加载')
  })
  it.each([undefined, null, {}, { ...settings(), provider: 'unknown' }, { ...settings(), profiles: [] }, { ...settings(), profiles: [null] }, { ...settings(), cache: {} }])('rejects malformed responses before React receives them', value => {
    expect(() => validateAISettings(value)).toThrow()
  })
  it('returns only public fields, dropping any unexpected credentials', () => {
    const value = settings()
    const result = validateAISettings({ ...value, apiKey: 'never-show-this-token', profiles: value.profiles.map(item => ({ ...item, apiKey: 'never-show-this-token' })) })
    expect(result).toEqual(value)
    expect(JSON.stringify(result)).not.toContain('never-show-this-token')
  })
  it('validates a background read and rejects a malformed save response', async () => {
    jest.spyOn(message, 'send').mockResolvedValueOnce(settings() as any).mockResolvedValueOnce({ configured: true } as any)
    expect(await getAISettings()).toEqual(settings())
    await expect(saveAISettings({ provider: 'deepseek', model: 'deepseek-v4-flash' })).rejects.toThrow('重新加载')
  })
  it('preserves an explicit backend save error', async () => {
    jest.spyOn(message, 'send').mockResolvedValue({ ...settings(), error: 'API Key 格式不正确' } as any)
    await expect(saveAISettings({ provider: 'deepseek', model: 'deepseek-v4-flash' })).rejects.toThrow('API Key 格式不正确')
  })
})
