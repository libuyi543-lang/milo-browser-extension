import { ImageRegion } from '@/models/MediaTranslation'
export async function imageData(file: Blob): Promise<string> {
  if (file.size > 12 * 1024 * 1024) throw new Error('图片文件上限 12 MB')
  const image = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
  image.close()
  const encoded = canvas.toDataURL('image/png')
  return encoded.length > 8 * 1024 * 1024
    ? canvas.toDataURL('image/jpeg', 0.85)
    : encoded
}
export async function renderTranslatedImage(
  dataURL: string,
  regions: readonly ImageRegion[]
): Promise<Blob> {
  const image = await createImageBitmap(await (await fetch(dataURL)).blob())
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, 0, 0)
  image.close()
  for (const region of regions) {
    const [l, t, r, b] = region.box
    const x = (l / 1000) * canvas.width
    const y = (t / 1000) * canvas.height
    const w = ((r - l) / 1000) * canvas.width
    const h = ((b - t) / 1000) * canvas.height
    const sample = ctx.getImageData(
      Math.max(0, Math.min(canvas.width - 1, Math.round(x))),
      Math.max(0, Math.min(canvas.height - 1, Math.round(y))),
      1,
      1
    ).data
    ctx.fillStyle = `rgb(${sample[0]},${sample[1]},${sample[2]})`
    ctx.fillRect(x, y, w, h)
    const brightness = sample[0] + sample[1] + sample[2]
    ctx.fillStyle = brightness > 380 ? '#26352b' : '#f6f8f1'
    let size = Math.max(9, Math.min(32, h * 0.7))
    let lines: string[] = []
    while (size >= 9) {
      ctx.font = `${size}px sans-serif`
      lines = []
      let line = ''
      for (const char of region.translation) {
        if (char === '\n' || ctx.measureText(line + char).width > w - 4) {
          lines.push(line)
          line = char === '\n' ? '' : char
        } else line += char
      }
      if (line) lines.push(line)
      if (lines.length * size * 1.2 <= h) break
      size -= 1
    }
    lines.forEach((line, index) => {
      if ((index + 1) * size * 1.2 <= h + 1)
        ctx.fillText(line, x + 2, y + (index + 1) * size * 1.2 - 2, w - 4)
    })
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('图像导出失败'))),
      'image/png'
    )
  )
}
export function wavChunk(
  buffer: AudioBuffer,
  start: number,
  seconds: number
): Blob {
  const rate = 16000
  const count = Math.min(
    Math.ceil(seconds * rate),
    Math.floor((buffer.duration - start) * rate)
  )
  const bytes = new ArrayBuffer(44 + count * 2)
  const view = new DataView(bytes)
  const write = (at: number, text: string) =>
    Array.from(text).forEach((char, index) =>
      view.setUint8(at + index, char.charCodeAt(0))
    )
  write(0, 'RIFF')
  view.setUint32(4, 36 + count * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, count * 2, true)
  for (let index = 0; index < count; index++) {
    let value = 0
    const at = Math.min(
      buffer.length - 1,
      Math.floor((start + index / rate) * buffer.sampleRate)
    )
    for (let channel = 0; channel < buffer.numberOfChannels; channel++)
      value += buffer.getChannelData(channel)[at] / buffer.numberOfChannels
    view.setInt16(
      44 + index * 2,
      Math.max(-1, Math.min(1, value)) * 32767,
      true
    )
  }
  return new Blob([bytes], { type: 'audio/wav' })
}
export function dataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(blob)
  })
}
export function cueTime(seconds: number) {
  const ms = Math.round(seconds * 1000)
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(
    Math.floor(ms / 60000) % 60
  ).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(
    2,
    '0'
  )},${String(ms % 1000).padStart(3, '0')}`
}
