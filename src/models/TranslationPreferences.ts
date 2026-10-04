const MAIN_LANGUAGES = [
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁體中文'],
  ['en', 'English'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['es', 'Español'],
  ['pt', 'Português'],
  ['ru', 'Русский'],
  ['ar', 'العربية'],
  ['it', 'Italiano'],
  ['hi', 'हिन्दी']
] as const
const EXTRA_CODES = 'af am as az be bg bn bo br bs ca ce co cs cy da dv dz el eo et eu fa fi fo ga gd gl gu ha he hr ht hu hy id ig is jv ka kk km kn ku ky la lb lo lt lv mg mi mk ml mn mr ms mt my ne nl nn no oc or pa pl ps qu rm ro sa sd si sk sl sn so sq sr su sv sw ta te tg th ti tk tl tr tt ug uk ur uz vi wo xh yi yo zu ak an av ba bi bm ch cr cu cv ee ff fj gn gv ho hz ia ie ik io ki kj kl kr ks kv kw lg ln lu mh na nd ng nr nv ny oj om os pi rn rw sc se sg sm ss st tn to ts tw ty ve vo wa za'.split(
  ' '
)
const displayNames =
  typeof (Intl as any).DisplayNames === 'function'
    ? new (Intl as any).DisplayNames(['zh-CN'], { type: 'language' })
    : null
export const LANGUAGES: readonly (readonly [string, string])[] = [
  ...MAIN_LANGUAGES,
  ...EXTRA_CODES.filter(
    code => !MAIN_LANGUAGES.some(item => item[0] === code)
  ).map(
    code => [code, displayNames ? displayNames.of(code) || code : code] as const
  )
]
export type LanguageCode = string
export const PREFERENCES_KEY = 'milo_translation_preferences_v1'
export interface TranslationPreferences {
  source: 'auto' | LanguageCode
  target: LanguageCode
  inputTarget: LanguageCode
  display: 'bilingual' | 'translation'
  style: 'plain' | 'muted' | 'boxed' | 'underline'
  dynamic: boolean
  hover: boolean
  subtitles: boolean
  automaticSites: string[]
  excludedSites: string[]
  glossary: string
  /** Page-edge Milo button: the main entry for page translation. */
  floatingButton: boolean
  floatingHiddenSites: string[]
  /** Vertical position of the button as a fraction of the viewport height. */
  floatingTop: number
  /** Underline saved 学习中 words on pages and in subtitles. */
  highlightWords: boolean
  /** Blur translations until hovered, so the reader tries the English first. */
  learningMode: boolean
}
export const DEFAULT_PREFERENCES: TranslationPreferences = {
  source: 'auto',
  target: 'zh-CN',
  inputTarget: 'en',
  display: 'bilingual',
  style: 'plain',
  dynamic: true,
  hover: true,
  subtitles: false,
  automaticSites: [],
  excludedSites: [],
  glossary: '',
  floatingButton: true,
  floatingHiddenSites: [],
  floatingTop: 0.62,
  highlightWords: true,
  learningMode: false
}
export function languageName(code: string): string {
  if (code === 'auto') return '自动识别原文语言'
  const found = LANGUAGES.find(item => item[0] === code)
  if (!found) throw new Error('不支持的语言')
  return found[1]
}
export function siteMatches(
  hostname: string,
  sites: readonly string[]
): boolean {
  const host = hostname.toLowerCase()
  return sites.some(
    site => site === '*' || host === site || host.endsWith('.' + site)
  )
}
export function parsePreferences(value: any): TranslationPreferences {
  const defaults = DEFAULT_PREFERENCES
  const language = (candidate: any, fallback: LanguageCode) =>
    LANGUAGES.some(item => item[0] === candidate) ? candidate : fallback
  const sites = (candidate: any) =>
    Array.isArray(candidate)
      ? (Array.from(
          new Set(
            candidate
              .filter(item => typeof item === 'string')
              .map(item => item.trim().toLowerCase())
              .filter(
                item =>
                  (item === '*' || /^[a-z0-9.-]+$/.test(item)) &&
                  !item.startsWith('.') &&
                  !item.endsWith('.')
              )
          )
        ).slice(0, 100) as string[])
      : []
  if (!value || typeof value !== 'object')
    return {
      ...defaults,
      automaticSites: [],
      excludedSites: [],
      floatingHiddenSites: []
    }
  return {
    source:
      !value.source || value.source === 'auto'
        ? 'auto'
        : language(value.source, defaults.target),
    target: language(value.target, defaults.target),
    inputTarget: language(value.inputTarget, defaults.inputTarget),
    display: value.display === 'translation' ? 'translation' : 'bilingual',
    style: ['plain', 'muted', 'boxed', 'underline'].includes(value.style)
      ? value.style
      : defaults.style,
    dynamic:
      typeof value.dynamic === 'boolean' ? value.dynamic : defaults.dynamic,
    hover: typeof value.hover === 'boolean' ? value.hover : defaults.hover,
    subtitles:
      typeof value.subtitles === 'boolean'
        ? value.subtitles
        : defaults.subtitles,
    automaticSites: sites(value.automaticSites),
    excludedSites: sites(value.excludedSites),
    glossary:
      typeof value.glossary === 'string'
        ? value.glossary.trim().slice(0, 4000)
        : '',
    floatingButton:
      typeof value.floatingButton === 'boolean'
        ? value.floatingButton
        : defaults.floatingButton,
    floatingHiddenSites: sites(value.floatingHiddenSites),
    floatingTop: clampTop(value.floatingTop),
    highlightWords:
      typeof value.highlightWords === 'boolean'
        ? value.highlightWords
        : defaults.highlightWords,
    learningMode: value.learningMode === true
  }
}

export function clampTop(value: unknown): number {
  return typeof value === 'number' && isFinite(value)
    ? Math.min(0.92, Math.max(0.08, value))
    : DEFAULT_PREFERENCES.floatingTop
}

export type FloatingButtonAction =
  | { action: 'hide-site' }
  | { action: 'hide-all' }
  | { action: 'move'; top: number }
