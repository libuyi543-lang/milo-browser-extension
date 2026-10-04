const mockIndex = jest.fn()
const mockReport = jest.fn(async (_words: string[]) => 1)
jest.mock('@/services/miloStorage', () => ({
  savedWordIndex: () => mockIndex(),
  reportSeenWords: (words: string[]) => mockReport(words)
}))
jest.mock('@/_helpers/extension-lifecycle', () => ({
  isExtensionContextValid: () => true
}))

import { SavedWordEntry } from '@/models/MiloWord'
import { createSavedWords } from '@/content/saved-words'
import { browser } from '../../helper'

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
  jest.advanceTimersByTime(1600)
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

/** The background reports the word book changed (pages cannot watch storage). */
const changed = () =>
  browser.runtime.onMessage.dispatch(
    { type: 'MILO_STORE_CHANGED', payload: { key: 'milo_words_v1' } },
    {}
  )

const entry = (over: Partial<SavedWordEntry> = {}): SavedWordEntry => ({
  word: 'grit',
  meaning: '毅力',
  status: 'learning',
  times: 3,
  ...over
})

describe('saved words on a page', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockIndex.mockReset()
    mockReport.mockClear()
    mockIndex.mockResolvedValue([entry()])
  })
  afterEach(() => jest.useRealTimers())

  it('recognises saved words, plural and past forms included', async () => {
    mockIndex.mockResolvedValue([
      entry(),
      entry({ word: 'study', meaning: '学习' })
    ])
    const saved = createSavedWords()
    await saved.ready
    expect(saved.match('Grit')!.word).toBe('grit')
    expect(saved.match('studies')!.word).toBe('study')
    expect(saved.match('unknown')).toBeUndefined()
    saved.destroy()
  })

  it('counts a sighting once per page, and not the page it was saved on', async () => {
    const saved = createSavedWords()
    await saved.ready
    saved.seen('grit')
    saved.seen('grit')
    await flush()
    expect(mockReport).toHaveBeenCalledTimes(1)
    expect(mockReport).toHaveBeenCalledWith(['grit'])
    saved.destroy()
  })

  it('reloads when another Milo page saves a word, and honours the filter', async () => {
    const saved = createSavedWords()
    await saved.ready
    const listener = jest.fn()
    saved.subscribe(listener)
    // Counts alone do not repaint: nothing about the page changes.
    mockIndex.mockResolvedValue([entry({ times: 9 })])
    changed()
    jest.advanceTimersByTime(500)
    await flush()
    expect(listener).not.toHaveBeenCalled()
    // A new word does, and it is matchable straight away.
    mockIndex.mockResolvedValue([entry(), entry({ word: 'new' })])
    changed()
    jest.advanceTimersByTime(500)
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(saved.match('new')!.meaning).toBe('毅力')
    // Marking the word 已掌握 repaints too; the page then drops the mark.
    mockIndex.mockResolvedValue([entry({ status: 'known' })])
    changed()
    jest.advanceTimersByTime(500)
    await flush()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(saved.match('grit')!.status).toBe('known')
    saved.destroy()
    changed()
    jest.advanceTimersByTime(2000)
    await flush()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('keeps one pending report per page and drops it after destroy', async () => {
    const saved = createSavedWords()
    await saved.ready
    saved.seen('grit')
    saved.destroy()
    jest.advanceTimersByTime(2000)
    await flush()
    expect(mockReport).not.toHaveBeenCalled()
  })
})
