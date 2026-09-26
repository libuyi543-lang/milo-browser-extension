import { AIProviderId, getAIProvider } from '@/models/AIProvider'

export interface ChatConfiguration {
  provider: AIProviderId
  model: string
  apiKey: string
}

export function createChatRequest(
  config: ChatConfiguration,
  instruction: string,
  input: unknown,
  maxTokens: number
) {
  const definition = getAIProvider(config.provider)
  const body: Record<string, any> = {
    model: config.model,
    stream: false,
    messages: [
      { role: 'system', content: instruction },
      { role: 'user', content: JSON.stringify(input) }
    ]
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.provider === 'xiaomi') headers['api-key'] = config.apiKey
  else headers.Authorization = `Bearer ${config.apiKey}`

  if (config.provider === 'minimax') {
    body.reasoning_split = true
    body.temperature = 1
    body.max_completion_tokens = /^MiniMax-M3/i.test(config.model)
      ? maxTokens
      : Math.max(maxTokens * 2, 4096)
    if (/^MiniMax-M3/i.test(config.model)) body.thinking = { type: 'disabled' }
  } else {
    body.response_format = { type: 'json_object' }
    body.thinking = { type: 'disabled' }
    body.temperature = config.provider === 'deepseek' ? 0.2 : 1
    if (config.provider === 'xiaomi') body.max_completion_tokens = maxTokens
    else body.max_tokens = maxTokens
  }
  return {
    endpoint: definition.endpoint,
    headers,
    body,
    timeout: config.provider === 'minimax' ? 60000 : 25000
  }
}

export function parseChatJSON(content: unknown): any {
  if (typeof content !== 'string') throw new Error('模型返回格式无效，请重试')
  const value = content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    return JSON.parse(value)
  } catch (_) {
    throw new Error('模型返回格式无效，请重试')
  }
}
