import React, { useEffect, useRef, useState } from 'react'
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
import { MiloTextPopup, TextSelection } from '@/components/MiloTextPopup'
import { setupHoverTranslation } from './hover-translation'
import { setupVideoSubtitles } from './video-subtitles'
import { setupAreaTranslation } from './area-translation'
import { setupGoogleDocsExport } from './google-docs'
import { setupFloatingButton } from './floating-button'
import { newWord } from '@/_helpers/record-manager'
import { createSavedWords } from './saved-words'
import { setupWordHighlight } from './word-highlight'
import { watchPreferences } from './preferences-watch'
import { setLearningMode } from './page-style'
import { siteMatches } from '@/models/TranslationPreferences'

function isEnglishWord(value: string): boolean {
  return value.length <= 80 && /^[a-z][a-z'-]*$/i.test(value)
}

const App = () => {
  const [selection, setSelection] = useState<MiloSelection | null>(null)
  const [phrase, setPhrase] = useState<TextSelection | null>(null)
  const [inputSelection, setInputSelection] = useState<InputSelection | null>(
    null
  )
  const subtitles = useRef<ReturnType<typeof setupVideoSubtitles> | null>(null)

  useEffect(() => {
    if (!selection && subtitles.current) subtitles.current.cardClosed()
  }, [selection])

  useEffect(() => {
    const hover = setupHoverTranslation()
    const saved = createSavedWords()
    const highlight = setupWordHighlight(saved)
    let learning = false
    const stopWatching = watchPreferences(preferences => {
      const excluded = siteMatches(
        window.location.hostname,
        preferences.excludedSites
      )
      learning = preferences.learningMode
      setLearningMode(learning)
      highlight.setEnabled(preferences.highlightWords && !excluded)
    })
    const cleanupSubtitles = setupVideoSubtitles(
      word => {
        setPhrase(null)
        setInputSelection(null)
        setSelection(
          word
            ? {
                word: newWord({
                  text: word.word,
                  context: word.sentence,
                  title: word.title,
                  url: word.url
                }),
                x: word.x,
                y: word.y
              }
            : null
        )
      },
      { saved, learning: () => learning }
    )
    subtitles.current = cleanupSubtitles
    const cleanupArea = setupAreaTranslation()
    const cleanupGoogleDocs = setupGoogleDocsExport()
    const cleanupInputSelection = setupTripleSpaceTranslation(value => {
      setInputSelection(value)
      if (value) {
        setSelection(null)
        setPhrase(null)
      }
    })
    const floating = setupFloatingButton(() => cleanupPageTranslation.trigger())
    const cleanupPageTranslation = setupPageTranslation(() => {
      setSelection(null)
      setInputSelection(null)
      setPhrase(null)
      hover.clear()
    }, floating.update)
    const onSelection = (messageValue: Message<'SELECTION'>) => {
      const { word, self, mouseX, mouseY } = messageValue.payload
      if (self) return
      const text =
        word &&
        word.text
          .trim()
          .replace(/^[“”"‘’.,;:!?()[\]{}]+|[“”"‘’.,;:!?()[\]{}]+$/g, '')
      if (word && text && isEnglishWord(text)) setInputSelection(null)
      setPhrase(
        word && text && !isEnglishWord(text) && text.length <= 6500
          ? { text, x: mouseX, y: mouseY }
          : null
      )
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
      setPhrase(null)
      hover.cleanup()
      stopWatching()
      highlight.cleanup()
      setLearningMode(false)
      saved.destroy()
      cleanupSubtitles()
      subtitles.current = null
      cleanupArea()
      cleanupGoogleDocs()
      cleanupPageTranslation()
      floating.cleanup()
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
    const showText = (msg: Message) => {
      setSelection(null)
      setPhrase({
        text: (msg as Message<'MILO_SHOW_TEXT'>).payload.text.slice(0, 6500),
        x: window.innerWidth / 2,
        y: 90
      })
      return Promise.resolve(true)
    }
    message.addListener('MILO_SHOW_TEXT', showText)
    return () => {
      message.removeListener('MILO_SHOW_TEXT', showText)
      unregisterInvalidation()
      stop()
    }
  }, [])

  return (
    <>
      <MiloWordPopup selection={selection} onClose={() => setSelection(null)} />
      <MiloTextPopup selection={phrase} onClose={() => setPhrase(null)} />
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
