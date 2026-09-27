import React, { useEffect, useState } from 'react'
import { message } from '@/_helpers/browser-api'
import { listMiloWords } from '@/services/miloStorage'
import { MiloWord } from '@/models/MiloWord'
import { download } from './documents'
const cell = (value: any) => {
  let text = String(value || '')
  if (/^\s*[=+@-]/.test(text)) text = "'" + text
  return '"' + text.replace(/"/g, '""') + '"'
}
export const Notebook = () => {
  const [words, setWords] = useState<readonly MiloWord[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [deleted, setDeleted] = useState<MiloWord | null>(null)
  const refresh = () =>
    listMiloWords()
      .then(setWords)
      .catch(error => setStatus(error.message))
  useEffect(() => {
    refresh()
  }, [])
  const visible = words.filter(word =>
    (word.word + ' ' + word.meaning + ' ' + word.sentence)
      .toLowerCase()
      .includes(query.toLowerCase())
  )
  return (
    <section>
      <h2>
        单词本 <small>{words.length} 个词</small>
      </h2>
      <p>每个词保存阅读出处与遇见记录。备份不包含 API Key。</p>
      <input
        placeholder="搜索单词、释义或原句"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div className="actions">
        <button
          onClick={() =>
            download(
              new Blob([JSON.stringify({ version: 1, words }, null, 2)], {
                type: 'application/json'
              }),
              'Milo-words.json'
            )
          }
        >
          备份 JSON
        </button>
        <button
          className="secondary"
          onClick={() =>
            download(
              new Blob(
                [
                  '\uFEFF' +
                    [
                      'word,meaning,sentence,url,encounterCount',
                      ...words.map(word =>
                        [
                          word.word,
                          word.meaning,
                          word.sentence,
                          word.source.url,
                          word.encounterCount
                        ]
                          .map(cell)
                          .join(',')
                      )
                    ].join('\r\n')
                ],
                { type: 'text/csv;charset=utf-8' }
              ),
              'Milo-words.csv'
            )
          }
        >
          导出 CSV / Anki
        </button>
        <label className="file-button">
          导入备份
          <input
            type="file"
            accept=".json"
            onChange={async e => {
              const file = e.target.files && e.target.files[0]
              if (!file) return
              try {
                if (file.size > 15 * 1024 * 1024)
                  throw new Error('备份上限 15 MB')
                const value = JSON.parse(await file.text())
                const result = await message.send<'MILO_NOTEBOOK_UPDATE'>({
                  type: 'MILO_NOTEBOOK_UPDATE',
                  payload: {
                    action: 'import',
                    words: Array.isArray(value) ? value : value.words
                  }
                })
                if (result.error) throw new Error(result.error)
                setStatus(`已合并 ${result.imported} 条记录`)
                refresh()
              } catch (error) {
                setStatus(error.message)
              }
            }}
          />
        </label>
      </div>
      {deleted && (
        <button
          className="secondary"
          onClick={async () => {
            const result = await message.send<'MILO_NOTEBOOK_UPDATE'>({
              type: 'MILO_NOTEBOOK_UPDATE',
              payload: { action: 'import', words: [deleted] }
            })
            if (result.error) setStatus(result.error)
            else {
              setDeleted(null)
              refresh()
            }
          }}
        >
          撤销删除 {deleted.word}
        </button>
      )}
      <p role="status">{status}</p>
      {visible.map(word => (
        <article className="word-row" key={word.id}>
          <div className="word-line">
            <h3>{word.word}</h3>
            <span>遇见 {word.encounterCount} 次</span>
            <button
              className="link"
              onClick={() => {
                const speech = new SpeechSynthesisUtterance(word.word)
                speech.lang = 'en-US'
                speechSynthesis.cancel()
                speechSynthesis.speak(speech)
              }}
            >
              朗读
            </button>
            <button
              className="link"
              onClick={async () => {
                const result = await message.send<'MILO_NOTEBOOK_UPDATE'>({
                  type: 'MILO_NOTEBOOK_UPDATE',
                  payload: { action: 'delete', word: word.word }
                })
                if (result.error) setStatus(result.error)
                else {
                  setDeleted(result.deleted || null)
                  refresh()
                }
              }}
            >
              删除
            </button>
          </div>
          <p>{word.meaning}</p>
          <details>
            <summary>查看 {word.encounters.length} 次阅读语境</summary>
            {word.encounters
              .slice()
              .reverse()
              .map((encounter, index) => (
                <div className="encounter" key={index}>
                  <p>{encounter.sentence}</p>
                  {encounter.url && /^https?:\/\//.test(encounter.url) && (
                    <a
                      href={encounter.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {encounter.title || encounter.url}
                    </a>
                  )}
                  <small>
                    {new Date(encounter.createdAt).toLocaleString()}
                  </small>
                </div>
              ))}
          </details>
        </article>
      ))}
    </section>
  )
}
