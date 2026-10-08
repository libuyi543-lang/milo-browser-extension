import { ImageTranslation, VisionProvider } from '@/models/MediaTranslation'
import { Word, DBArea } from '@/_helpers/record-manager'
import {
  MiloWord,
  MiloWordInput,
  MiloWordStatus,
  SavedWordEntry
} from '@/models/MiloWord'
import { DictID } from '@/app-config'
import { DictSearchResult } from '@/components/dictionaries/helpers'
import { OpenUrlOptions } from '@/_helpers/browser-api'
import { TranslationResult } from '@/services/translation/TranslationProvider'
import { AISettings, AISettingsInput } from '@/models/AIProvider'
import {
  FloatingButtonAction,
  LanguageCode,
  TranslationPreferences
} from '@/models/TranslationPreferences'

type MessageConfigType<
  T extends {
    [type in string]: { [key in 'payload' | 'response']?: any }
  }
> = T

export type MessageConfig = MessageConfigType<{
  MILO_ZOTERO: {
    payload: { action: 'list' | 'read'; key?: string }
    response: {
      items?: Array<{ key: string; title: string }>
      content?: string
      error?: string
    }
  }
  MILO_GOOGLE_DOCS_EXPORT: { response: boolean }
  MILO_DELIVER_DOCUMENT: {
    payload: { name: string; base64: string }
    response: boolean
  }
  MILO_AUDIO_STREAM: {
    payload: { token: string }
    response: { streamId?: string; tabId?: number; error?: string }
  }
  MILO_AUDIO_CAPTION: {
    payload: { source: string; translation: string }
    response: boolean
  }
  MILO_BEGIN_AREA: { response: boolean }
  MILO_CAPTURE_REGION: {
    payload: {
      x: number
      y: number
      width: number
      height: number
      viewportWidth: number
      viewportHeight: number
    }
    response: boolean
  }
  MILO_FETCH_IMAGE: { payload: { url: string }; response: { data: string } }
  MILO_NOTEBOOK_UPDATE: {
    payload: { action: 'delete' | 'import'; word?: string; words?: unknown }
    response: { deleted?: MiloWord; imported?: number; error?: string }
  }
  MILO_GET_PREFERENCES: { response: TranslationPreferences }
  MILO_SAVE_PREFERENCES: {
    payload: TranslationPreferences
    response: { preferences?: TranslationPreferences; error?: string }
  }
  MILO_FLOATING_BUTTON: {
    payload: FloatingButtonAction
    response: { preferences?: TranslationPreferences; error?: string }
  }
  MILO_TRANSLATE_TEXT: {
    payload: {
      text: string
      target?: LanguageCode
      sessionId?: string
      source?: LanguageCode
    }
    response: { text?: string; error?: string }
  }
  MILO_SHOW_TEXT: { payload: { text: string }; response: boolean }
  MILO_TOGGLE_SUBTITLES: { response: boolean }
  MILO_YOUTUBE_CAPTIONS: {
    /** `language: 'en'` selects the English source track for Milo's own subtitles. */
    payload: { command: 'start' | 'stop'; language?: 'en' }
    response: {
      ok: boolean
      error?: string
      retryable?: boolean
      mode?: 'native' | 'auto'
      videoId?: string
    }
  }
  MILO_TRANSLATE_IMAGE: {
    payload: { dataURL: string; provider: VisionProvider; sessionId: string }
    response: { result?: ImageTranslation; error?: string }
  }
  MILO_TRANSCRIBE_AUDIO: {
    payload: { dataURL: string; sessionId: string }
    response: { text?: string; error?: string }
  }
  MILO_TRANSLATE_WORD: {
    payload: { text: string; context?: string; sessionId?: string }
    response: { result?: TranslationResult; error?: string }
  }
  MILO_SPEAK: {
    payload: { text: string; lang: string }
    response: { audio?: string; error?: string }
  }
  MILO_TRANSLATE_INPUT: {
    payload: { text: string; sessionId: string }
    response: { text?: string; error?: string }
  }
  MILO_TRANSLATE_PARAGRAPHS: {
    payload: { items: Array<{ id: string; text: string }>; sessionId?: string }
    response: {
      translations?: Array<{ id: string; text: string }>
      error?: string
    }
  }
  MILO_AI_SETTINGS: {
    response: AISettings
  }
  MILO_OPEN_AI_SETTINGS: { response: boolean }
  MILO_SAVE_AI_SETTINGS: {
    payload: AISettingsInput
    response: AISettings & { error?: string }
  }
  MILO_TEST_AI_CONNECTION: {
    response: { ok?: boolean; error?: string }
  }
  MILO_CLEAR_TRANSLATION_CACHE: {
    response: { entries?: number; bytes?: number; error?: string }
  }
  MILO_CANCEL_TRANSLATION: {
    payload: { sessionId: string }
    response: boolean
  }
  MILO_SET_API_KEY: {
    payload: { apiKey: string }
    response: AISettings & { error?: string }
  }
  MILO_TRANSLATE_ACTIVE_PAGE: {}
  MILO_TOGGLE_PAGE_TRANSLATION: { response: boolean }
  MILO_SAVE_WORD: {
    payload: MiloWordInput
    response: MiloWord
  }

  MILO_LIST_WORDS: {
    response: MiloWord[]
  }
  MILO_WORD_INDEX: {
    response: SavedWordEntry[]
  }
  MILO_FIND_WORD: {
    payload: { word: string }
    response: MiloWord | null
  }
  MILO_WORD_STATUS: {
    payload: { word: string; status: MiloWordStatus }
    response: { word?: MiloWord; error?: string }
  }
  MILO_WORDS_SEEN: {
    payload: { words: string[] }
    response: number
  }

  /** Background → pages: a stored key the page follows was changed. */
  MILO_STORE_CHANGED: {
    payload: { key: string }
  }

  /* ------------------------------------------------ *\
     Backend - From other pages to background script
  \* ------------------------------------------------ */

  /** Open url in new tab or update existing tab */
  OPEN_URL: {
    payload: OpenUrlOptions
  }

  /** Open the source page of a dictionary */
  OPEN_DICT_SRC_PAGE: {
    payload: {
      id: DictID
      text: string
      /** Focus on the new page? */
      active?: boolean
    }
  }

  /** Get clipboard content */
  GET_CLIPBOARD: {
    response: string
  }

  SET_CLIPBOARD: {
    payload: string
  }

  /** Request backend for page info */
  PAGE_INFO: {
    response: {
      pageId: string | number
      faviconURL?: string
      pageTitle?: string
      pageURL?: string
    }
  }

  /** Request backend to fetch suggest */
  GET_SUGGESTS: {
    /** Search text */
    payload: string
    /** Response with suggest items */
    response: Array<{
      explain: string
      entry: string
    }>
  }

  GET_PDF_SNIFF_PENDING: {
    response: null | {
      action: 'open' | 'bypass'
      url: string
    }
  }

  OPEN_PDF_VIEWER_STANDALONE_IF_NEEDED: {
    payload: {
      url: string
    }
    response: boolean
  }

  FETCH_DICT_RESULT: {
    payload: {
      id: DictID
      text: string
      /** engine search function payload */
      payload: {
        isPDF: boolean
        [index: string]: any
      }
    }
    response: {
      id: DictID
      result: any
      catalog?: DictSearchResult<DictID>['catalog']
      audio?: DictSearchResult<DictID>['audio']
    }
  }

  /** call any method exported from the engine */
  DICT_ENGINE_METHOD: {
    payload: {
      id: DictID
      method: string
      args?: any[]
    }
    response: any
  }

  /** Inject dict panel to any page */
  INJECT_DICTPANEL: {}

  /* ------------------------------------------------ *\
     Backend IndexedDB: Notebook or History
  \* ------------------------------------------------ */

  /** Is a word in Notebook */
  IS_IN_NOTEBOOK: {
    payload: Word
    response: boolean
  }

  /** Save a word to Notebook or History */
  SAVE_WORD: {
    payload: {
      area: DBArea
      word: Word
    }
  }

  WORD_SAVED: {}

  DELETE_WORDS: {
    payload: {
      area: DBArea
      dates?: number[]
    }
  }

  GET_WORDS_BY_TEXT: {
    payload: {
      area: DBArea
      text: string
    }
    response: Word[]
  }

  GET_WORDS: {
    payload: {
      area: DBArea
      itemsPerPage?: number
      pageNum?: number
      filters?: { [field: string]: (string | number)[] | null | undefined }
      sortField?: string | number | (string | number)[]
      sortOrder?: 'ascend' | 'descend' | false | null
      searchText?: string
    }
    response: {
      total: number
      words: Word[]
    }
  }

  /* ------------------------------------------------ *\
     Audio Playing
  \* ------------------------------------------------ */

  PLAY_AUDIO: {
    /** url: to backend */
    payload: string
  }

  STOP_AUDIO: {}

  LAST_PLAY_AUDIO: {
    response?: null | { src: string; timestamp: number }
  }

  /* ------------------------------------------------ *\
     Text Selection
  \* ------------------------------------------------ */

  /** To dict panel */
  SELECTION: {
    payload: {
      word: Word | null
      mouseX: number
      mouseY: number
      dbClick: boolean
      altKey: boolean
      shiftKey: boolean
      ctrlKey: boolean
      metaKey: boolean
      /** inside panel? */
      self: boolean
      /** skip salad bowl and show panel directly */
      instant: boolean
      /** force panel to skip reconciling position */
      force: boolean
    }
  }

  /** From backend to active panel */
  ADD_NOTEBOOK: {
    payload: {
      /** to browser action page */
      popup: boolean
    }
    /** is received */
    response?: boolean
  }

  /** send to the current active tab for selection */
  PRELOAD_SELECTION: {
    response: Word
  }

  /** Manually emit selection */
  EMIT_SELECTION: {}

  ESCAPE_KEY: {}

  /** Ctrl/Command has been hit 3 times */
  TRIPLE_CTRL: {}

  /* ------------------------------------------------ *\
     Dict Panel
  \* ------------------------------------------------ */

  /** From dict panel when it is pinned or unpinned */
  PIN_STATE: {
    payload: boolean
  }

  /** switch to the next or previous history */
  SWITCH_HISTORY: {
    payload: 'prev' | 'next'
    /** received? */
    response: boolean
  }

  /** From other pages or frames query for active panel pin state */
  QUERY_PIN_STATE: {
    response: boolean
  }

  /** request searching */
  SEARCH_TEXT: {
    payload: Word
  }

  /** request searching text box text from other pages */
  SEARCH_TEXT_BOX: {
    /** is popup received */
    response?: boolean
  }

  /** request closing panel */
  CLOSE_PANEL: {}

  TEMP_DISABLED_STATE: {
    payload:
      | {
          op: 'get'
        }
      | {
          op: 'set'
          value: boolean
        }
    response: boolean
  }

  /** Info for brwoser action badge. From background to content. */
  GET_TAB_BADGE_INFO: {
    response: {
      active: boolean
      tempDisable: boolean
      unsupported: boolean
    }
  }

  /** Info for brwoser action badge. From content to background. */
  SEND_TAB_BADGE_INFO: {
    payload: {
      active: boolean
      tempDisable: boolean
      unsupported: boolean
    }
  }

  /* ------------------------------------------------ *\
    Quick Search Dict Panel
  \* ------------------------------------------------ */

  /** Send new words to standalone panel */
  QS_PANEL_SEARCH_TEXT: {
    payload: Word
  }

  /** Open or update Quick Search Panel */
  OPEN_QS_PANEL: {}

  CLOSE_QS_PANEL: {}

  /** query backend for standalone panel appearance */
  QUERY_QS_PANEL: {
    response: boolean
  }

  /** Fired from backend when standalone panel show or hide */
  QS_PANEL_CHANGED: {
    payload: boolean
  }

  /** Focus standalone quick search panel */
  QS_PANEL_FOCUSED: {}

  /** Switch to Sidebar */
  QS_SWITCH_SIDEBAR: {
    payload: 'left' | 'right'
  }

  /* ------------------------------------------------ *\
     Word Editor
  \* ------------------------------------------------ */

  UPDATE_WORD_EDITOR_WORD: {
    payload: {
      word: Word
      translateCtx?: boolean
    }
  }

  /* ------------------------------------------------ *\
     Context Menus
  \* ------------------------------------------------ */

  /** Manually trigger context menus click */
  CONTEXT_MENUS_CLICK: {
    payload: {
      menuItemId: string
      selectionText?: string
      linkUrl?: string
    }
  }

  /* ------------------------------------------------ *\
     Sync Services
  \* ------------------------------------------------ */

  SYNC_SERVICE_DOWNLOAD: {}

  ANKI_CONNECT_FIND_WORD: {
    /** Word Date */
    payload: number
    /** Card ID */
    response: number | undefined
  }

  ANKI_CONNECT_UPDATE_WORD: {
    payload: {
      cardId: number
      word: Word
    }
  }

  /* ------------------------------------------------ *\
    GA
  \* ------------------------------------------------ */

  /** Send analytics event to background page */
  REQUEST_GA: {
    payload: {
      name: string
      params?: {
        [key: string]: string | number | undefined
      }
    }
  }

  /* ------------------------------------------------ *\
     Third-party Scripts
  \* ------------------------------------------------ */

  YOUDAO_TRANSLATE_AJAX: {
    payload: any
    response: any
  }
}>

export type MsgType = keyof MessageConfig

// 'extends' hack to generate union
// https://www.typescriptlang.org/docs/handbook/advanced-types.html#distributive-conditional-types
export type Message<T extends MsgType = MsgType> = T extends any
  ? Readonly<
      {
        type: T
      } & ('payload' extends keyof MessageConfig[T]
        ? Pick<MessageConfig[T], Extract<'payload', keyof MessageConfig[T]>>
        : { payload?: null })
    >
  : never

export type MessageResponse<T extends MsgType> = Readonly<
  'response' extends keyof MessageConfig[T]
    ? MessageConfig[T][Extract<'response', keyof MessageConfig[T]>]
    : void
>
