const fs = require('fs')
const path = require('path')
const archiver = require('archiver')

async function main() {
  const root = path.join(__dirname, '..')
  const source = path.join(root, 'build/chrome')
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'))
  for (const file of ['LICENSE', 'NOTICE.md', 'TRADEMARKS.md']) {
    if (!fs.statSync(path.join(source, file)).isFile()) throw new Error(`Missing distribution notice: ${file}`)
  }
  if (manifest.manifest_version !== 3) throw new Error('Expected a Chrome MV3 build')
  const outputDir = path.join(root, 'dist')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `Milo-Browser-Extension-v${manifest.version}.zip`)
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(source, false)
    archive.finalize()
  })
  console.log(outputPath)
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
