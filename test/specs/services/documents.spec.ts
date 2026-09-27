import JSZip from 'jszip'
import {
  loadDocument,
  exportDocument,
  parseSubtitles,
  subtitleOutput,
  bilingualHTML
} from '@/workspace/documents'
const file = (name: string, data: string) =>
  ({ name, size: data.length, text: async () => data } as File)
const zipFile = async (name: string, zip: JSZip) => {
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return {
    name,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer
  } as File
}
const textOf = async (blob: Blob) =>
  new Promise<string>(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })
describe('local desktop document formats', () => {
  it('preserves SRT/VTT cue timing, line breaks, identifiers and bilingual output', () => {
    const cues = parseSubtitles(
      'WEBVTT\n\nintro\n00:01.000 --> 00:02.500 align:start\nHello <b>world</b>.\nSecond line.\n'
    )
    expect(cues[0].source).toBe('Hello world.\nSecond line.')
    cues[0].translation = '你好世界。'
    expect(subtitleOutput(cues, 'srt')).toContain(
      '00:00:01,000 --> 00:00:02,500 align:start'
    )
    expect(subtitleOutput(cues, 'vtt')).toContain('WEBVTT')
    expect(() => parseSubtitles('not subtitles')).toThrow()
  })
  it('loads HTML as inert text and escapes exported content', async () => {
    const loaded = await loadDocument(
      file(
        'sample.html',
        '<p>Hello &amp; world.</p><script>window.x=1</script>'
      )
    )
    expect(loaded.segments.map(item => item.source)).toEqual(['Hello & world.'])
    loaded.segments[0].translation = '<img src=x onerror=bad>'
    expect(bilingualHTML(loaded)).toContain('&lt;img')
    expect((window as any).x).toBeUndefined()
  })
  it('exports DOCX repeatedly without duplicating translated paragraphs or changing the input archive', async () => {
    const zip = new JSZip()
    zip.file(
      'word/document.xml',
      '<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>Hello world.</w:t></w:r></w:p></w:body></w:document>'
    )
    const loaded = await loadDocument(await zipFile('sample.docx', zip))
    loaded.segments[0].translation = '你好世界。'
    const first = await exportDocument(loaded)
    const second = await exportDocument(loaded)
    const read = async (blob: Blob) => {
      const buffer = await new Promise<ArrayBuffer>(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.readAsArrayBuffer(blob)
      })
      return (await JSZip.loadAsync(new Uint8Array(buffer)))
        .file('word/document.xml')!
        .async('string')
    }
    expect(await read(first.blob)).toBe(await read(second.blob))
    expect((await read(first.blob)).match(/你好世界/g)).toHaveLength(1)
    expect(
      await loaded.zip!.file('word/document.xml')!.async('string')
    ).not.toContain('你好')
  })
  it('loads ePub chapters in spine order and retains archive resources', async () => {
    const zip = new JSZip()
    zip.file(
      'META-INF/container.xml',
      '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'
    )
    zip.file(
      'OPS/book.opf',
      '<package><manifest><item id="b" href="b.xhtml"/><item id="a" href="a.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>'
    )
    zip.file(
      'OPS/a.xhtml',
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Chapter A.</p></body></html>'
    )
    zip.file(
      'OPS/b.xhtml',
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Chapter B.</p></body></html>'
    )
    zip.file('OPS/image.png', 'original-binary-placeholder')
    const loaded = await loadDocument(await zipFile('book.epub', zip))
    expect(loaded.segments.map(item => item.source)).toEqual([
      'Chapter A.',
      'Chapter B.'
    ])
    expect(await loaded.zip!.file('OPS/image.png')!.async('string')).toBe(
      'original-binary-placeholder'
    )
  })
  it('rejects unsupported or oversized files before parsing', async () => {
    await expect(loadDocument(file('sample.exe', 'x'))).rejects.toThrow(
      '请选择'
    )
    await expect(
      loadDocument({ name: 'large.txt', size: 31 * 1024 * 1024 } as File)
    ).rejects.toThrow('30 MB')
  })
})
