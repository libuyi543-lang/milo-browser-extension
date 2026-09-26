import { AppConfig } from '@/app-config'
import { newSelectionWord, isEscapeKey, whenKeyPressed } from './helper'
import { createSelectTextStream } from './select-text'
import { postMessageHandler, sendEmptyMessage, sendMessage } from './message'
import { message } from '@/_helpers/browser-api'
import {
  onContextInvalidated,
  runSelectionTask,
  isExtensionContextValid
} from '@/_helpers/extension-lifecycle'

// The mature selection stream runs in every frame; only the top content script
// renders the popup. Guard against duplicate extension injection.
if (!window.__MILO_SELECTION_LOADED__) {
  window.__MILO_SELECTION_LOADED__ = true

  const config = {
    touchMode: false,
    noTypeField: true,
    doubleClickDelay: 400,
    language: {
      english: true,
      chinese: false,
      japanese: false,
      korean: false,
      french: false,
      spanish: false,
      deutsch: false,
      others: false,
      matchAll: false
    },
    panelMode: {
      direct: true,
      double: false,
      holding: { alt: false, shift: false, ctrl: false, meta: false }
    }
  } as AppConfig

  window.addEventListener('message', postMessageHandler)

  const escapeSubscription = whenKeyPressed(isEscapeKey).subscribe(() => {
    runSelectionTask(() => message.self.send({ type: 'ESCAPE_KEY' }))
  })

  const selectionSubscription = createSelectTextStream(config).subscribe(
    result => {
      runSelectionTask(async () => {
        if (result.word) {
          const word = await newSelectionWord(result.word)
          if (!isExtensionContextValid()) return
          await sendMessage({
            ...result,
            dbClick: false,
            altKey: false,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false,
            self: false,
            instant: false,
            force: false,
            word
          })
        } else {
          await sendEmptyMessage(result.self)
        }
      })
    }
  )

  onContextInvalidated(() => {
    escapeSubscription.unsubscribe()
    selectionSubscription.unsubscribe()
    window.removeEventListener('message', postMessageHandler)
  })
}
