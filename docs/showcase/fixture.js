/* Local documentation fixture only. Never shipped in the extension. */
window.pageId = 'milo-public-demo'
window.demoMessages = []
const listeners = new Set()
const sentence = 'The decline seemed inevitable after several years of falling demand.'
const examples = [
  { word: 'inevitable', meaning: '不可避免的；必然发生的', sentence, encounterCount: 3 },
  { word: 'resilient', meaning: '有韧性的；能迅速恢复的', sentence: 'For the resilient team, a new beginning was inevitable.', encounterCount: 2 },
  { word: 'encounter', meaning: '遇见；偶遇', sentence: 'Every encounter with a new word is a chance to understand the world a little better.', encounterCount: 1 }
]
const translations = {
  'Finding a new beginning': '寻找新的开始',
  [sentence]: '在需求连续几年下降之后，衰退似乎已不可避免。',
  'For the resilient team, a new beginning was inevitable.': '对于这支坚韧的团队而言，一个新的开始终将到来。',
  'Every encounter with a new word is a chance to understand the world a little better.': '每一次遇见新词，都是多理解一点世界的机会。'
}
const profiles = [
  { id: 'deepseek', model: 'deepseek-v4-flash', configured: true },
  { id: 'zhipu', model: 'glm-4.7-flash', configured: false },
  { id: 'xiaomi', model: 'mimo-v2.6-flash', configured: false },
  { id: 'minimax', model: 'MiniMax-M2.7', configured: false },
  { id: 'custom', model: 'your-model', configured: false },
  { id:'deepl',model:'prefer_quality_optimized',configured:false },
  { id:'google',model:'v2',configured:false },
  { id:'microsoft',model:'v3',configured:false }
]
let activeProvider = 'deepseek'
const aiSettings = () => {
  const active = profiles.find(item => item.id === activeProvider)
  return { provider: activeProvider, configured: active.configured, model: active.model,
    profiles: profiles.map(item => ({ ...item })), cache: { entries: 4, bytes: 2000 } }
}
window.browser = {
  runtime: {
    id: 'documentation-fixture',
    getURL: path => '/' + path,
    onMessage: {
      addListener: cb => listeners.add(cb),
      removeListener: cb => listeners.delete(cb)
    },
    async sendMessage(msg) {
      window.demoMessages.push(msg.type)
      if (msg.type === 'MILO_TRANSLATE_WORD') return { result: { meaning: examples[0].meaning, partOfSpeech: 'adj.' } }
      if (msg.type === 'MILO_SAVE_WORD') return { id: 'demo-saved-word', ...msg.payload }
      if (msg.type === 'MILO_TRANSLATE_PARAGRAPHS') return { translations: msg.payload.items.map(item => ({ ...item, text: translations[item.text] || '示例译文' })) }
      if (msg.type === 'MILO_AI_SETTINGS') return aiSettings()
      if (msg.type === 'MILO_SAVE_AI_SETTINGS') {
        activeProvider = msg.payload.provider
        const profile = profiles.find(item => item.id === activeProvider)
        profile.model = msg.payload.model
        if (msg.payload.apiKey !== undefined) profile.configured = !!msg.payload.apiKey
        return aiSettings()
      }
      if (msg.type === 'MILO_TEST_AI_CONNECTION') return { ok: true }
      if (msg.type === 'MILO_LIST_WORDS') return examples.map((word, i) => ({ ...word, id: 'demo-' + i, encounters: [{ sentence: word.sentence, title: 'The Reading Journal', url: 'https://example.com/reading', createdAt: 1780000000000 }] }))
      return true
    }
  }
}
window.openDemoWord = () => {
  const rect = document.querySelector('.target').getBoundingClientRect()
  const msg = {
    type: 'SELECTION', __pageId__: window.pageId,
    payload: { self: false, mouseX: rect.right + 15, mouseY: rect.top,
      word: { text: 'inevitable', context: sentence, title: document.title, url: 'https://example.com/reading' } }
  }
  listeners.forEach(cb => cb(msg, {}))
}
