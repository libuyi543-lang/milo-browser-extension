import { baseCandidates, wordForms } from '@/models/word-forms'

describe('regular English word forms', () => {
  it('covers plural, past and -ing forms of a saved word', () => {
    expect(wordForms('run')).toEqual(
      expect.arrayContaining(['run', 'runs', 'running'])
    )
    expect(wordForms('study')).toEqual(
      expect.arrayContaining(['study', 'studies', 'studied', 'studying'])
    )
    expect(wordForms('make')).toEqual(
      expect.arrayContaining(['makes', 'making'])
    )
    expect(wordForms('stop')).toEqual(
      expect.arrayContaining(['stopped', 'stopping'])
    )
    expect(wordForms('watch')).toEqual(
      expect.arrayContaining(['watches', 'watched', 'watching'])
    )
    expect(wordForms('agree')).toEqual(
      expect.arrayContaining(['agreed', 'agreeing'])
    )
    // Short words only match themselves, so "a" never lights up "as".
    expect(wordForms('go')).toEqual(['go'])
    expect(wordForms('two words')).toEqual([])
  })

  it('finds the saved form behind an inflected token', () => {
    expect(baseCandidates('studies')).toContain('study')
    expect(baseCandidates('running')).toContain('run')
    expect(baseCandidates('making')).toContain('make')
    expect(baseCandidates('Resilience’s')[0]).toBe('resilience')
    expect(baseCandidates('word')).toEqual(['word'])
  })
})
