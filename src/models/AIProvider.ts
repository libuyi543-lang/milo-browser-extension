export type AIProviderId =
  | 'google-free'
  | 'deepseek'
  | 'zhipu'
  | 'xiaomi'
  | 'minimax'
  | 'custom'
  | 'deepl'
  | 'google'
  | 'microsoft'

export interface AIProviderDefinition {
  id: AIProviderId
  name: string
  endpoint: string
  defaultModel: string
  models: readonly string[]
  consoleURL: string
  docsURL: string
  /** Works without an API key; used as the default and as the fallback. */
  keyless?: boolean
}

export const FREE_PROVIDER: AIProviderId = 'google-free'

export const AI_PROVIDERS: readonly AIProviderDefinition[] = [
  {
    id: 'google-free',
    name: '免费翻译（Google）',
    endpoint: 'https://translate.googleapis.com/translate_a',
    defaultModel: 'gtx',
    models: ['gtx'],
    consoleURL: 'https://translate.google.com/',
    docsURL: 'https://translate.google.com/',
    keyless: true
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    consoleURL: 'https://platform.deepseek.com/api_keys',
    docsURL: 'https://api-docs.deepseek.com/api/create-chat-completion/'
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    defaultModel: 'glm-4.7-flash',
    models: ['glm-4.7-flash', 'glm-4.7', 'glm-5.3'],
    consoleURL: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    docsURL: 'https://docs.bigmodel.cn/api-reference/模型-api/对话补全'
  },
  {
    id: 'xiaomi',
    name: '小米 MiMo',
    endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
    defaultModel: 'mimo-v2.6-flash',
    models: ['mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.5'],
    consoleURL: 'https://mimo.mi.com/',
    docsURL: 'https://mimo.mi.com/docs/en-US/api/chat'
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    endpoint: 'https://api.minimax.cn/v1/chat/completions',
    defaultModel: 'MiniMax-M2.7',
    models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M3'],
    consoleURL: 'https://platform.minimax.cn/',
    docsURL: 'https://platform.minimax.cn/docs/api-reference/text-openai-api'
  },
  {
    id: 'custom',
    name: '自定义兼容 API',
    endpoint: '',
    defaultModel: 'your-model',
    models: [],
    consoleURL:
      'https://github.com/libuyi543-lang/milo-browser-extension/blob/main/docs/AI_PROVIDERS.md',
    docsURL:
      'https://github.com/libuyi543-lang/milo-browser-extension/blob/main/docs/AI_PROVIDERS.md'
  },
  {
    id: 'deepl',
    name: 'DeepL',
    endpoint: 'https://api.deepl.com/v2/translate',
    defaultModel: 'prefer_quality_optimized',
    models: [
      'prefer_quality_optimized',
      'latency_optimized',
      'quality_optimized'
    ],
    consoleURL: 'https://www.deepl.com/your-account/keys',
    docsURL:
      'https://developers.deepl.com/api-reference/translate/request-translation'
  },
  {
    id: 'google',
    name: 'Google 翻译',
    endpoint: 'https://translation.googleapis.com/language/translate/v2',
    defaultModel: 'v2',
    models: ['v2'],
    consoleURL: 'https://console.cloud.google.com/apis/credentials',
    docsURL:
      'https://cloud.google.com/translate/docs/reference/rest/v2/translate'
  },
  {
    id: 'microsoft',
    name: 'Microsoft 翻译',
    endpoint: 'https://api.cognitive.microsofttranslator.com/translate',
    defaultModel: 'v3',
    models: ['v3'],
    consoleURL: 'https://portal.azure.com/',
    docsURL:
      'https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/translate'
  }
]

export function getAIProvider(id: string): AIProviderDefinition {
  const provider = AI_PROVIDERS.find(item => item.id === id)
  if (!provider) throw new Error('不支持的 AI 服务')
  return provider
}

export interface AIProfileSummary {
  id: AIProviderId
  model: string
  configured: boolean
  endpoint?: string
  region?: string
}

export interface AISettings {
  provider: AIProviderId
  configured: boolean
  model: string
  profiles: AIProfileSummary[]
  cache: { entries: number; bytes: number }
}

export interface AISettingsInput {
  provider: AIProviderId
  model: string
  /** An omitted key preserves the saved key. Keys are never returned to UI. */
  apiKey?: string
  endpoint?: string
  region?: string
}
