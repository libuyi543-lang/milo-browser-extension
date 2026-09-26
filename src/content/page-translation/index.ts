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
  insertTranslation,
  ReadingParagraph,
  splitParagraph
} from './paragraphs'
import { collectReadingParagraphs } from './scope'

type Translate = (
  items: readonly ParagraphItem[],
  sessionId?: string
) => Promise<readonly ParagraphItem[]>
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
  private sessionId = ''
  private cancel: (sessionId: string) => void

  private translate: Translate
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
    this.paragraphs = collectReadingParagraphs(document.body, this.hostname)
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
    this.jobs = []
    this.parts = this.paragraphs.map((paragraph, index) => {
      const chunks = splitParagraph(paragraph.text)
      chunks.forEach((text, part) =>
        this.jobs.push({ id: `${index}:${part}`, text, paragraph: index, part })
      )
      return Array(chunks.length).fill('')
    })
    if (!this.jobs.length) {
      this.showStatus('没有找到可翻译的英文正文', false)
      return
    }
    this.run(this.generation)
  }

  clear() {
    if (this.running && this.sessionId && isExtensionContextValid())
      this.cancel(this.sessionId)
    this.generation += 1
    this.active = false
    this.running = false
    this.cursor = 0
    this.inserted.forEach(node => node.remove())
    this.inserted = []
    if (this.status) this.status.remove()
    this.status = null
    this.paragraphs = []
    this.jobs = []
    this.parts = []
  }

  private showStatus(text: string, retry: boolean) {
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
          index < this.jobs.length && batch.length < 8;
          index += 1
        ) {
          const job = this.jobs[index]
          if (length + job.text.length > 6000 && batch.length) break
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
          }
        }
        this.cursor += batch.length
      }
      if (version === this.generation) {
        this.running = false
        this.showStatus(`已翻译 ${this.inserted.length} 段`, false)
      }
    } catch (error) {
      if (version === this.generation) {
        this.running = false
        this.showStatus(error.message || '翻译失败，请重试', true)
      }
    }
  }
}

export function setupPageTranslation(onTrigger: () => void) {
  const controller = new PageTranslation()
  const trigger = () => {
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
    event.preventDefault()
    event.stopImmediatePropagation()
    const selection = window.getSelection()
    if (selection) selection.removeAllRanges()
    trigger()
  }
  const onMessage = (_msg: Message) => {
    trigger()
    return Promise.resolve(true)
  }
  window.addEventListener('keydown', onKey, true)
  message.addListener('MILO_TOGGLE_PAGE_TRANSLATION', onMessage)
  return () => {
    controller.clear()
    window.removeEventListener('keydown', onKey, true)
    message.removeListener(onMessage)
  }
}
