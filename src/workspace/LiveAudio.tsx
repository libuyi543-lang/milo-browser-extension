import React, { useEffect, useRef, useState } from 'react'
import { message } from '@/_helpers/browser-api'
import { transcribeAudio } from '@/services/translation/media'
import { translateText } from '@/services/translation/general'
import { cancelTranslation } from '@/services/translation/cancel'
import { Cue, download, subtitleOutput } from './documents'
import { wavChunk, dataURL, cueTime } from './media-utils'
export const LiveAudio = () => {
  const [status, setStatus] = useState('准备连接所选标签页…')
  const [cues, setCues] = useState<Cue[]>([])
  const [active, setActive] = useState(false)
  const stopRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    let processor: ScriptProcessorNode | null = null
    let sourceTab = 0
    let elapsed = 0
    let processing = false
    let pending = ''
    const queue: Array<{ buffer: AudioBuffer; start: number }> = []
    let samples: Float32Array[] = []
    let size = 0
    const stop = () => {
      stopped = true
      queue.splice(0)
      samples = []
      if (processor) processor.onaudioprocess = null
      if (stream) stream.getTracks().forEach(track => track.stop())
      if (context && context.state !== 'closed')
        context.close().catch(() => undefined)
      if (pending) cancelTranslation(pending).catch(() => undefined)
      if (sourceTab)
        message
          .send(sourceTab, {
            type: 'MILO_AUDIO_CAPTION',
            payload: { source: '', translation: '' }
          })
          .catch(() => undefined)
      setActive(false)
    }
    stopRef.current = stop
    const process = async () => {
      if (processing || stopped) return
      processing = true
      try {
        while (queue.length) {
          if (stopped) break
          const chunk = queue.shift()!
          const id = `live_audio_${Date.now()}`
          pending = id
          const source = await transcribeAudio(
            await dataURL(wavChunk(chunk.buffer, 0, chunk.buffer.duration)),
            id
          )
          if (stopped) break
          if (!source) continue
          const translation = await translateText(source, undefined, id)
          if (stopped) break
          const cue = {
            id: String(chunk.start),
            timing: `${cueTime(chunk.start)} --> ${cueTime(
              chunk.start + chunk.buffer.duration
            )}`,
            source,
            translation
          }
          setCues(value => value.concat(cue))
          message
            .send(sourceTab, {
              type: 'MILO_AUDIO_CAPTION',
              payload: { source, translation }
            })
            .catch(() => undefined)
          setStatus('正在识别标签页音频，约有 8 秒分段延迟')
        }
      } catch (error) {
        if (!stopped) {
          setStatus(error.message)
          stop()
        }
      } finally {
        processing = false
        pending = ''
      }
    }
    const token = window.location.hash.split(':')[1]
    message
      .send<'MILO_AUDIO_STREAM'>({
        type: 'MILO_AUDIO_STREAM',
        payload: { token: token || '' }
      })
      .then(async result => {
        if (stopped) return
        if (result.error || !result.streamId || !result.tabId)
          throw new Error(
            result.error || '请在视频网页右键选择 Milo 无字幕视频音频'
          )
        sourceTab = result.tabId
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'tab',
              chromeMediaSourceId: result.streamId
            }
          } as any,
          video: false
        })
        if (stopped) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        context = new AudioContext()
        await context.resume()
        if (stopped) {
          stop()
          return
        }
        const source = context.createMediaStreamSource(stream)
        source.connect(context.destination)
        processor = context.createScriptProcessor(4096, 1, 1)
        const silent = context.createGain()
        silent.gain.value = 0
        source.connect(processor)
        processor.connect(silent)
        silent.connect(context.destination)
        processor.onaudioprocess = event => {
          if (stopped || !context) return
          const slice = new Float32Array(event.inputBuffer.getChannelData(0))
          samples.push(slice)
          size += slice.length
          if (size >= context.sampleRate * 8) {
            const buffer = context.createBuffer(1, size, context.sampleRate)
            const data = buffer.getChannelData(0)
            let index = 0
            samples.forEach(sample => {
              data.set(sample, index)
              index += sample.length
            })
            let energy = 0
            for (const value of data) energy += value * value
            if (energy / data.length > 0.00001)
              queue.push({ buffer, start: elapsed })
            elapsed += buffer.duration
            samples = []
            size = 0
            if (queue.length > 2) {
              queue.shift()
              setStatus('服务处理较慢，已跳过过期音频片段')
            }
            process()
            if (elapsed >= 1800) {
              setStatus('已达到本次 30 分钟上限')
              stop()
            }
          }
        }
        setActive(true)
        setStatus(
          '正在采集所选视频标签页，音频分段将发送给小米 MiMo；停止即结束采集'
        )
      })
      .catch(error => {
        if (!stopped) {
          setStatus(error.message)
          stop()
        }
      })
    return stop
  }, [])
  return (
    <section>
      <h2>无字幕视频音频识别</h2>
      <p>
        只采集你从右键菜单选择的标签页音频；不使用麦克风。音频发送到小米
        MiMo，文字使用当前翻译服务。字幕有分段延迟，不能保证逐字时间对齐。支持可采集的普通视频，受保护内容以浏览器限制为准。
      </p>
      <div className="actions">
        <button
          disabled={!active}
          onClick={() => {
            stopRef.current()
            setStatus('已停止音频采集')
          }}
        >
          停止音频采集
        </button>
        <button
          className="secondary"
          disabled={!cues.length}
          onClick={() =>
            download(
              new Blob([subtitleOutput(cues, 'srt')], {
                type: 'text/plain;charset=utf-8'
              }),
              'Milo-video-audio.srt'
            )
          }
        >
          导出已识别字幕
        </button>
      </div>
      <p role="status">{status}</p>
      {cues.map(cue => (
        <article key={cue.id} className="translation-row">
          <p className="source">{cue.source}</p>
          <p>{cue.translation}</p>
        </article>
      ))}
    </section>
  )
}
