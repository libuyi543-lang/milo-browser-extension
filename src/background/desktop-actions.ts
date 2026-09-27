import { message } from '@/_helpers/browser-api'
import { readAIConfiguration } from './ai-settings'
const native = (self as any).chrome
const openWorkspace = (fragment = '') =>
  browser.tabs.create({
    url: browser.runtime.getURL('workspace.html') + fragment
  })
const active = async () => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}
const audioStreams = new Map<
  string,
  Promise<{ streamId: string; tabId: number }>
>()
async function openAudioCapture(tab: browser.tabs.Tab) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('')
  let ready: (id: number) => void = () => undefined
  const consumer = new Promise<number>(resolve => {
    ready = resolve
  })
  const pending = consumer.then(async consumerTabId => {
    const host = new URL(tab.url || '').hostname
    if (
      /(^|\.)(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com)$/.test(
        host
      )
    )
      throw new Error('本版不包含在线会议翻译')
    if (!(await readAIConfiguration()).profiles.xiaomi.apiKey)
      throw new Error('请先在 AI 服务中配置小米 MiMo 密钥，音频识别才可使用')
    const streamId = await native.tabCapture.getMediaStreamId({
      targetTabId: tab.id,
      consumerTabId
    })
    return { streamId, tabId: tab.id! }
  })
  pending.catch(() => undefined)
  audioStreams.set(token, pending)
  const page = await openWorkspace('#live-audio:' + token)
  if (page && page.id !== undefined) ready(page.id)
  setTimeout(() => audioStreams.delete(token), 20000)
}

export function startDesktopActions() {
  if (native.contextMenus) {
    const install = () =>
      native.contextMenus.removeAll(() => {
        native.contextMenus.create({
          id: 'milo-page',
          title: 'Milo · 翻译 / 恢复正文',
          contexts: ['page']
        })
        native.contextMenus.create({
          id: 'milo-selection',
          title: 'Milo · 翻译选中的文本',
          contexts: ['selection']
        })
        native.contextMenus.create({
          id: 'milo-image',
          title: 'Milo · 翻译这张图片',
          contexts: ['image']
        })
        native.contextMenus.create({
          id: 'milo-area',
          title: 'Milo · 圈选文字区域',
          contexts: ['page', 'image']
        })
        native.contextMenus.create({
          id: 'milo-tools',
          title: 'Milo · 翻译工作台',
          contexts: ['page', 'selection']
        })
        native.contextMenus.create({
          id: 'milo-google-docs',
          title: 'Milo · 导出并翻译 Google 文档',
          contexts: ['page'],
          documentUrlPatterns: ['https://docs.google.com/document/*']
        })
        native.contextMenus.create({
          id: 'milo-audio',
          title: 'Milo · 无字幕视频音频翻译（小米 MiMo）',
          contexts: ['page', 'video']
        })
      })
    native.runtime.onInstalled.addListener(install)
    native.runtime.onStartup.addListener(install)
    native.contextMenus.onClicked.addListener((info: any, tab: any) => {
      if (!tab || tab.id === undefined) return
      if (info.menuItemId === 'milo-tools') openWorkspace()
      if (info.menuItemId === 'milo-google-docs')
        message
          .send(tab.id, { type: 'MILO_GOOGLE_DOCS_EXPORT' })
          .catch(() => undefined)
      if (info.menuItemId === 'milo-audio')
        openAudioCapture(tab).catch(() => undefined)
      if (info.menuItemId === 'milo-page')
        message
          .send(tab.id, { type: 'MILO_TOGGLE_PAGE_TRANSLATION' })
          .catch(() => undefined)
      if (info.menuItemId === 'milo-selection')
        message
          .send(tab.id, {
            type: 'MILO_SHOW_TEXT',
            payload: { text: String(info.selectionText || '').slice(0, 6500) }
          })
          .catch(() => undefined)
      if (info.menuItemId === 'milo-area')
        message.send(tab.id, { type: 'MILO_BEGIN_AREA' }).catch(() => undefined)
      if (
        info.menuItemId === 'milo-image' &&
        /^https?:\/\//.test(info.srcUrl || '')
      ) {
        browser.storage.local
          .set({ milo_pending_image: { url: info.srcUrl } })
          .then(() => openWorkspace('#images'))
          .catch(() => undefined)
      }
    })
  }
  if (native.commands)
    native.commands.onCommand.addListener(async (command: string) => {
      const tab = await active()
      if (!tab || tab.id === undefined) return
      if (command === 'open-workspace') openWorkspace()
      if (command === 'translate-page')
        message
          .send(tab.id, { type: 'MILO_TOGGLE_PAGE_TRANSLATION' })
          .catch(() => undefined)
      if (command === 'translate-area')
        message.send(tab.id, { type: 'MILO_BEGIN_AREA' }).catch(() => undefined)
    })
  message.addListener('MILO_CAPTURE_REGION', async (msg, sender) => {
    if (!sender.tab || sender.tab.id === undefined)
      throw new Error('圈选必须来自当前网页')
    const tabs = await browser.tabs.query({
      active: true,
      windowId: sender.tab.windowId
    })
    if (!tabs[0] || tabs[0].id !== sender.tab.id)
      throw new Error('请回到圈选的网页重试')
    const p = msg.payload
    if (
      !Object.values(p).every(n => Number.isFinite(n)) ||
      p.width < 10 ||
      p.height < 10 ||
      p.x < 0 ||
      p.y < 0 ||
      p.x + p.width > p.viewportWidth + 1 ||
      p.y + p.height > p.viewportHeight + 1
    )
      throw new Error('圈选范围无效')
    const data = await browser.tabs.captureVisibleTab(sender.tab.windowId, {
      format: 'png'
    })
    const bitmap = await createImageBitmap(await (await fetch(data)).blob())
    const scale = bitmap.width / p.viewportWidth
    const canvas = new OffscreenCanvas(
      Math.round(p.width * scale),
      Math.round(p.height * scale)
    )
    const context = canvas.getContext('2d')!
    context.drawImage(
      bitmap,
      p.x * scale,
      p.y * scale,
      p.width * scale,
      p.height * scale,
      0,
      0,
      canvas.width,
      canvas.height
    )
    bitmap.close()
    const bytes = new Uint8Array(
      await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()
    )
    let binary = ''
    for (let index = 0; index < bytes.length; index += 32768)
      binary += String.fromCharCode(...bytes.slice(index, index + 32768))
    await browser.storage.local.set({
      milo_pending_image: { data: 'data:image/png;base64,' + btoa(binary) }
    })
    await openWorkspace('#images')
    return true
  })
  message.addListener('MILO_FETCH_IMAGE', async (msg, sender) => {
    if (!sender.url || !sender.url.startsWith(browser.runtime.getURL('')))
      throw new Error('请在图像工具中加载图片')
    const url = new URL(msg.payload.url)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error('图片地址无效')
    const response = await fetch(url.href, { credentials: 'omit' })
    if (!response.ok) throw new Error('图片无法下载，请保存到本地后选择文件')
    const blob = await response.blob()
    if (!blob.type.startsWith('image/') || blob.size > 12 * 1024 * 1024)
      throw new Error('图片格式或大小不支持')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let index = 0; index < bytes.length; index += 32768)
      binary += String.fromCharCode(...bytes.slice(index, index + 32768))
    return { data: 'data:' + blob.type + ';base64,' + btoa(binary) }
  })
  message.addListener('MILO_AUDIO_STREAM', async (msg, sender) => {
    try {
      const token = msg.payload.token
      if (
        !sender.url ||
        !sender.url.startsWith(browser.runtime.getURL('workspace.html')) ||
        !sender.url.includes('#live-audio:' + token)
      )
        throw new Error('音频采集只能由所选工作台打开')
      const pending = audioStreams.get(token)
      if (!pending)
        throw new Error('请在视频网页右键选择 Milo 无字幕视频音频翻译')
      audioStreams.delete(token)
      return await pending
    } catch (error) {
      return { error: error.message }
    }
  })
  message.addListener('MILO_DELIVER_DOCUMENT', async (msg, sender) => {
    if (
      !sender.url ||
      new URL(sender.url).hostname !== 'docs.google.com' ||
      msg.payload.base64.length > 40 * 1024 * 1024 ||
      !/^[a-zA-Z0-9+/=]+$/.test(msg.payload.base64)
    )
      throw new Error('Google 文档数据无效')
    await browser.storage.local.set({
      milo_pending_document: {
        name: msg.payload.name.slice(0, 160),
        base64: msg.payload.base64
      }
    })
    await openWorkspace('#documents')
    return true
  })
  message.addListener('MILO_ZOTERO', async (msg, sender) => {
    try {
      if (
        !sender.url ||
        !sender.url.startsWith(browser.runtime.getURL('workspace.html'))
      )
        throw new Error('请在 Milo 文献工具中连接 Zotero')
      const key = msg.payload.key
      if (msg.payload.action === 'read' && (!key || !/^[A-Z0-9]{8}$/.test(key)))
        throw new Error('附件编号无效')
      const url =
        'http://localhost:23119/api/users/0/' +
        (msg.payload.action === 'list'
          ? 'items?itemType=attachment&format=json&limit=100'
          : 'items/' + key + '/fulltext')
      const response = await fetch(url, {
        headers: { 'Zotero-API-Version': '3' }
      })
      if (!response.ok)
        throw new Error('Zotero 本机 API 未开启，或附件尚未建立全文索引')
      const data = await response.json()
      if (msg.payload.action === 'list') {
        if (!Array.isArray(data)) throw new Error('Zotero 返回格式无效')
        return {
          items: data.map(item => ({
            key: String(item.key),
            title: String(item.data?.title || item.key)
          }))
        }
      }
      if (typeof data.content !== 'string' || data.content.length > 300000)
        throw new Error('没有可读文字或文献超过 30 万字符')
      return { content: data.content }
    } catch (error) {
      return { error: error.message || '无法连接本机 Zotero' }
    }
  })
}
