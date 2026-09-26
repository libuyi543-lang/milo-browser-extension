import { listMiloWordsLocally, saveMiloWordLocally } from '@/background/milo-storage'

describe('Milo local storage', () => {
  const data: Record<string, any> = {}

  beforeEach(() => {
    Object.keys(data).forEach(key => delete data[key])
    ;(browser.storage.local.get as any).callsFake(async () => ({ ...data }))
    ;(browser.storage.local.set as any).callsFake(async patch => {
      Object.assign(data, patch)
    })
  })

  afterEach(() => {
    ;(browser.storage.local.get as any).resetBehavior()
    ;(browser.storage.local.set as any).resetBehavior()
  })

  it('saves the word and the page where it was found', async () => {
    const saved = await saveMiloWordLocally({
      word: 'inevitable',
      meaning: '不可避免的',
      sentence: 'The decline seemed inevitable.',
      title: 'Market report',
      url: 'https://example.com/report'
    })

    expect(saved.source.type).toBe('browser')
    expect(saved.encounters[0].sentence).toBe('The decline seemed inevitable.')
    expect(data.milo_words_v1.inevitable.id).toBe(saved.id)
    expect(await listMiloWordsLocally()).toHaveLength(1)
  })

  it('merges simultaneous saves of the same word into two encounters', async () => {
    await Promise.all([
      saveMiloWordLocally({
        word: 'Inevitable',
        meaning: '不可避免的',
        sentence: 'The decline seemed inevitable.',
        title: 'First page',
        url: 'https://example.com/first'
      }),
      saveMiloWordLocally({
        word: 'inevitable',
        meaning: '不可避免的',
        sentence: 'The end was inevitable.',
        title: 'Second page',
        url: 'https://example.com/second'
      })
    ])

    const words = await listMiloWordsLocally()
    expect(words).toHaveLength(1)
    expect(words[0].encounterCount).toBe(2)
    expect(words[0].encounters.map(item => item.url)).toEqual([
      'https://example.com/first',
      'https://example.com/second'
    ])
  })

  it('stores an English word that is also an Object property name', async () => {
    const saved = await saveMiloWordLocally({ word: 'constructor', meaning: '构造器' })
    expect(saved.normalizedWord).toBe('constructor')
    expect(saved.encounterCount).toBe(1)
    expect(await listMiloWordsLocally()).toHaveLength(1)
  })
})
