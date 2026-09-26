import { TranslationCache } from '@/background/translation-cache'

describe('bounded persistent translation results', () => {
  const data: Record<string, any> = {}
  const hash = async (text: string) => require('crypto').createHash('sha256').update(text).digest('hex')
  beforeEach(() => {
    Object.keys(data).forEach(key => delete data[key])
    ;(browser.storage.local.get as any).callsFake(async () => ({ ...data }))
    ;(browser.storage.local.set as any).callsFake(async patch => Object.assign(data, patch))
  })
  afterEach(() => { (browser.storage.local.get as any).resetBehavior(); (browser.storage.local.set as any).resetBehavior() })

  it('reuses persisted results after a worker restart, with hashed lookup keys', async () => {
    const first = new TranslationCache('model:prompt-v1', 500, 1024 * 1024, Date.now, hash)
    await first.put([{ kind: 'paragraph', text: 'Private English source paragraph.', value: '中文译文。' }])
    const restarted = new TranslationCache('model:prompt-v1', 500, 1024 * 1024, Date.now, hash)
    expect(await restarted.get('paragraph', 'Private English source paragraph.')).toBe('中文译文。')
    expect(JSON.stringify(data.milo_translation_cache_v1)).not.toContain('Private English source paragraph.')
    const updatedModel = new TranslationCache('model:prompt-v2', 500, 1024 * 1024, Date.now, hash)
    expect(await updatedModel.get('paragraph', 'Private English source paragraph.')).toBeUndefined()
  })

  it('expires page translations after 7 days while words remain reusable for 30 days', async () => {
    let now = 1000
    const cache = new TranslationCache('model', 500, 1024 * 1024, () => now, hash)
    await cache.put([{ kind: 'paragraph', text: 'A paragraph.', value: '一段。' }, { kind: 'word', text: 'word', value: { meaning: '单词' } }])
    now += 8 * 24 * 60 * 60 * 1000
    expect(await cache.get('paragraph', 'A paragraph.')).toBeUndefined()
    expect((await cache.get('word', 'word')).meaning).toBe('单词')
    now += 23 * 24 * 60 * 60 * 1000
    expect(await cache.get('word', 'word')).toBeUndefined()
  })

  it('evicts older results and respects a byte budget without deleting the notebook', async () => {
    data.milo_words_v1 = { existing: { meaning: '保留的单词' } }
    const cache = new TranslationCache('model', 2, 10000, Date.now, hash)
    await cache.put([{ kind: 'paragraph', text: 'First', value: '一' }, { kind: 'paragraph', text: 'Second', value: '二' }])
    await cache.get('paragraph', 'First')
    await cache.put([{ kind: 'paragraph', text: 'Third', value: '三' }])
    expect(await cache.get('paragraph', 'Second')).toBeUndefined()
    expect(await cache.get('paragraph', 'First')).toBe('一')
    await cache.clear()
    expect((await cache.info()).entries).toBe(0)
    expect(data.milo_words_v1.existing.meaning).toBe('保留的单词')
    const small = new TranslationCache('small', 500, 256, Date.now, hash)
    await small.put([{ kind: 'paragraph', text: 'Too large', value: '中'.repeat(1000) }])
    expect((await small.info()).entries).toBe(0)
  })
})
