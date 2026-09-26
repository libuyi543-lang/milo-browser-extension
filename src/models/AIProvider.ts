export type AIProviderId = 'deepseek' | 'zhipu' | 'xiaomi' | 'minimax'

export interface AIProviderDefinition {
  id: AIProviderId
  name: string
  endpoint: string
  defaultModel: string
  models: readonly string[]
  consoleURL: string
  docsURL: string
}

export const AI_PROVIDERS: readonly AIProviderDefinition[] = [
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
}
