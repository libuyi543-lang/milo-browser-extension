import { addEncounter, createMiloWord, normalizeWord } from '@/models/MiloWord'

describe('MiloWord', () => {
  it('normalizes a word and preserves its first reading context', () => {
    const first = createMiloWord({
      word: 'Inevitable',
      meaning: '不可避免的',
      sentence: 'The decline seemed inevitable.',
      title: 'An article',
      url: 'https://example.com/article'
    }, 'milo_1', 1000)

    expect(normalizeWord(' INEVITABLE ')).toBe('inevitable')
    expect(first.normalizedWord).toBe('inevitable')
    expect(first.encounterCount).toBe(1)
    expect(first.source.url).toBe('https://example.com/article')

    const second = addEncounter(first, {
      word: 'inevitable',
      meaning: '不可避免的',
      sentence: 'The end was inevitable.',
      title: 'Another page',
      url: 'https://example.com/another'
    }, 2000)

    expect(second.id).toBe(first.id)
    expect(second.createdAt).toBe(1000)
    expect(second.encounterCount).toBe(2)
    expect(second.encounters).toHaveLength(2)
    expect(second.encounters[1].sentence).toBe('The end was inevitable.')
    expect(second.sentence).toBe('The decline seemed inevitable.')
  })
})
