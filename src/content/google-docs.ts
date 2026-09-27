import { message } from '@/_helpers/browser-api'
export function setupGoogleDocsExport() {
  const exportDoc = async () => {
    if (window.location.hostname !== 'docs.google.com')
      throw new Error('此入口仅用于 Google Docs')
    const id = window.location.pathname.match(
      /^\/document\/d\/([a-zA-Z0-9_-]+)/
    )?.[1]
    if (!id) throw new Error('请打开 Google 文档编辑页')
    const response = await fetch(
      `https://docs.google.com/document/d/${id}/export?format=docx`,
      { credentials: 'include' }
    )
    if (!response.ok)
      throw new Error(
        '文档导出失败，请使用 Google Docs 文件菜单下载 DOCX 后导入 Milo'
      )
    const blob = await response.blob()
    if (blob.type.includes('text/html'))
      throw new Error(
        '未获取到 DOCX，请先登录 Google Docs 或使用文件菜单导出后导入'
      )
    if (blob.size > 30 * 1024 * 1024) throw new Error('文档上限 30 MB')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let base64 = ''
    for (let index = 0; index < bytes.length; index += 32768)
      base64 += String.fromCharCode(...bytes.slice(index, index + 32768))
    await message.send<'MILO_DELIVER_DOCUMENT'>({
      type: 'MILO_DELIVER_DOCUMENT',
      payload: {
        name: (document.title || 'Google-document').slice(0, 120) + '.docx',
        base64: btoa(base64)
      }
    })
    return true
  }
  message.addListener('MILO_GOOGLE_DOCS_EXPORT', exportDoc)
  return () => message.removeListener('MILO_GOOGLE_DOCS_EXPORT', exportDoc)
}
