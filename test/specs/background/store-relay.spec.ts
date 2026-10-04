import { browser } from '../../helper'
import { startStoreRelay } from '@/background/store-relay'
import { PREFERENCES_KEY } from '@/models/TranslationPreferences'

const settle = async () => {
  jest.advanceTimersByTime(200)
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('storage changes relayed to pages', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    browser.flush()
    browser.tabs.query.resolves([
      { id: 1, url: 'https://example.com/post' },
      { id: 2, url: 'chrome://extensions/' },
      { id: 3, url: 'http://127.0.0.1:8080/' },
      { url: 'https://no-id.example/' }
    ])
    browser.tabs.sendMessage.resolves(undefined)
    startStoreRelay()
  })
  afterEach(() => jest.useRealTimers())

  const sent = () =>
    browser.tabs.sendMessage.args.map(([id, msg]: any[]) => [id, msg])

  it('tells web pages which followed key changed, without the value', async () => {
    browser.storage.onChanged.dispatch(
      { milo_words_v1: { newValue: { grit: { meaning: '毅力' } } } },
      'local'
    )
    await settle()
    const note = {
      type: 'MILO_STORE_CHANGED',
      payload: { key: 'milo_words_v1' }
    }
    expect(sent()).toEqual([
      [1, note],
      [3, note]
    ])
  })

  it('sends one note for a burst of writes, per key', async () => {
    browser.storage.onChanged.dispatch({ milo_words_v1: {} }, 'local')
    browser.storage.onChanged.dispatch({ milo_words_v1: {} }, 'local')
    browser.storage.onChanged.dispatch(
      { [PREFERENCES_KEY]: { newValue: {} } },
      'local'
    )
    await settle()
    expect(sent().map(([, msg]) => msg.payload.key)).toEqual([
      'milo_words_v1',
      'milo_words_v1',
      PREFERENCES_KEY,
      PREFERENCES_KEY
    ])
  })

  it('stays quiet about other keys and areas, and survives a closed tab', async () => {
    browser.storage.onChanged.dispatch({ milo_deepseek_api_key: {} }, 'local')
    browser.storage.onChanged.dispatch({ milo_words_v1: {} }, 'sync')
    await settle()
    expect(browser.tabs.sendMessage.called).toBe(false)
    browser.tabs.sendMessage.rejects(new Error('Receiving end does not exist'))
    browser.storage.onChanged.dispatch({ milo_words_v1: {} }, 'local')
    await settle()
    expect(browser.tabs.sendMessage.callCount).toBe(2)
  })
})
