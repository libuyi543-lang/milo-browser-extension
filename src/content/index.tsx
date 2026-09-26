import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { message } from '@/_helpers/browser-api'
import { Message } from '@/typings/message'
import { setupPageTranslation } from './page-translation'
import { onContextInvalidated } from '@/_helpers/extension-lifecycle'
import MiloWordPopup, {
  MiloSelection
} from '@/components/MiloWordPopup/MiloWordPopup'
import { MiloInputPopup } from '@/components/MiloInputPopup'
import { InputSelection } from './input-translation/selection'
import { setupTripleSpaceTranslation } from './input-translation/shortcut'

function isEnglishWord(value: string): boolean {
  return value.length <= 80 && /^[a-z][a-z'-]*$/i.test(value)
}

const App = () => {
  const [selection, setSelection] = useState<MiloSelection | null>(null)
  const [inputSelection, setInputSelection] = useState<InputSelection | null>(
    null
  )

  useEffect(() => {
    const cleanupInputSelection = setupTripleSpaceTranslation(value => {
      setInputSelection(value)
      if (value) setSelection(null)
    })
    const cleanupPageTranslation = setupPageTranslation(() => {
      setSelection(null)
      setInputSelection(null)
    })
    const onSelection = (messageValue: Message<'SELECTION'>) => {
      const { word, self, mouseX, mouseY } = messageValue.payload
      if (self) return
      const text =
        word &&
        word.text
          .trim()
          .replace(/^[“”"‘’.,;:!?()[\]{}]+|[“”"‘’.,;:!?()[\]{}]+$/g, '')
      if (word && text && isEnglishWord(text)) setInputSelection(null)
      setSelection(
        word && text && isEnglishWord(text)
          ? { word: { ...word, text }, x: mouseX, y: mouseY }
          : null
      )
    }
    const subscription = message.self
      .createStream('SELECTION')
      .subscribe(onSelection)
    const escapeSubscription = message.self
      .createStream('ESCAPE_KEY')
      .subscribe(() => {
        setSelection(null)
        setInputSelection(null)
      })
    const stop = () => {
      setSelection(null)
      setInputSelection(null)
      cleanupPageTranslation()
      cleanupInputSelection()
      subscription.unsubscribe()
      escapeSubscription.unsubscribe()
    }
    const unregisterInvalidation = onContextInvalidated(() => {
      stop()
      if (!document.getElementById('milo-refresh-notice')) {
        const notice = document.createElement('div')
        notice.id = 'milo-refresh-notice'
        notice.className = 'milo-external'
        notice.setAttribute('role', 'status')
        notice.textContent = 'Milo 已更新，请刷新此页后继续使用。'
        Object.assign(notice.style, {
          all: 'initial',
          position: 'fixed',
          right: '18px',
          bottom: '18px',
          zIndex: '2147483647',
          padding: '10px 14px',
          background: '#fbfaf6',
          color: '#344b3c',
          borderRadius: '12px',
          boxShadow: '0 4px 20px #0002',
          font: '13px/1.6 -apple-system, sans-serif'
        })
        document.documentElement.appendChild(notice)
      }
    })
    return () => {
      unregisterInvalidation()
      stop()
    }
  }, [])

  return (
    <>
      <MiloWordPopup selection={selection} onClose={() => setSelection(null)} />
      <MiloInputPopup
        selection={inputSelection}
        onClose={() => setInputSelection(null)}
      />
    </>
  )
}

// Only the top frame renders the panel. The selection script still runs in all frames.
if (window.parent === window && !window.__MILO_PANEL_LOADED__) {
  window.__MILO_PANEL_LOADED__ = true
  ReactDOM.render(<App />, document.createElement('div'))
}
