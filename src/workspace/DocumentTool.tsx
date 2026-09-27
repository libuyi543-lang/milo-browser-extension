import React, { useEffect, useRef, useState } from 'react'
import {
  LoadedDocument,
  loadDocument,
  exportDocument,
  download,
  bilingualHTML
} from './documents'
import { translateText } from '@/services/translation/general'
import { translateImage } from '@/services/translation/media'
import { cancelTranslation } from '@/services/translation/cancel'
import { splitParagraph } from '@/content/page-translation/paragraphs'
export const DocumentTool = () => {
  const [document, setDocument] = useState<LoadedDocument | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState(0)
  const version = useRef(0)
  const session = useRef('')
  useEffect(() => {
    const pdf = document && document.pdf
    return () => {
      if (pdf) pdf.destroy()
    }
  }, [document && document.pdf])
  useEffect(() => {
    let active = true
    browser.storage.local
      .get('milo_pending_document')
      .then(async value => {
        const pending = value.milo_pending_document
        if (!pending) return
        try {
          const binary = atob(pending.base64)
          const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
          const loaded = await loadDocument(
            new File([bytes], pending.name, {
              type:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            })
          )
          if (active) {
            setDocument(loaded)
            setStatus('Google 文档已本地载入，点击开始后才发送文字给翻译服务')
          } else if (loaded.pdf) loaded.pdf.destroy()
        } catch (error) {
          if (active) setStatus(error.message)
        } finally {
          browser.storage.local.remove('milo_pending_document')
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  useEffect(
    () => () => {
      version.current++
      if (session.current)
        cancelTranslation(session.current).catch(() => undefined)
    },
    []
  )
  const stop = () => {
    version.current++
    if (session.current)
      cancelTranslation(session.current).catch(() => undefined)
    setBusy(false)
    setStatus('已停止，已完成的译文保留')
  }
  return (
    <section>
      <h2>文档与电子书</h2>
      <p>
        TXT、Markdown、HTML、DOCX、ePub、SRT、VTT、PDF。文件在浏览器本地解析，点击开始后发送文字给当前服务。PDF
        保留原页预览，译文独立对照；扫描页 OCR 需视觉服务。
      </p>
      <input
        type="file"
        accept=".txt,.md,.html,.htm,.docx,.epub,.srt,.vtt,.pdf"
        disabled={busy}
        onChange={async e => {
          const file = e.target.files && e.target.files[0]
          if (!file) return
          const current = ++version.current
          setBusy(true)
          setStatus('正在本地读取…')
          try {
            const loaded = await loadDocument(file)
            if (current === version.current) {
              setDocument(loaded)
              setPreview(0)
              setStatus(
                `已读取 ${loaded.segments.length} 段${
                  loaded.pageImages ? ` / ${loaded.pageImages.length} 页` : ''
                }`
              )
            } else if (loaded.pdf) loaded.pdf.destroy()
          } catch (error) {
            if (current === version.current) setStatus(error.message)
          } finally {
            if (current === version.current) setBusy(false)
          }
        }}
      />
      {document && (
        <>
          <div className="actions">
            <button
              disabled={busy || !document.segments.length}
              onClick={async () => {
                const current = ++version.current
                const id = `document_${Date.now()}`
                session.current = id
                setBusy(true)
                try {
                  for (let i = 0; i < document.segments.length; i++) {
                    if (current !== version.current) break
                    const segment = document.segments[i]
                    if (segment.translation) continue
                    setStatus(
                      `正在翻译 ${i + 1}/${document.segments.length} 段`
                    )
                    const translated: string[] = []
                    for (const text of splitParagraph(segment.source, 5000)) {
                      translated.push(await translateText(text, undefined, id))
                      if (current !== version.current) break
                    }
                    if (current !== version.current) break
                    segment.translation = translated.join('\n')
                    setDocument({
                      ...document,
                      segments: document.segments.slice()
                    })
                  }
                  if (current === version.current)
                    setStatus('翻译完成，可以导出')
                } catch (error) {
                  if (current === version.current) setStatus(error.message)
                } finally {
                  if (current === version.current) setBusy(false)
                }
              }}
            >
              {busy ? '处理中…' : '开始 / 继续翻译'}
            </button>
            <button className="secondary" disabled={!busy} onClick={stop}>
              停止
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                try {
                  const result = await exportDocument(document)
                  download(result.blob, result.name)
                } catch (error) {
                  setStatus(error.message)
                }
              }}
            >
              导出双语文件
            </button>
            {document.kind === 'pdf' && (
              <>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([bilingualHTML(document)], { type: 'text/html' })
                    )
                    window.open(url, '_blank')
                    setTimeout(() => URL.revokeObjectURL(url), 60000)
                  }}
                >
                  打印 / 另存为 PDF
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    const current = ++version.current
                    const id = `pdf_ocr_${Date.now()}`
                    session.current = id
                    setBusy(true)
                    try {
                      for (
                        let page = 0;
                        page < document.pageImages!.length;
                        page++
                      ) {
                        if (
                          document.segments.some(item => item.page === page + 1)
                        )
                          continue
                        setStatus(
                          `OCR 第 ${page +
                            1} 页（发送页面图像给 DeepSeek Flash）`
                        )
                        const result = await translateImage(
                          document.pageImages![page],
                          'deepseek',
                          id
                        )
                        if (current !== version.current) break
                        result.regions.forEach((region, index) =>
                          document.segments.push({
                            id: `ocr-${page}-${index}`,
                            source: region.original,
                            translation: region.translation,
                            page: page + 1
                          })
                        )
                        setDocument({
                          ...document,
                          segments: document.segments.slice()
                        })
                      }
                      if (current === version.current)
                        setStatus('扫描页识别完成')
                    } catch (error) {
                      if (current === version.current) setStatus(error.message)
                    } finally {
                      if (current === version.current) setBusy(false)
                    }
                  }}
                >
                  识别扫描页
                </button>
              </>
            )}
          </div>
          <p role="status">{status}</p>
          <h3>{document.name}</h3>
          {document.pageImages && (
            <>
              <label>
                原页预览
                <select
                  value={preview}
                  onChange={e => setPreview(Number(e.target.value))}
                >
                  {document.pageImages.map((_, index) => (
                    <option key={index} value={index}>
                      第 {index + 1} 页
                    </option>
                  ))}
                </select>
              </label>
              <div className="two-columns">
                <img
                  className="document-page"
                  src={document.pageImages[preview]}
                  alt={`原 PDF 第 ${preview + 1} 页`}
                />
                <div>
                  {document.segments
                    .filter(item => item.page === preview + 1)
                    .map(segment => (
                      <article key={segment.id} className="translation-row">
                        <p className="source">{segment.source}</p>
                        <p>{segment.translation || '尚未翻译'}</p>
                      </article>
                    ))}
                </div>
              </div>
            </>
          )}
          {!document.pageImages &&
            document.segments.slice(0, 300).map(segment => (
              <article key={segment.id} className="translation-row">
                <p className="source">{segment.source}</p>
                <p>{segment.translation || '尚未翻译'}</p>
              </article>
            ))}
          {document.segments.length > 300 && !document.pageImages && (
            <p>预览前 300 段，导出包含全部结果。</p>
          )}
        </>
      )}
      {!document && (
        <p role="status">
          {status || '请选择文件。最大 30 MB，PDF 最多 100 页。'}
        </p>
      )}
    </section>
  )
}
