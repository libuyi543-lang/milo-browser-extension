describe('extension context invalidation', () => {
  let originalId: PropertyDescriptor | undefined

  beforeEach(() => {
    jest.resetModules()
    originalId = Object.getOwnPropertyDescriptor(browser.runtime, 'id')
    Object.defineProperty(browser.runtime, 'id', { configurable: true, value: 'milo-test' })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalId) Object.defineProperty(browser.runtime, 'id', originalId)
    else delete (browser.runtime as any).id
  })

  it('consumes a context-invalidated rejection and stops future selection sends', async () => {
    const lifecycle = require('@/_helpers/extension-lifecycle')
    const cleanup = jest.fn()
    lifecycle.onContextInvalidated(cleanup)
    const task = jest.fn(() => Promise.reject(new Error('Extension context invalidated.')))
    await lifecycle.runSelectionTask(task)
    await lifecycle.runSelectionTask(task)
    expect(task).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(lifecycle.isExtensionContextValid()).toBe(false)
  })

  it('stops before sending when Chrome removes the runtime ID', async () => {
    const lifecycle = require('@/_helpers/extension-lifecycle')
    Object.defineProperty(browser.runtime, 'id', { configurable: true, value: undefined })
    const task = jest.fn(() => Promise.resolve())
    const cleanup = jest.fn()
    lifecycle.onContextInvalidated(cleanup)
    await lifecycle.runSelectionTask(task)
    expect(task).not.toHaveBeenCalled()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('continues after a transient delivery failure instead of invalidating the extension', async () => {
    const lifecycle = require('@/_helpers/extension-lifecycle')
    const log = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    await lifecycle.runSelectionTask(() => Promise.reject(new Error('Receiving end does not exist.')))
    const retry = jest.fn(() => Promise.resolve())
    await lifecycle.runSelectionTask(retry)
    expect(log).toHaveBeenCalledTimes(1)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(lifecycle.isExtensionContextValid()).toBe(true)
  })

  it('catches synchronous runtime errors through the messaging wrapper', async () => {
    const lifecycle = require('@/_helpers/extension-lifecycle')
    const { message } = require('@/_helpers/browser-api')
    const cleanup = jest.fn()
    lifecycle.onContextInvalidated(cleanup)
    ;(browser.runtime.sendMessage as any).callsFake(() => { throw new Error('Extension context invalidated.') })
    await lifecycle.runSelectionTask(() => message.send({ type: 'PAGE_INFO' }))
    expect(cleanup).toHaveBeenCalledTimes(1)
    ;(browser.runtime.sendMessage as any).resetBehavior()
  })

  it('unsubscribes the actual selection stream when page info delivery is invalidated', async () => {
    const { Subject } = require('rxjs')
    const selected = new Subject()
    const escape = new Subject()
    const word = jest.fn(() => Promise.reject(new Error('Extension context invalidated.')))
    jest.doMock('@/selection/select-text', () => ({ createSelectTextStream: () => selected }))
    jest.doMock('@/selection/helper', () => ({ newSelectionWord: word, isEscapeKey: () => true, whenKeyPressed: () => escape }))
    delete window.__MILO_SELECTION_LOADED__
    require('@/selection')
    selected.next({ word: { text: 'inevitable' }, self: false })
    await Promise.resolve()
    await Promise.resolve()
    expect(selected.observers).toHaveLength(0)
    expect(escape.observers).toHaveLength(0)
    selected.next({ word: { text: 'again' }, self: false })
    expect(word).toHaveBeenCalledTimes(1)
    delete window.__MILO_SELECTION_LOADED__
    jest.dontMock('@/selection/select-text')
    jest.dontMock('@/selection/helper')
  })
})
