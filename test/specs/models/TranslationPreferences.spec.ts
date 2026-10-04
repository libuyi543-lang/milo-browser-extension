import {
  DEFAULT_PREFERENCES,
  LANGUAGES,
  languageName,
  parsePreferences,
  siteMatches
} from '@/models/TranslationPreferences'
describe('desktop reading preferences', () => {
  it('provides over 100 language choices with validated defaults', () => {
    expect(LANGUAGES.length).toBeGreaterThan(100)
    expect(parsePreferences(undefined)).toEqual(DEFAULT_PREFERENCES)
    expect(languageName('ja')).toBe('日本語')
    expect(() => languageName('not-a-language')).toThrow()
  })
  it('normalizes site rules and gives callers exact/subdomain matching', () => {
    const prefs = parsePreferences({
      automaticSites: [' Example.COM ', 'example.com', '*', 'bad/path']
    })
    expect(prefs.automaticSites).toEqual(['example.com', '*'])
    expect(siteMatches('news.example.com', ['example.com'])).toBe(true)
    expect(siteMatches('evil-example.com', ['example.com'])).toBe(false)
    expect(siteMatches('anything.net', ['*'])).toBe(true)
  })
  it('bounds glossary and resets malformed language/style input', () => {
    const prefs = parsePreferences({
      target: '<script>',
      inputTarget: 'ja',
      style: 'bad',
      glossary: 'x'.repeat(5000)
    })
    expect(prefs.target).toBe('zh-CN')
    expect(prefs.inputTarget).toBe('ja')
    expect(prefs.glossary.length).toBe(4000)
    expect(prefs.style).toBe('plain')
  })
  it('keeps the floating button on by default and bounds its position', () => {
    expect(DEFAULT_PREFERENCES.floatingButton).toBe(true)
    const prefs = parsePreferences({
      floatingButton: false,
      floatingHiddenSites: [' News.Example.com ', 'bad/path'],
      floatingTop: 3
    })
    expect(prefs.floatingButton).toBe(false)
    expect(prefs.floatingHiddenSites).toEqual(['news.example.com'])
    expect(prefs.floatingTop).toBe(0.92)
    expect(parsePreferences({ floatingTop: 'x' }).floatingTop).toBe(0.62)
  })
  it('lets content scripts only hide or move the button, for the sender site', async () => {
    const data: Record<string, any> = {}
    ;(browser.storage.local.get as any).callsFake(async () => ({ ...data }))
    ;(browser.storage.local.set as any).callsFake(async patch => Object.assign(data, patch))
    const { updateFloatingButton } = require('@/background/preferences')
    await updateFloatingButton({ action: 'hide-site' }, 'https://www.example.com/a?b')
    expect(data.milo_translation_preferences_v1.floatingHiddenSites).toEqual(['www.example.com'])
    expect((await updateFloatingButton({ action: 'move', top: -1 }, undefined)).floatingTop).toBe(0.08)
    expect((await updateFloatingButton({ action: 'hide-all' }, undefined)).floatingButton).toBe(false)
    expect(data.milo_translation_preferences_v1.glossary).toBe('')
    await expect(updateFloatingButton({ action: 'hide-site' }, undefined)).rejects.toThrow('无法识别')
    await expect(updateFloatingButton({ action: 'other' }, undefined)).rejects.toThrow('操作无效')
    for (const name of ['get', 'set']) (browser.storage.local[name] as any).resetBehavior()
  })
})
