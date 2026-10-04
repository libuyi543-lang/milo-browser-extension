const mockGet = jest.fn()
jest.mock('@/services/translation/general', () => ({
  getPreferences: () => mockGet()
}))

import { browser } from '../../helper'
import { onStoreChange } from '@/content/store-changes'
import { watchPreferences } from '@/content/preferences-watch'
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY
} from '@/models/TranslationPreferences'

const note = (key: string, sender: any = {}) =>
  browser.runtime.onMessage.dispatch(
    { type: 'MILO_STORE_CHANGED', payload: { key } },
    sender
  )
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('stored changes seen from a page', () => {
  beforeEach(() => {
    browser.flush()
    mockGet.mockReset()
  })

  it('calls back for its key from the background only, until stopped', () => {
    const callback = jest.fn()
    const stop = onStoreChange('milo_words_v1', callback)
    note('milo_words_v1')
    note('other_key')
    // Another tab's content script cannot pose as the background.
    note('milo_words_v1', { tab: { id: 4 } })
    expect(callback).toHaveBeenCalledTimes(1)
    stop()
    note('milo_words_v1')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('re-reads preferences when they are saved, and the newest read wins', async () => {
    const replies: Array<(value: any) => void> = []
    mockGet.mockImplementation(
      () => new Promise(resolve => replies.push(resolve))
    )
    const callback = jest.fn()
    const stop = watchPreferences(callback)
    note(PREFERENCES_KEY)
    expect(replies).toHaveLength(2)
    // The newer reply arrives first; the stale first read is then ignored.
    replies[1]({ ...DEFAULT_PREFERENCES, learningMode: true })
    replies[0]({ ...DEFAULT_PREFERENCES, learningMode: false })
    await settle()
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0].learningMode).toBe(true)
    stop()
    note(PREFERENCES_KEY)
    expect(replies).toHaveLength(2)
  })
})
