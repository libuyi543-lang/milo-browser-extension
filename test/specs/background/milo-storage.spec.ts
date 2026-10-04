import {
  findMiloWordLocally,
  importMiloWordsLocally,
  listMiloWordsLocally,
  markMiloWordsSeenLocally,
  miloWordIndexLocally,
  saveMiloWordLocally,
  seenUrl,
  setMiloWordStatusLocally
} from '@/background/milo-storage'

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

  it('marks a word as known and back, keeping it in the index', async () => {
    await saveMiloWordLocally({ word: 'grit', meaning: '毅力' })
    expect(await miloWordIndexLocally()).toEqual([
      { word: 'grit', meaning: '毅力', status: 'learning', times: 1 }
    ])
    const known = await setMiloWordStatusLocally('Grit', 'known')
    expect(known.status).toBe('known')
    expect((await miloWordIndexLocally())[0].status).toBe('known')
    await setMiloWordStatusLocally('grit', 'learning')
    expect(data.milo_words_v1.grit.status).toBe('learning')
    await expect(setMiloWordStatusLocally('absent', 'known')).rejects.toThrow(
      '单词本里还没有这个词'
    )
    await expect(
      setMiloWordStatusLocally('grit', 'mastered' as any)
    ).rejects.toThrow('状态无效')
  })

  it('counts a word seen again once per page in a while', async () => {
    let now = 1000
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      await saveMiloWordLocally({
        word: 'grit',
        meaning: '毅力',
        url: 'https://example.com/a'
      })
      // The page where it was just saved does not count.
      expect(
        await markMiloWordsSeenLocally(['grit'], 'https://example.com/a')
      ).toBe(0)
      expect(
        await markMiloWordsSeenLocally(
          ['grit', 'grit', 'absent'],
          'https://example.com/b'
        )
      ).toBe(1)
      now += 60 * 1000
      expect(
        await markMiloWordsSeenLocally(['grit'], 'https://example.com/b')
      ).toBe(0)
      expect(
        await markMiloWordsSeenLocally(['grit'], 'https://example.com/c')
      ).toBe(1)
      now += 7 * 60 * 60 * 1000
      expect(
        await markMiloWordsSeenLocally(['grit'], 'https://example.com/c')
      ).toBe(1)
      const [word] = await listMiloWordsLocally()
      expect(word.seenCount).toBe(3)
      expect(word.encounterCount).toBe(1)
      expect((await miloWordIndexLocally())[0].times).toBe(4)
    } finally {
      spy.mockRestore()
    }
  })

  it('finds a saved word from an inflected look-up', async () => {
    await saveMiloWordLocally({ word: 'study', meaning: '学习' })
    expect((await findMiloWordLocally('Studies'))!.word).toBe('study')
    expect(await findMiloWordLocally('student')).toBeNull()
  })

  it('keeps status and sightings through backup and restore', async () => {
    await saveMiloWordLocally({ word: 'grit', meaning: '毅力' })
    await setMiloWordStatusLocally('grit', 'known')
    const backup = JSON.parse(JSON.stringify(await listMiloWordsLocally()))
    backup[0].seenCount = 5
    Object.keys(data).forEach(key => delete data[key])
    await importMiloWordsLocally(backup)
    const [restored] = await listMiloWordsLocally()
    expect(restored.status).toBe('known')
    expect(restored.seenCount).toBe(5)
  })

  it('uses one address per page and per YouTube video', () => {
    expect(seenUrl('https://example.com/a?x=1#top')).toBe(
      'https://example.com/a?x=1'
    )
    expect(seenUrl('https://www.youtube.com/watch?v=abc&t=30s&list=x')).toBe(
      'https://www.youtube.com/watch?v=abc'
    )
    expect(seenUrl('chrome-extension://id/notebook.html')).toBe('')
    expect(seenUrl(undefined)).toBe('')
  })
})
