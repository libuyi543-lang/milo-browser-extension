import React, { useEffect, useMemo, useRef, useState } from 'react'
import { transcribeAudio } from '@/services/translation/media'
import { translateText } from '@/services/translation/general'
import { cancelTranslation } from '@/services/translation/cancel'
import { Cue, download, parseSubtitles, subtitleOutput } from './documents'
import { wavChunk, dataURL, cueTime } from './media-utils'
export const MediaTool = () => {
  const [cues, setCues] = useState<Cue[]>([])
  const [media, setMedia] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const generation = useRef(0)
  const session = useRef('')
  const subtitleURL = useMemo(
    () =>
      URL.createObjectURL(
        new Blob([subtitleOutput(cues, 'vtt')], { type: 'text/vtt' })
      ),
    [cues]
  )
  useEffect(() => () => URL.revokeObjectURL(subtitleURL), [subtitleURL])
  useEffect(
    () => () => {
      if (media) URL.revokeObjectURL(media)
    },
    [media]
  )
  useEffect(
    () => () => {
      generation.current++
      if (session.current)
        cancelTranslation(session.current).catch(() => undefined)
    },
    []
  )
  return (
    <section>
      <h2>字幕与本地媒体</h2>
      <p>
        导入 SRT / VTT 后翻译并双语播放。本地音频可通过 MiMo 生成分段字幕，需要
        MiMo 密钥；采用 15
        秒分段，非逐字时间对齐。视频文件只用于本地播放，不会自动上传。
      </p>
      <label>
        本地视频 / 音频（播放）
        <input
          type="file"
          accept="video/*,audio/*"
          onChange={e => {
            const file = e.target.files && e.target.files[0]
            if (file) {
              if (media) URL.revokeObjectURL(media)
              setMedia(URL.createObjectURL(file))
            }
          }}
        />
      </label>
      <label>
        字幕文件
        <input
          type="file"
          accept=".srt,.vtt"
          disabled={busy}
          onChange={async e => {
            const file = e.target.files && e.target.files[0]
            if (file)
              try {
                setCues(parseSubtitles(await file.text()))
                setStatus('字幕已载入')
              } catch (error) {
                setStatus(error.message)
              }
          }}
        />
      </label>
      <label>
        从本地音频生成字幕（WAV / MP3 / M4A 等浏览器可解码格式）
        <input
          type="file"
          accept="audio/*"
          disabled={busy}
          onChange={async e => {
            const file = e.target.files && e.target.files[0]
            if (!file) return
            if (file.size > 40 * 1024 * 1024) {
              setStatus('音频文件上限 40 MB')
              return
            }
            const current = ++generation.current
            const id = `audio_${Date.now()}`
            session.current = id
            setBusy(true)
            let context: AudioContext | null = null
            try {
              context = new AudioContext()
              const buffer = await context.decodeAudioData(
                await file.arrayBuffer()
              )
              if (buffer.duration > 1800) throw new Error('音频上限 30 分钟')
              const result: Cue[] = []
              for (let start = 0; start < buffer.duration; start += 15) {
                setStatus(
                  `识别音频 ${Math.floor(start)}/${Math.ceil(
                    buffer.duration
                  )} 秒（发送音频给小米 MiMo）`
                )
                const source = await transcribeAudio(
                  await dataURL(wavChunk(buffer, start, 15)),
                  id
                )
                if (current !== generation.current) break
                if (source) {
                  const translation = await translateText(source, undefined, id)
                  if (current !== generation.current) break
                  result.push({
                    id: String(result.length + 1),
                    timing: `${cueTime(start)} --> ${cueTime(
                      Math.min(buffer.duration, start + 15)
                    )}`,
                    source,
                    translation
                  })
                  setCues(result.slice())
                }
              }
              if (current === generation.current)
                setStatus('已生成分段字幕，可导出')
            } catch (error) {
              if (current === generation.current)
                setStatus(
                  error.message || '浏览器无法解码此媒体，请先转为 WAV/MP3'
                )
            } finally {
              if (context) context.close()
              if (current === generation.current) setBusy(false)
            }
          }}
        />
      </label>
      <div className="actions">
        <button
          disabled={busy || !cues.length}
          onClick={async () => {
            const current = ++generation.current
            const id = `cues_${Date.now()}`
            session.current = id
            setBusy(true)
            try {
              for (let index = 0; index < cues.length; index++) {
                if (cues[index].translation) continue
                setStatus(`翻译字幕 ${index + 1}/${cues.length}`)
                const result = await translateText(
                  cues[index].source,
                  undefined,
                  id
                )
                if (current !== generation.current) break
                cues[index] = { ...cues[index], translation: result }
                setCues(cues.slice())
              }
              if (current === generation.current) setStatus('字幕翻译完成')
            } catch (error) {
              if (current === generation.current) setStatus(error.message)
            } finally {
              if (current === generation.current) setBusy(false)
            }
          }}
        >
          翻译字幕
        </button>
        <button
          className="secondary"
          disabled={!busy}
          onClick={() => {
            generation.current++
            cancelTranslation(session.current).catch(() => undefined)
            setBusy(false)
            setStatus('已停止')
          }}
        >
          停止
        </button>
        <button
          className="secondary"
          disabled={!cues.length}
          onClick={() =>
            download(
              new Blob([subtitleOutput(cues, 'srt')], {
                type: 'text/plain;charset=utf-8'
              }),
              'Milo-bilingual.srt'
            )
          }
        >
          导出 SRT
        </button>
        <button
          className="secondary"
          disabled={!cues.length}
          onClick={() =>
            download(
              new Blob([subtitleOutput(cues, 'vtt')], { type: 'text/vtt' }),
              'Milo-bilingual.vtt'
            )
          }
        >
          导出 VTT
        </button>
      </div>
      <p role="status">{status}</p>
      {media && (
        <video className="local-video" src={media} controls key={media}>
          <track
            kind="subtitles"
            default
            src={subtitleURL}
            label="Milo 双语"
            srcLang="zh"
          />
        </video>
      )}
      {cues.slice(0, 500).map(cue => (
        <article key={cue.id} className="translation-row">
          <small>{cue.timing}</small>
          <p className="source">{cue.source}</p>
          <p>{cue.translation}</p>
        </article>
      ))}
    </section>
  )
}
