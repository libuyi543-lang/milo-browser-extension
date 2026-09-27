import React, { useEffect, useRef, useState } from 'react'
import { ImageTranslation, VisionProvider } from '@/models/MediaTranslation'
import { translateImage } from '@/services/translation/media'
import { message } from '@/_helpers/browser-api'
import { cancelTranslation } from '@/services/translation/cancel'
import { imageData, renderTranslatedImage } from './media-utils'
import { download } from './documents'
interface ImageItem {
  name: string
  data: string
  result?: ImageTranslation
}
export const ImageTool = () => {
  const [images, setImages] = useState<ImageItem[]>([])
  const [provider, setProvider] = useState<VisionProvider>('deepseek')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const generation = useRef(0)
  const session = useRef('')
  useEffect(() => {
    let active = true
    browser.storage.local
      .get('milo_pending_image')
      .then(async value => {
        const pending = value.milo_pending_image
        if (!pending) return
        try {
          const raw =
            pending.data ||
            (
              await message.send<'MILO_FETCH_IMAGE'>({
                type: 'MILO_FETCH_IMAGE',
                payload: { url: pending.url }
              })
            ).data
          const normalized = await imageData(await (await fetch(raw)).blob())
          if (active) setImages([{ name: '所选图片.png', data: normalized }])
        } catch (error) {
          if (active) setStatus(error.message)
        } finally {
          browser.storage.local.remove('milo_pending_image')
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
      generation.current++
      if (session.current)
        cancelTranslation(session.current).catch(() => undefined)
    }
  }, [])
  return (
    <section>
      <h2>图片、漫画与圈选 OCR</h2>
      <p>
        只在点击识别后把图片发送给所选视觉模型。识别文字、翻译并导出覆盖图；坐标或译文可手动校正。覆盖使用采样底色，不是专业
        Inpaint 修复。
      </p>
      <label>
        视觉服务
        <select
          value={provider}
          disabled={busy}
          onChange={e => setProvider(e.target.value as VisionProvider)}
        >
          <option value="deepseek">DeepSeek Flash</option>
          <option value="xiaomi">小米 MiMo V2.6 Flash</option>
          <option value="minimax">MiniMax M3</option>
        </select>
      </label>
      <p>使用相应服务已保存的密钥，视觉模型独立于文本模型。</p>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        disabled={busy}
        onChange={async e => {
          const files = Array.from(e.target.files || []).slice(0, 30)
          setBusy(true)
          try {
            const loaded: ImageItem[] = []
            for (const file of files)
              loaded.push({ name: file.name, data: await imageData(file) })
            setImages(loaded)
            setStatus(`已载入 ${loaded.length} 张图片`)
          } catch (error) {
            setStatus(error.message)
          } finally {
            setBusy(false)
          }
        }}
      />
      <div className="actions">
        <button
          disabled={busy || !images.length}
          onClick={async () => {
            const current = ++generation.current
            const id = `image_${Date.now()}`
            session.current = id
            setBusy(true)
            try {
              for (let index = 0; index < images.length; index++) {
                setStatus(`识别 / 翻译第 ${index + 1}/${images.length} 张`)
                const result = await translateImage(
                  images[index].data,
                  provider,
                  id
                )
                if (current !== generation.current) break
                images[index] = { ...images[index], result }
                setImages(images.slice())
              }
              if (current === generation.current)
                setStatus('完成，可以编辑文字区域并导出')
            } catch (error) {
              if (current === generation.current) setStatus(error.message)
            } finally {
              if (current === generation.current) setBusy(false)
            }
          }}
        >
          识别并翻译
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
      </div>
      <p role="status">{status}</p>
      {images.map((image, index) => (
        <article className="image-result" key={index}>
          <h3>{image.name}</h3>
          <img src={image.data} alt={image.name} />
          {image.result && (
            <>
              <div className="actions">
                <button
                  onClick={async () => {
                    try {
                      download(
                        await renderTranslatedImage(
                          image.data,
                          image.result!.regions
                        ),
                        image.name.replace(/\.[^.]+$/, '') + '-Milo.png'
                      )
                    } catch (error) {
                      setStatus(error.message)
                    }
                  }}
                >
                  导出译文覆盖 PNG
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      new Blob(
                        [
                          image
                            .result!.regions.map(
                              region =>
                                region.original + '\n' + region.translation
                            )
                            .join('\n\n')
                        ],
                        { type: 'text/plain' }
                      ),
                      image.name + '-Milo.txt'
                    )
                  }
                >
                  导出双语文本
                </button>
              </div>
              {!image.result.regions.length && <p>没有识别到文字。</p>}
              {image.result.regions.map((region, regionIndex) => (
                <div className="ocr-region" key={regionIndex}>
                  <p className="source">{region.original}</p>
                  <textarea
                    value={region.translation}
                    onChange={e => {
                      region.translation = e.target.value
                      setImages(images.slice())
                    }}
                  />
                  <div className="box-coordinates">
                    {['左', '上', '右', '下'].map((label, coord) => (
                      <label key={coord}>
                        {label}
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          value={region.box[coord]}
                          onChange={e => {
                            region.box[coord] = Math.max(
                              0,
                              Math.min(1000, Number(e.target.value))
                            )
                            setImages(images.slice())
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </article>
      ))}
    </section>
  )
}
