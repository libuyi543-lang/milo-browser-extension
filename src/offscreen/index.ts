import { AppConfig } from '@/app-config'
import { Profile } from '@/app-config/profiles'
import { search } from '@/components/dictionaries/bing/engine'

// Bing's existing HTML parser runs in an offscreen document because MV3
// service workers do not have DOMParser.
const config = { langCode: 'zh-CN' } as AppConfig
const profile = ({
  dicts: {
    all: {
      bing: {
        options: {
          tense: false,
          phsym: false,
          cdef: true,
          related: false,
          sentence: 0
        }
      }
    }
  }
} as unknown) as Profile

browser.runtime.onMessage.addListener(msg => {
  if (msg && msg.type === 'MILO_BING_LOOKUP' && typeof msg.text === 'string') {
    return search(msg.text, config, profile, { isPDF: false })
  }
  if (msg && msg.type === 'MILO_OFFSCREEN_PING') {
    return Promise.resolve(true)
  }
})
