import React, { useEffect, useRef, useState } from 'react'
import { message } from '@/_helpers/browser-api'
import { translateText } from '@/services/translation/general'
import { cancelTranslation } from '@/services/translation/cancel'
import { splitParagraph } from '@/content/page-translation/paragraphs'
import { download } from './documents'
export const ZoteroTool = () => {
  const [items, setItems] = useState<Array<{ key: string; title: string }>>([])
  const [source, setSource] = useState('')
  const [translated, setTranslated] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const session = useRef('')
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current++
      cancelTranslation(session.current).catch(() => undefined)
    },
    []
  )
  return (
    <section>
      <h2>Zotero 文献文字</h2>
      <p>
        通过本机 localhost:23119 的只读 API 读取已索引附件文字。先在 Zotero 设置
        → 高级开启“允许本机其他应用通信”。不修改 Zotero
        库；点击翻译后文字才发送给当前服务。完整原 PDF 可从文档工具导入。
      </p>
      <button
        onClick={async () => {
          setBusy(true)
          try {
            const result = await message.send<'MILO_ZOTERO'>({
              type: 'MILO_ZOTERO',
              payload: { action: 'list' }
            })
            if (result.error) throw new Error(result.error)
            setItems(result.items || [])
            setStatus('已连接本机 Zotero')
          } catch (error) {
            setStatus(error.message)
          } finally {
            setBusy(false)
          }
        }}
        disabled={busy}
      >
        连接本机 Zotero
      </button>
      <div className="actions">
        {items.map(item => (
          <button
            className="secondary"
            key={item.key}
            disabled={busy}
            onClick={async () => {
              try {
                const result = await message.send<'MILO_ZOTERO'>({
                  type: 'MILO_ZOTERO',
                  payload: { action: 'read', key: item.key }
                })
                if (result.error) throw new Error(result.error)
                setSource(result.content || '')
                setTranslated('')
                setStatus(item.title)
              } catch (error) {
                setStatus(error.message)
              }
            }}
          >
            {item.title}
          </button>
        ))}
      </div>
      <div className="two-columns">
        <textarea rows={14} value={source} readOnly />
        <textarea rows={14} value={translated} readOnly />
      </div>
      <div className="actions">
        <button
          disabled={busy || !source}
          onClick={async () => {
            const current = ++generation.current
            const id = `zotero_${Date.now()}`
            session.current = id
            setBusy(true)
            try {
              const result: string[] = []
              const chunks = splitParagraph(source, 5000)
              for (let i = 0; i < chunks.length; i++) {
                setStatus(`翻译文献 ${i + 1}/${chunks.length} 段`)
                result.push(await translateText(chunks[i], undefined, id))
                if (current !== generation.current) break
                setTranslated(result.join('\n\n'))
              }
            } catch (error) {
              if (current === generation.current) setStatus(error.message)
            } finally {
              if (current === generation.current) setBusy(false)
            }
          }}
        >
          翻译已索引文字
        </button>
        <button
          className="secondary"
          disabled={!busy}
          onClick={() => {
            generation.current++
            cancelTranslation(session.current).catch(() => undefined)
            setBusy(false)
          }}
        >
          停止
        </button>
        <button
          className="secondary"
          disabled={!translated}
          onClick={() =>
            download(
              new Blob([source + '\n\n' + translated], {
                type: 'text/plain;charset=utf-8'
              }),
              'Milo-Zotero.txt'
            )
          }
        >
          导出对照文本
        </button>
      </div>
      <p role="status">{status}</p>
    </section>
  )
}
