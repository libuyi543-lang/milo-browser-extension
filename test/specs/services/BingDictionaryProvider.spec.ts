import { parseBingResult } from '@/services/translation/BingDictionaryProvider'

describe('Bing dictionary adapter', () => {
  it('reduces multiple dictionary entries to a simple meaning', () => {
    expect(parseBingResult({ result: {
      type: 'lex',
      cdef: [{ pos: 'adj.', def: '不可避免的' }, { pos: 'adj.', def: '必然发生的' }]
    } })).toEqual({ meaning: '不可避免的；必然发生的', partOfSpeech: 'adj.' })
  })

  it('refuses to present an empty definition as a successful lookup', () => {
    expect(() => parseBingResult({ result: null })).toThrow('可靠释义')
  })
})
