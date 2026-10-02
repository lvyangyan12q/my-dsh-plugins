import { readFile, stat } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
const root = resolve(import.meta.dirname, '../storage/mineru')
const manifest = JSON.parse(await readFile(resolve(root, 'rebuild-manifest.json'), 'utf8'))
const rows = []
let missing = 0
let pageMismatches = 0
for (const doc of manifest.documents) {
  let pages = 0, images = 0, tables = 0
  for (const job of doc.jobs) {
    if (job.state !== 'done') continue
    const [start, end] = job.pages.split('-').map(Number)
    const layout = JSON.parse(await readFile(resolve(root, job.id, 'assets/layout.json'), 'utf8'))
    if (layout.pdf_info?.length !== end - start + 1) pageMismatches++
    pages += end - start + 1
    const content = await readFile(resolve(root, job.id, 'knowledge.md'), 'utf8')
    tables += (content.match(/<table\b/g) || []).length
    for (const match of content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      const url = new URL(match[1], 'http://localhost')
      const asset = url.searchParams.get('asset')
      if (url.pathname !== '/api/kaogong/document-image' || url.searchParams.get('id') !== job.id || !asset) throw new Error('Unexpected image reference')
      try { const info = await stat(resolve(root, job.id, 'assets', asset)); if (!info.isFile() || !info.size) throw new Error('Empty image') }
      catch { missing++ }
      images++
    }
  }
  rows.push({ file: basename(doc.file), pages, totalPages: doc.pages, images, tables })
}
console.log(JSON.stringify({ documents: rows, missing, pageMismatches, completedPages: rows.reduce((n, x) => n + x.pages, 0), images: rows.reduce((n, x) => n + x.images, 0), tables: rows.reduce((n, x) => n + x.tables, 0) }, null, 2))
if (missing || pageMismatches) process.exitCode = 1
