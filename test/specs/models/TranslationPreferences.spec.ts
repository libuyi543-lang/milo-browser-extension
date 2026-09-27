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
})
