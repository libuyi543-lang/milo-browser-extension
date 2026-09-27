import {
  saveMiloWordLocally,
  listMiloWordsLocally,
  importMiloWordsLocally,
  deleteMiloWordLocally
} from '@/background/milo-storage'
describe('desktop notebook backup', () => {
  const data: Record<string, any> = {}
  beforeEach(() => {
    Object.keys(data).forEach(key => delete data[key])
    ;(browser.storage.local.get as any).callsFake(async () => ({ ...data }))
    ;(browser.storage.local.set as any).callsFake(async patch =>
      Object.assign(data, patch)
    )
  })
  afterEach(() => {
    ;(browser.storage.local.get as any).resetBehavior()
    ;(browser.storage.local.set as any).resetBehavior()
  })
  it('merges repeated imports without inventing additional encounters', async () => {
    const word = await saveMiloWordLocally({
      word: 'example',
      meaning: '示例',
      sentence: 'An example appears.'
    })
    await importMiloWordsLocally([JSON.parse(JSON.stringify(word))])
    await importMiloWordsLocally([JSON.parse(JSON.stringify(word))])
    expect((await listMiloWordsLocally())[0].encounterCount).toBe(1)
  })
  it('validates an entire import before writing any valid prefix', async () => {
    const word = await saveMiloWordLocally({ word: 'example', meaning: '示例' })
    await expect(
      importMiloWordsLocally([word, { word: 'invalid' }])
    ).rejects.toThrow()
    expect(await listMiloWordsLocally()).toHaveLength(1)
  })
  it('returns deleted data for undo and restores all reading context', async () => {
    const word = await saveMiloWordLocally({
      word: 'example',
      meaning: '示例',
      sentence: 'An example appears.',
      url: 'https://example.com'
    })
    const removed = await deleteMiloWordLocally('example')
    expect(await listMiloWordsLocally()).toHaveLength(0)
    await importMiloWordsLocally([removed])
    expect((await listMiloWordsLocally())[0].encounters).toEqual(
      word.encounters
    )
  })
})
