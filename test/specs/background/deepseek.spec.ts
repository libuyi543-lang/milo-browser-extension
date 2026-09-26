import { parseParagraphs, parseWord } from '@/background/deepseek'

describe('DeepSeek structured responses', () => {
  it('accepts a word meaning and optional pronunciation', () => {
    expect(parseWord({ meaning: '不可避免的', phonetic: '/ɪnˈevɪtəbl/', partOfSpeech: 'adj.' })).toEqual({ meaning: '不可避免的', phonetic: '/ɪnˈevɪtəbl/', partOfSpeech: 'adj.' })
    expect(() => parseWord({ meaning: '' })).toThrow()
  })
  it('matches paragraphs by ID even when returned out of order', () => {
    const items = [{ id: '0', text: 'First paragraph.' }, { id: '1', text: 'Second paragraph.' }]
    expect(parseParagraphs({ translations: [{ id: '1', text: '第二段。' }, { id: '0', text: '第一段。' }] }, items).map(item => item.text)).toEqual(['第一段。', '第二段。'])
    expect(() => parseParagraphs({ translations: [{ id: '0', text: '第一段。' }] }, items)).toThrow()
    expect(() => parseParagraphs({ translations: [{ id: '0', text: '一' }, { id: '0', text: '二' }] }, [items[0]])).toThrow()
  })
})
