import { translateImage, transcribeAudio } from './media-translation'
import { message } from '@/_helpers/browser-api'
import { startMiloStorageServer } from './milo-storage'
import {
  getAISettings,
  saveAPIKey,
  saveAISettings,
  testAIConnection,
  translateWordWithAI,
  translateParagraphsWithAI,
  translateInputWithAI,
  translateGeneralText,
  clearTranslationCache
} from './ai-translation'
import { getPreferences, savePreferences } from './preferences'
import { startDesktopActions } from './desktop-actions'

// Keep the original extension message bridge, including PAGE_INFO and iframe routing.
message.self.initServer()
startMiloStorageServer()
startDesktopActions()
const sessions = new Map<
  string,
  { controller: AbortController; pending: number }
>()
function sessionKey(sessionId: string, sender: browser.runtime.MessageSender) {
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 120)
    throw new Error('翻译会话无效')
  return `${sender.tab ? sender.tab.id : 'extension'}:${(sender as any)
    .frameId || 0}:${sessionId}`
}

async function withSession<T>(
  sessionId: string | undefined,
  sender: browser.runtime.MessageSender,
  task: (signal?: AbortSignal) => Promise<T>
): Promise<T> {
  if (!sessionId) return task()
  const key = sessionKey(sessionId, sender)
  const session = sessions.get(key) || {
    controller: new AbortController(),
    pending: 0
  }
  session.pending += 1
  sessions.set(key, session)
  try {
    return await task(session.controller.signal)
  } finally {
    session.pending -= 1
    if (!session.pending && sessions.get(key) === session) sessions.delete(key)
  }
}

// Keep browser credentials available only to extension-owned contexts.
const nativeStorage = (self as any).chrome && (self as any).chrome.storage.local
if (nativeStorage && nativeStorage.setAccessLevel) {
  nativeStorage
    .setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
    .catch(console.error)
}

message.addListener('MILO_AI_SETTINGS', () => getAISettings())
message.addListener('MILO_GET_PREFERENCES', () => getPreferences())
message.addListener('MILO_SAVE_PREFERENCES', async (msg, sender) => {
  try {
    if (!sender.url || !sender.url.startsWith(browser.runtime.getURL('')))
      throw new Error('只能在 Milo 设置页修改偏好')
    return { preferences: await savePreferences(msg.payload) }
  } catch (error) {
    return { error: error.message }
  }
})
message.addListener('MILO_TRANSLATE_TEXT', async (msg, sender) => {
  try {
    return {
      text: await withSession(msg.payload.sessionId, sender, signal =>
        translateGeneralText(
          msg.payload.text,
          msg.payload.target,
          signal,
          msg.payload.source
        )
      )
    }
  } catch (error) {
    return { error: error.message }
  }
})
message.addListener('MILO_SAVE_AI_SETTINGS', async (msg, sender) => {
  try {
    if (!sender.url || !sender.url.startsWith(browser.runtime.getURL('')))
      throw new Error('只能在 Milo 设置中修改 AI 服务')
    return await saveAISettings(msg.payload)
  } catch (error) {
    return { ...(await getAISettings()), error: error.message }
  }
})
message.addListener('MILO_TEST_AI_CONNECTION', async (_msg, sender) => {
  try {
    if (!sender.url || !sender.url.startsWith(browser.runtime.getURL('')))
      throw new Error('只能在 Milo 设置中测试连接')
    return await testAIConnection()
  } catch (error) {
    return { error: error.message }
  }
})
message.addListener('MILO_SET_API_KEY', async (msg, sender) => {
  try {
    if (!sender.url || !sender.url.startsWith(browser.runtime.getURL('')))
      throw new Error('只能在 Milo 设置中修改密钥')
    return await saveAPIKey(msg.payload.apiKey)
  } catch (error) {
    return { ...(await getAISettings()), error: error.message }
  }
})
message.addListener('MILO_TRANSLATE_WORD', async (msg, sender) => {
  try {
    return {
      result: await withSession(msg.payload.sessionId, sender, signal =>
        translateWordWithAI(msg.payload.text, signal, msg.payload.context)
      )
    }
  } catch (error) {
    return { error: error.message }
  }
})
message.addListener('MILO_TRANSLATE_PARAGRAPHS', async (msg, sender) => {
  try {
    return {
      translations: await withSession(msg.payload.sessionId, sender, signal =>
        translateParagraphsWithAI(msg.payload.items, signal)
      )
    }
  } catch (error) {
    return { error: error.message }
  }
})
message.addListener('MILO_TRANSLATE_INPUT', async (msg, sender) => {
  try {
    return {
      text: await withSession(msg.payload.sessionId, sender, signal =>
        translateInputWithAI(msg.payload.text, signal)
      )
    }
  } catch (error) {
    return { error: error.message }
  }
})
message.addListener('MILO_CANCEL_TRANSLATION', (msg, sender) => {
  const key = sessionKey(msg.payload.sessionId, sender)
  const session = sessions.get(key)
  if (session) {
    session.controller.abort()
    sessions.delete(key)
  }
  return Promise.resolve(!!session)
})
message.addListener('MILO_CLEAR_TRANSLATION_CACHE', async (_msg, sender) => {
  try {
    if (!sender.url || !sender.url.startsWith(browser.runtime.getURL('')))
      throw new Error('只能在 Milo 设置中清除缓存')
    return await clearTranslationCache()
  } catch (error) {
    return { error: error.message }
  }
})
message.addListener('MILO_TRANSLATE_ACTIVE_PAGE', async () => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tabs[0] || tabs[0].id == null) throw new Error('未找到当前网页')
  return message.send(tabs[0].id, { type: 'MILO_TOGGLE_PAGE_TRANSLATION' })
})

message.addListener('MILO_TRANSLATE_IMAGE', async (msg, sender) => {
  try {
    if (!sender.url || !sender.url.startsWith(browser.runtime.getURL('')))
      throw new Error('请在 Milo 图像工具中使用 OCR')
    return {
      result: await withSession(msg.payload.sessionId, sender, signal =>
        translateImage(msg.payload.dataURL, msg.payload.provider, signal)
      )
    }
  } catch (error) {
    return { error: error.message }
  }
})
message.addListener('MILO_TRANSCRIBE_AUDIO', async (msg, sender) => {
  try {
    if (!sender.url || !sender.url.startsWith(browser.runtime.getURL('')))
      throw new Error('请在 Milo 媒体工具中转录音频')
    return {
      text: await withSession(msg.payload.sessionId, sender, signal =>
        transcribeAudio(msg.payload.dataURL, signal)
      )
    }
  } catch (error) {
    return { error: error.message }
  }
})
