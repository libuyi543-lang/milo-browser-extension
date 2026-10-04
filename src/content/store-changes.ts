import { message } from '@/_helpers/browser-api'
import { Message } from '@/typings/message'

/**
 * Calls back when the background reports that `key` changed in storage.
 * Content scripts cannot listen to storage themselves (it is locked to Milo's
 * own pages), so the background relays the key name; read the new state by message.
 */
export function onStoreChange(key: string, callback: () => void): () => void {
  const listener = (msg: Message, sender: browser.runtime.MessageSender) => {
    if (msg.type !== 'MILO_STORE_CHANGED') return
    // Only the background sends these; a message from another tab has a sender.tab.
    if (sender && sender.tab) return
    if (msg.payload && msg.payload.key === key) callback()
  }
  message.addListener('MILO_STORE_CHANGED', listener)
  return () => message.removeListener('MILO_STORE_CHANGED', listener)
}
