import { message } from '@/_helpers/browser-api'
import { Message } from '@/typings/message'
import {
  invalidateExtensionContext,
  isExtensionContextValid
} from '@/_helpers/extension-lifecycle'
import {
  ParagraphItem,
  translateParagraphs,
  cancelPageTranslation
} from '@/services/translation/paragraphs'
import {
  MAX_PARAGRAPH_CHARS,
  MAX_PARAGRAPHS
} from '@/services/translation/limits'
import {
  insertTranslation,
  ReadingParagraph,
  splitParagraph
} from './paragraphs'
import { collectReadingParagraphs } from './scope'
import {
  DEFAULT_PREFERENCES,
  TranslationPreferences,
  siteMatches
} from '@/models/TranslationPreferences'
import { getPreferences } from '@/services/translation/general'

type Translate = (
  items: readonly ParagraphItem[],
  sessionId?: string
) => Promise<readonly ParagraphItem[]>
export interface PageTranslationState {
  active: boolean
  running: boolean
  failed: boolean
}
interface Job extends ParagraphItem {
  paragraph: number
  part: number
}

export class PageTranslation {
  private active = false
  private generation = 0
  private running = false
  private cursor = 0
  private paragraphs: ReadingParagraph[] = []
  private jobs: Job[] = []
  private parts: string[][] = []
  private inserted: HTMLElement[] = []
  private status: HTMLElement | null = null
  private statusTimer: number | undefined
  private sessionId = ''
  private observer: MutationObserver | null = null
  private dynamicTimer: number | undefined
  private seen = new WeakMap<HTMLElement, string>()
  private hidden: Array<{
    element: HTMLElement
    display: string
    hadStyle: boolean
  }> = []

  private hiddenText = new Map<Text, string>()
  private preferences = { ...DEFAULT_PREFERENCES }
  private cancel: (sessionId: string) => void

  private translate: Translate
  private listener: ((state: PageTranslationState) => void) | undefined
  constructor(
    translate: Translate = translateParagraphs,
    private hostname = window.location.hostname,
    cancel?: (sessionId: string) => void
  ) {
    this.translate = translate
    this.cancel =
      cancel ||
      (translate === translateParagraphs
        ? id => {
            cancelPageTranslation(id).catch(() => undefined)
          }
        : () => undefined)
  }

  toggle() {
    if (this.active) {
      this.clear()
      return
    }
    this.active = true
    this.sessionId = `page_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`
    this.paragraphs = []
    this.jobs = []
    this.parts = []
    this.seen = new WeakMap()
    this.enqueue()
    if (this.preferences.dynamic) this.observe()
    if (!this.jobs.length) {
      this.showStatus('没有找到可翻译的正文', false)
      return
    }
    this.run(this.generation)
  }

  configure(preferences: TranslationPreferences) {
    this.preferences = preferences
  }

  onChange(listener: (state: PageTranslationState) => void) {
    this.listener = listener
  }

  private notify(failed: boolean) {
    if (this.listener)
      this.listener({ active: this.active, running: this.running, failed })
  }

  private enqueue() {
    const fresh = collectReadingParagraphs(
      document.body,
      this.hostname,
      this.preferences.target
    )
      .map((paragraph, index) => {
        const rect = paragraph.element.getBoundingClientRect()
        const visible = rect.bottom >= 0 && rect.top <= window.innerHeight
        return {
          paragraph,
          index,
          group: visible ? 0 : rect.top > window.innerHeight ? 1 : 2,
          distance: visible ? 0 : Math.abs(rect.top - window.innerHeight)
        }
      })
      .sort(
        (a, b) =>
          a.group - b.group || a.distance - b.distance || a.index - b.index
      )
      .map(item => item.paragraph)
    fresh.forEach(paragraph => {
      if (
        this.paragraphs.length >= 1500 ||
        this.seen.get(paragraph.element) === paragraph.text
      )
        return
      this.seen.set(paragraph.element, paragraph.text)
      const previousNodes = this.inserted.filter(
        node =>
          this.paragraphs[Number(node.dataset.miloParagraph)]?.element ===
          paragraph.element
      )
      previousNodes.forEach(node => node.remove())
      this.inserted = this.inserted.filter(
        node => !previousNodes.includes(node)
      )
      const index = this.paragraphs.length
      this.paragraphs.push(paragraph)
      const chunks = splitParagraph(paragraph.text)
      chunks.forEach((text, part) =>
        this.jobs.push({ id: `${index}:${part}`, text, paragraph: index, part })
      )
      this.parts.push(Array(chunks.length).fill(''))
    })
  }

  private observe() {
    this.observer = new MutationObserver(records => {
      const own = (node: Node) => {
        if (node instanceof Text && this.hiddenText.has(node) && !node.data)
          return true
        const element = node instanceof Element ? node : node.parentElement
        return (
          !!element &&
          !!element.closest('.milo-root,.milo-external,[data-milo-translation]')
        )
      }
      if (
        records.every(
          record =>
            own(record.target) ||
            (record.type === 'childList' &&
              [
                ...Array.from(record.addedNodes),
                ...Array.from(record.removedNodes)
              ].every(own))
        )
      )
        return
      if (this.dynamicTimer !== undefined) clearTimeout(this.dynamicTimer)
      this.dynamicTimer = window.setTimeout(() => {
        this.dynamicTimer = undefined
        if (!this.active) return
        this.enqueue()
        if (this.cursor < this.jobs.length) this.run(this.generation)
      }, 350)
    })
    this.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true
    })
  }

  clear() {
    if (this.observer) this.observer.disconnect()
    this.observer = null
    if (this.dynamicTimer !== undefined) clearTimeout(this.dynamicTimer)
    this.hidden.forEach(({ element, display, hadStyle }) => {
      if (element.style.display === 'none') element.style.display = display
      if (!hadStyle && !element.getAttribute('style'))
        element.removeAttribute('style')
      delete element.dataset.miloSourceHidden
    })
    this.hidden = []
    this.hiddenText.forEach((text, node) => {
      if (!node.data) node.data = text
    })
    this.hiddenText.clear()
    if (this.running && this.sessionId && isExtensionContextValid())
      this.cancel(this.sessionId)
    this.generation += 1
    this.active = false
    this.running = false
    this.cursor = 0
    this.inserted.forEach(node => node.remove())
    this.inserted = []
    this.removeStatus()
    this.paragraphs = []
    this.jobs = []
    this.parts = []
    this.notify(false)
  }

  private removeStatus() {
    if (this.statusTimer !== undefined) clearTimeout(this.statusTimer)
    this.statusTimer = undefined
    if (this.status) this.status.remove()
    this.status = null
  }

  /** A finished translation needs no lingering notice; errors stay visible. */
  private fadeStatus() {
    this.statusTimer = window.setTimeout(() => {
      const status = this.status
      if (!status) return
      const reduced =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) return this.removeStatus()
      status.style.transition = 'opacity .3s ease-out'
      status.style.opacity = '0'
      this.statusTimer = window.setTimeout(() => this.removeStatus(), 300)
    }, 2500)
  }

  private showStatus(text: string, retry: boolean) {
    if (this.statusTimer !== undefined) clearTimeout(this.statusTimer)
    this.statusTimer = undefined
    if (this.status) this.status.style.opacity = ''
    if (!this.status) {
      this.status = document.createElement('div')
      this.status.className = 'milo-external'
      this.status.setAttribute('role', 'status')
      Object.assign(this.status.style, {
        all: 'initial',
        position: 'fixed',
        right: '18px',
        bottom: '18px',
        zIndex: '2147483647',
        background: '#fbfaf6',
        color: '#344b3c',
        borderRadius: '12px',
        padding: '10px 14px',
        boxShadow: '0 4px 20px #0002',
        font: '13px/1.6 -apple-system, sans-serif',
        maxWidth: '360px'
      })
      document.documentElement.appendChild(this.status)
    }
    this.status.textContent = `Milo · ${text} `
    if (/API Key|配置 AI 服务/.test(text)) {
      const configure = document.createElement('button')
      configure.textContent = '配置 AI 服务'
      configure.onclick = () =>
        message.send({ type: 'MILO_OPEN_AI_SETTINGS' }).catch(() => undefined)
      this.status.appendChild(configure)
    }
    if (retry) {
      const button = document.createElement('button')
      button.textContent = '重试'
      button.onclick = () => this.run(this.generation)
      this.status.appendChild(button)
    }
    const cancel = document.createElement('button')
    cancel.textContent = this.running ? '停止' : '恢复原文'
    cancel.onclick = () => this.clear()
    Object.assign(cancel.style, {
      border: '0',
      background: 'transparent',
      color: '#5c7f6e',
      cursor: 'pointer',
      padding: '2px 5px',
      font: 'inherit'
    })
    this.status.appendChild(cancel)
    this.notify(retry)
  }

  private async run(version: number) {
    if (this.running || !this.active) return
    this.running = true
    const sessionId = this.sessionId
    try {
      while (this.cursor < this.jobs.length && version === this.generation) {
        this.showStatus(
          `正在翻译 ${this.inserted.length}/${this.paragraphs.length} 段`,
          false
        )
        const batch: Job[] = []
        let length = 0
        for (
          let index = this.cursor;
          index < this.jobs.length && batch.length < MAX_PARAGRAPHS;
          index += 1
        ) {
          const job = this.jobs[index]
          if (length + job.text.length > MAX_PARAGRAPH_CHARS && batch.length)
            break
          batch.push(job)
          length += job.text.length
        }
        const translated = await this.translate(
          batch.map(({ id, text }) => ({ id, text })),
          sessionId
        )
        if (version !== this.generation) return
        for (const job of batch) {
          const result = translated.find(item => item.id === job.id)
          if (!result || !result.text.trim())
            throw new Error('部分段落未翻译，请重试')
          this.parts[job.paragraph][job.part] = result.text
        }
        for (const index of new Set(batch.map(job => job.paragraph))) {
          if (this.parts[index].every(Boolean)) {
            const inserted = insertTranslation(
              this.paragraphs[index],
              this.parts[index].join('\n')
            )
            if (inserted) this.inserted.push(inserted)
            if (inserted) {
              inserted.dataset.miloParagraph = String(index)
              inserted.lang = this.preferences.target
              // Learning mode blurs these until hovered; the original stays readable.
              if (this.preferences.display === 'bilingual')
                inserted.dataset.miloBilingual = 'true'
              if (this.preferences.style === 'muted')
                inserted.style.opacity = '0.65'
              if (this.preferences.style === 'boxed')
                Object.assign(inserted.style, {
                  background: '#edf3e8',
                  padding: '8px 12px',
                  borderRadius: '8px'
                })
              if (this.preferences.style === 'underline')
                inserted.style.textDecoration = 'underline dotted #8ca38b'
              const source = this.paragraphs[index].element
              if (this.preferences.display === 'translation') {
                source
                  .querySelectorAll<HTMLAnchorElement>('a[href]')
                  .forEach(link => {
                    if (/^https?:\/\//.test(link.href)) {
                      const reference = document.createElement('a')
                      reference.href = link.href
                      reference.target = '_blank'
                      reference.rel = 'noopener noreferrer'
                      reference.textContent = ' ↗'
                      reference.title = link.textContent || '原文链接'
                      inserted.appendChild(reference)
                    }
                  })
                if (inserted.parentElement === source)
                  this.paragraphs[index].nodes.forEach(node => {
                    this.hiddenText.set(node, node.data)
                    node.data = ''
                  })
              }
              if (
                this.preferences.display === 'translation' &&
                inserted.parentElement !== source
              ) {
                if (!this.hidden.some(item => item.element === source))
                  this.hidden.push({
                    element: source,
                    display: source.style.display,
                    hadStyle: source.hasAttribute('style')
                  })
                source.dataset.miloSourceHidden = 'true'
                source.style.display = 'none'
              }
            }
          }
        }
        this.cursor += batch.length
      }
      if (version === this.generation) {
        this.running = false
        this.showStatus(`已翻译 ${this.inserted.length} 段`, false)
        this.fadeStatus()
      }
    } catch (error) {
      if (version === this.generation) {
        this.running = false
        this.showStatus(error.message || '翻译失败，请重试', true)
      }
    }
  }
}

export function setupPageTranslation(
  onTrigger: () => void,
  onState?: (state: PageTranslationState) => void
) {
  const controller = new PageTranslation()
  if (onState) controller.onChange(onState)
  let disposed = false
  let preferences = { ...DEFAULT_PREFERENCES }
  const ready = getPreferences()
    .then(value => {
      preferences = value
      controller.configure(value)
      if (
        !disposed &&
        !siteMatches(window.location.hostname, value.excludedSites) &&
        siteMatches(window.location.hostname, value.automaticSites)
      ) {
        onTrigger()
        controller.toggle()
      }
    })
    .catch(() => undefined)
  const trigger = async () => {
    await ready
    preferences = await getPreferences().catch(() => preferences)
    if (disposed) return
    controller.configure(preferences)
    if (siteMatches(window.location.hostname, preferences.excludedSites)) {
      controller.clear()
      return
    }
    onTrigger()
    controller.toggle()
  }
  const onKey = (event: KeyboardEvent) => {
    if (!isExtensionContextValid()) {
      invalidateExtensionContext()
      return
    }
    if (
      event.key.toLowerCase() !== 'a' ||
      !(event.metaKey || event.ctrlKey) ||
      event.altKey ||
      event.shiftKey ||
      event.repeat
    )
      return
    const editing = event
      .composedPath()
      .some(
        node =>
          node instanceof HTMLElement &&
          (node.isContentEditable ||
            !!node.closest(
              'input,textarea,select,[contenteditable]:not([contenteditable="false"]),.monaco-editor,.CodeMirror,.ace_editor'
            ))
      )
    if (editing) return
    if (siteMatches(window.location.hostname, preferences.excludedSites)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const selection = window.getSelection()
    if (selection) selection.removeAllRanges()
    trigger().catch(() => undefined)
  }
  const onMessage = (_msg: Message) => {
    return ready.then(() => {
      return disposed ? true : trigger().then(() => true)
    })
  }
  window.addEventListener('keydown', onKey, true)
  message.addListener('MILO_TOGGLE_PAGE_TRANSLATION', onMessage)
  const cleanup = () => {
    disposed = true
    controller.clear()
    window.removeEventListener('keydown', onKey, true)
    message.removeListener(onMessage)
  }
  return Object.assign(cleanup, {
    trigger: () => trigger().catch(() => undefined)
  })
}
