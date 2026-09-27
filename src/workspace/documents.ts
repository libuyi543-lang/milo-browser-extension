import JSZip from 'jszip'
export type DocumentKind =
  | 'txt'
  | 'md'
  | 'html'
  | 'srt'
  | 'vtt'
  | 'epub'
  | 'docx'
  | 'pdf'
export interface Cue {
  id: string
  timing: string
  source: string
  translation?: string
}
export interface Segment {
  id: string
  source: string
  translation?: string
  page?: number
  resource?: string
  index?: number
}
export interface LoadedDocument {
  name: string
  kind: DocumentKind
  segments: Segment[]
  cues?: Cue[]
  zip?: JSZip
  pdf?: any
  pageImages?: string[]
}
export const escapeHTML = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
export function parseSubtitles(text: string): Cue[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const cues: Cue[] = []
  for (const block of normalized.split(/\n\s*\n/)) {
    const lines = block.split('\n')
    const index = lines.findIndex(line =>
      /\d{2}:\d{2}(?::\d{2})?[.,]\d{3}\s*-->\s*\d{2}:\d{2}(?::\d{2})?[.,]\d{3}/.test(
        line
      )
    )
    if (index < 0 || /^(NOTE|STYLE|REGION)/.test(lines[0])) continue
    const source = lines
      .slice(index + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .trim()
    if (source)
      cues.push({
        id: String(cues.length + 1),
        timing: lines[index].trim(),
        source
      })
  }
  if (!cues.length) throw new Error('没有找到有效的 SRT / WebVTT 字幕')
  return cues
}
export function subtitleOutput(
  cues: readonly Cue[],
  kind: 'srt' | 'vtt',
  bilingual = true
) {
  const body = cues
    .map((cue, index) => {
      const timing = cue.timing.replace(
        /\d{2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3}/g,
        value =>
          kind === 'srt'
            ? (value.split(':').length === 2 ? '00:' : '') +
              value.replace('.', ',')
            : value.replace(',', '.')
      )
      const text =
        bilingual && cue.translation
          ? cue.source + '\n' + cue.translation
          : cue.translation || cue.source
      return `${index + 1}\n${timing}\n${text}\n`
    })
    .join('\n')
  return (kind === 'vtt' ? 'WEBVTT\n\n' : '') + body
}
function plainHTML(source: string): string[] {
  const template = document.createElement('template')
  template.innerHTML = source
  template.content
    .querySelectorAll('script,style,noscript,iframe,svg,canvas')
    .forEach(node => node.remove())
  const blocks = Array.from(
    template.content.querySelectorAll('p,h1,h2,h3,h4,li,blockquote,td')
  )
  const outer = blocks.filter(
    node => !blocks.some(other => other !== node && other.contains(node))
  )
  return (outer.length
    ? outer.map(node => node.textContent || '')
    : [template.content.textContent || '']
  )
    .map(text => text.trim())
    .filter(Boolean)
}
function xml(source: string): XMLDocument {
  const parsed = new DOMParser().parseFromString(source, 'application/xml')
  if (parsed.getElementsByTagName('parsererror').length)
    throw new Error('文档 XML 结构无效')
  return parsed
}
function elements(document: XMLDocument, name: string) {
  return Array.from(document.getElementsByTagNameNS('*', name))
}
async function checkedZIP(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(new Uint8Array(buffer))
  const files = Object.values(zip.files)
  if (
    files.length > 4000 ||
    files.reduce(
      (sum, item: any) =>
        sum + ((item._data && item._data.uncompressedSize) || 0),
      0
    ) >
      80 * 1024 * 1024
  )
    throw new Error('压缩文档过大，最多解压 80 MB / 4000 文件')
  if (files.some(item => /vbaProject\.bin$/i.test(item.name)))
    throw new Error('不支持含宏的文档')
  return zip
}
function resolvePath(base: string, relative: string) {
  const parts = (
    base.slice(0, base.lastIndexOf('/') + 1) +
    decodeURIComponent(relative.split('#')[0])
  ).split('/')
  const result: string[] = []
  for (const part of parts) {
    if (part === '..') {
      if (!result.length) throw new Error('电子书路径无效')
      result.pop()
    } else if (part && part !== '.') result.push(part)
  }
  return result.join('/')
}
export async function loadDocument(file: File): Promise<LoadedDocument> {
  if (file.size > 30 * 1024 * 1024) throw new Error('文件上限 30 MB')
  const extension = file.name
    .split('.')
    .pop()!
    .toLowerCase()
  const kind = (extension === 'htm' ? 'html' : extension) as DocumentKind
  if (
    !['txt', 'md', 'html', 'srt', 'vtt', 'epub', 'docx', 'pdf'].includes(kind)
  )
    throw new Error('请选择 TXT、Markdown、HTML、SRT、VTT、ePub、DOCX 或 PDF')
  const result: LoadedDocument = { name: file.name, kind, segments: [] }
  if (kind === 'pdf') {
    const api: any = await import(
      /* webpackIgnore: true */ browser.runtime.getURL('vendor/pdfjs/pdf.mjs')
    )
    api.GlobalWorkerOptions.workerSrc = browser.runtime.getURL(
      'vendor/pdfjs/pdf.worker.mjs'
    )
    api.GlobalWorkerOptions.workerPort = new Worker(
      browser.runtime.getURL('vendor/pdfjs/pdf.worker.mjs'),
      { type: 'module' }
    )
    result.pdf = await api.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      useWasm: false,
      cMapUrl: browser.runtime.getURL('vendor/pdfjs/cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: browser.runtime.getURL(
        'vendor/pdfjs/standard_fonts/'
      )
    }).promise
    if (result.pdf.numPages > 100) {
      result.pdf.destroy()
      throw new Error('当前 PDF 上限 100 页，请先拆分')
    }
    result.pageImages = []
    for (let pageIndex = 1; pageIndex <= result.pdf.numPages; pageIndex++) {
      const page = await result.pdf.getPage(pageIndex)
      const content = await page.getTextContent()
      let line = ''
      const lines: string[] = []
      for (const item of content.items) {
        if (!item.str) continue
        line += (line ? ' ' : '') + item.str
        if (item.hasEOL) {
          lines.push(line.trim())
          line = ''
        }
      }
      if (line.trim()) lines.push(line.trim())
      const blocks = lines
        .join('\n')
        .split(/\n\s*\n/)
        .filter(Boolean)
      blocks.forEach((source, index) =>
        result.segments.push({
          id: `pdf-${pageIndex}-${index}`,
          source,
          page: pageIndex
        })
      )
      const viewport = page.getViewport({
        scale: Math.min(1.2, 1200 / page.getViewport({ scale: 1 }).width)
      })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d'), viewport })
        .promise
      result.pageImages.push(canvas.toDataURL('image/jpeg', 0.85))
      page.cleanup()
    }
    return result
  }
  if (kind === 'epub' || kind === 'docx') {
    const zip = await checkedZIP(await file.arrayBuffer())
    result.zip = zip
    if (kind === 'docx') {
      const entry = zip.file('word/document.xml')
      if (!entry) throw new Error('DOCX 缺少正文')
      const paragraphs = elements(xml(await entry.async('string')), 'p')
      paragraphs.forEach((paragraph, index) => {
        const source = Array.from(paragraph.getElementsByTagNameNS('*', 't'))
          .map(node => node.textContent || '')
          .join('')
          .trim()
        if (source) result.segments.push({ id: `docx-${index}`, index, source })
      })
    } else {
      const container = zip.file('META-INF/container.xml')
      if (!container) throw new Error('ePub 缺少 container.xml')
      const packagePath = elements(
        xml(await container.async('string')),
        'rootfile'
      )[0]?.getAttribute('full-path')
      if (!packagePath || !zip.file(packagePath))
        throw new Error('ePub 缺少目录')
      const packageXML = xml(await zip.file(packagePath)!.async('string'))
      const manifest = elements(packageXML, 'item')
      for (const spine of elements(packageXML, 'itemref')) {
        const item = manifest.find(
          node => node.getAttribute('id') === spine.getAttribute('idref')
        )
        const href = item?.getAttribute('href')
        if (!href) continue
        const resource = resolvePath(packagePath, href)
        const chapter = zip.file(resource)
        if (!chapter) continue
        const chapterXML = xml(await chapter.async('string'))
        const blocks = Array.from(
          chapterXML.querySelectorAll('p,h1,h2,h3,h4,li,blockquote')
        )
        blocks
          .filter(
            node =>
              !blocks.some(other => other !== node && other.contains(node))
          )
          .forEach((node, index) => {
            const source = node.textContent?.trim()
            if (source)
              result.segments.push({
                id: `epub-${result.segments.length}`,
                resource,
                index,
                source
              })
          })
      }
    }
  } else {
    const text = await file.text()
    if (kind === 'srt' || kind === 'vtt') {
      result.cues = parseSubtitles(text)
      result.segments = result.cues.map(cue => ({
        id: cue.id,
        source: cue.source
      }))
    } else {
      const blocks =
        kind === 'html'
          ? plainHTML(text)
          : text
              .replace(/\r\n/g, '\n')
              .split(/\n\s*\n/)
              .filter(Boolean)
      result.segments = blocks.map((source, index) => ({
        id: String(index),
        source
      }))
    }
  }
  if (!result.segments.length) throw new Error('没有找到可翻译的文字')
  if (result.segments.length > 6000) throw new Error('当前上限 6000 个段落')
  return result
}
export function bilingualHTML(document: LoadedDocument) {
  const body =
    document.kind === 'pdf'
      ? document
          .pageImages!.map(
            (image, index) =>
              `<section class="pdf-page"><img src="${image}" alt="原 PDF 第 ${index +
                1} 页"><div>${document.segments
                .filter(item => item.page === index + 1)
                .map(
                  item =>
                    `<p>${escapeHTML(item.translation || item.source)}</p>`
                )
                .join('')}</div></section>`
          )
          .join('')
      : document.segments
          .map(
            item =>
              `<section><p class="source">${escapeHTML(
                item.source
              )}</p><p>${escapeHTML(item.translation || '')}</p></section>`
          )
          .join('')
  return `<!doctype html><meta charset="utf-8"><title>${escapeHTML(
    document.name
  )} · Milo</title><style>body{font:16px/1.8 sans-serif;color:#26372a;max-width:1200px;margin:40px auto;padding:20px}section{break-inside:avoid;margin-bottom:22px}p{white-space:pre-wrap}.source{color:#7b8676}.pdf-page{display:grid;grid-template-columns:1fr 1fr;gap:25px;break-after:page}.pdf-page img{width:100%}@media print{body{margin:0;padding:0}}</style><h1>${escapeHTML(
    document.name
  )}</h1>${body}`
}
export async function exportDocument(
  document: LoadedDocument
): Promise<{ blob: Blob; name: string }> {
  const base = document.name.replace(/\.[^.]+$/, '') + '-Milo'
  if (document.cues) {
    const cues = document.cues.map(cue => ({
      ...cue,
      translation: document.segments.find(item => item.id === cue.id)
        ?.translation
    }))
    return {
      name: base + '.' + document.kind,
      blob: new Blob([subtitleOutput(cues, document.kind as 'srt' | 'vtt')], {
        type: 'text/plain;charset=utf-8'
      })
    }
  }
  if (document.zip && (document.kind === 'docx' || document.kind === 'epub')) {
    const zip = await JSZip.loadAsync(
      await document.zip.generateAsync({ type: 'uint8array' })
    )
    const resources =
      document.kind === 'docx'
        ? ['word/document.xml']
        : Array.from(new Set(document.segments.map(item => item.resource!)))
    for (const resource of resources) {
      const parsed = xml(await zip.file(resource)!.async('string'))
      const paragraphs =
        document.kind === 'docx'
          ? elements(parsed, 'p')
          : Array.from(
              parsed.querySelectorAll('p,h1,h2,h3,h4,li,blockquote')
            ).filter(
              node =>
                !Array.from(
                  parsed.querySelectorAll('p,h1,h2,h3,h4,li,blockquote')
                ).some(other => other !== node && other.contains(node))
            )
      for (const segment of document.segments.filter(
        item => document.kind === 'docx' || item.resource === resource
      )) {
        if (!segment.translation) continue
        const original = paragraphs[segment.index!]
        if (!original || !original.parentNode) continue
        let translated: Element
        if (document.kind === 'docx') {
          const ns = original.namespaceURI!
          translated = parsed.createElementNS(ns, 'w:p')
          const properties = original.getElementsByTagNameNS(ns, 'pPr')[0]
          if (properties) translated.appendChild(properties.cloneNode(true))
          const run = parsed.createElementNS(ns, 'w:r')
          const text = parsed.createElementNS(ns, 'w:t')
          text.setAttribute('xml:space', 'preserve')
          text.textContent = segment.translation
          run.appendChild(text)
          translated.appendChild(run)
        } else {
          translated = parsed.createElementNS(original.namespaceURI, 'p')
          translated.setAttribute('class', 'milo-translation')
          translated.textContent = segment.translation
        }
        if (document.kind === 'epub' && original.localName === 'li')
          original.appendChild(translated)
        else original.parentNode.insertBefore(translated, original.nextSibling)
      }
      zip.file(resource, new XMLSerializer().serializeToString(parsed))
    }
    return {
      name: base + '.' + document.kind,
      blob: await zip.generateAsync({ type: 'blob' })
    }
  }
  if (document.kind === 'txt' || document.kind === 'md')
    return {
      name: base + '.' + document.kind,
      blob: new Blob(
        [
          document.segments
            .map(item => item.source + '\n\n' + (item.translation || ''))
            .join('\n\n')
        ],
        { type: 'text/plain;charset=utf-8' }
      )
    }
  return {
    name: base + '.html',
    blob: new Blob([bilingualHTML(document)], {
      type: 'text/html;charset=utf-8'
    })
  }
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
