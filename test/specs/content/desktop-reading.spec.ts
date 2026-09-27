import {
  collectParagraphs,
  insertTranslation
} from '@/content/page-translation/paragraphs'
import { PageTranslation } from '@/content/page-translation'
import { DEFAULT_PREFERENCES } from '@/models/TranslationPreferences'
import { collectReadingParagraphs } from '@/content/page-translation/scope'
describe('expanded desktop reading', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.querySelectorAll('.milo-external').forEach(node => node.remove())
    jest.useRealTimers()
  })
  it('recognizes non-Latin scripts while leaving Chinese UI out of default Chinese translation', () => {
    document.body.innerHTML =
      '<main><p>こんにちは世界です。</p><p>Привет новый мир.</p><p>这是中文界面。</p></main>'
    expect(
      collectReadingParagraphs(document.body).map(item => item.text)
    ).toEqual(['こんにちは世界です。', 'Привет новый мир.'])
  })
  it('restores translation-only paragraphs, table cells and links', async () => {
    document.body.innerHTML =
      '<article><p>A useful <a href="https://example.com">English link</a>.</p><ul><li>Another English list item.</li></ul></article>'
    const original = document.body.innerHTML
    const controller = new PageTranslation(async items =>
      items.map(item => ({ id: item.id, text: '中文译文' }))
    )
    controller.configure({
      ...DEFAULT_PREFERENCES,
      display: 'translation',
      dynamic: false,
      style: 'boxed'
    })
    controller.toggle()
    await Promise.resolve()
    expect(document.querySelector('p')!.style.display).toBe('none')
    expect(document.querySelector('li')!.firstChild!.textContent).toBe('')
    expect(
      document.querySelector('[data-milo-translation] a')!.getAttribute('href')
    ).toBe('https://example.com/')
    controller.clear()
    expect(document.body.innerHTML).toBe(original)
  })
  it('translates newly inserted content and replaces changed content without stale duplicates', async () => {
    jest.useFakeTimers()
    document.body.innerHTML =
      '<article><p>First English paragraph.</p></article>'
    const translate = jest.fn(async items =>
      items.map(item => ({ id: item.id, text: '译文 ' + item.text }))
    )
    const controller = new PageTranslation(translate)
    controller.toggle()
    await Promise.resolve()
    const paragraph = document.createElement('p')
    paragraph.textContent = 'Second English paragraph.'
    document.querySelector('article')!.appendChild(paragraph)
    await Promise.resolve()
    jest.advanceTimersByTime(400)
    await Promise.resolve()
    expect(document.querySelectorAll('[data-milo-translation]')).toHaveLength(2)
    for (const text of [
      'Updated English paragraph.',
      'Final English paragraph.'
    ]) {
      paragraph.textContent = text
      await Promise.resolve()
      jest.advanceTimersByTime(400)
      await Promise.resolve()
      expect(document.querySelectorAll('[data-milo-translation]')).toHaveLength(
        2
      )
    }
    expect(document.body.textContent).not.toContain('译文 Second')
    controller.clear()
  })
})

describe('stale reading responses', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })
  it('does not insert an old translation when the same paragraph node gets new text children', () => {
    document.body.innerHTML = '<p>Original English text.</p>'
    const paragraph = collectParagraphs(document.body)[0]
    paragraph.element.textContent = 'Updated English text.'
    expect(insertTranslation(paragraph, '旧译文')).toBeNull()
    expect(document.querySelector('[data-milo-translation]')).toBeNull()
  })
})
