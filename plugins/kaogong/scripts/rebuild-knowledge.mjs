import { readdir, readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve, basename } from 'node:path'
import { homedir } from 'node:os'
import { Mineru } from '../src/mineru.ts'
import { PDFDocument } from 'pdf-lib'

const root = resolve(import.meta.dirname, '..')
const yaml = createRequire(resolve(root, '../deepseek-harness/package.json'))('js-yaml')
const settings = yaml.load(await readFile(resolve(homedir(), '.dsh/settings.yaml'), 'utf8'))
const config = settings.kaogong?.mineru
if (!config?.token) throw new Error('Configure kaogong.mineru.token first')
const mineru = new Mineru(() => config, resolve(root, 'storage/mineru'))
const manifestPath = resolve(mineru.root(), 'rebuild-manifest.json')
await mkdir(mineru.root(), { recursive: true })
let manifest
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) }
catch (e) { if (e.code !== 'ENOENT') throw e }
async function save() {
  await writeFile(manifestPath + '.tmp', JSON.stringify(manifest, null, 2))
  await rename(manifestPath + '.tmp', manifestPath)
}
if (!manifest) {
  manifest = { version: 1, createdAt: new Date().toISOString(), documents: [] }
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name)
      if (entry.isDirectory()) { await scan(file); continue }
      if (!/\.pdf$/i.test(entry.name)) continue
      const bytes = await readFile(file)
      const fingerprint = createHash('sha256').update(bytes).digest('hex')
      const pdf = await PDFDocument.load(bytes)
      const pages = pdf.getPageCount()
      const subject = /资料/.test(file) ? '行测-资料分析' : /数量/.test(file) ? '行测-数量关系' : '行测-判断推理'
      const kind = /答案|解析/.test(entry.name) ? '真题解析' : file.includes('讲义') ? '讲义' : '其他'
      const jobs = []
      for (let start = 1; start <= pages; start += 100) jobs.push({ pages: `${start}-${Math.min(start + 99, pages)}`, state: 'new' })
      manifest.documents.push({ file, fingerprint, pages, subject, kind, jobs })
    }
  }
  await scan(resolve(root, '讲义'))
  await scan(resolve(root, '题目'))
  await save()
}
console.log(JSON.stringify({ documents: manifest.documents.length, pages: manifest.documents.reduce((n, d) => n + d.pages, 0), jobs: manifest.documents.reduce((n, d) => n + d.jobs.length, 0) }))
if (process.argv.includes('--plan')) process.exit(0)
// One writer and two in-flight cloud jobs keep manifest updates ordered.
const jobs = manifest.documents.flatMap(doc => doc.jobs.map(job => ({ doc, job })))
if (process.argv.includes('--retry-failed')) {
  for (const { job } of jobs) if (job.state === 'failed') { job.state = job.id ? 'submitted' : 'new'; job.failures = 0; delete job.error }
  await save()
}
let cachedSource, cachedPdf
async function uploadFile(doc, job) {
  const [start, end] = job.pages.split('-').map(Number)
  if (start === 1 && end === doc.pages) return { file: doc.file, pages: job.pages }
  const directory = resolve(mineru.root(), 'split', doc.fingerprint)
  const file = resolve(directory, job.pages + '.pdf')
  try { await readFile(file); return { file, pages: `1-${end - start + 1}` } }
  catch (e) { if (e.code !== 'ENOENT') throw e }
  if (cachedSource !== doc.file) {
    const bytes = await readFile(doc.file)
    if (createHash('sha256').update(bytes).digest('hex') !== doc.fingerprint) throw new Error('Source PDF changed since planning')
    cachedPdf = await PDFDocument.load(bytes)
    cachedSource = doc.file
  }
  const part = await PDFDocument.create()
  const pages = await part.copyPages(cachedPdf, Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i))
  for (const page of pages) part.addPage(page)
  await mkdir(directory, { recursive: true })
  await writeFile(file, await part.save())
  return { file, pages: `1-${pages.length}` }
}
const deadline = Date.now() + 90 * 60 * 1000
while (Date.now() < deadline) {
  const active = jobs.filter(x => x.job.id && !['done', 'failed'].includes(x.job.state))
  for (const item of active) {
    try {
      const result = await mineru.collect(item.job.id)
      item.job.state = result.state
      if (result.content !== undefined) {
        item.job.characters = result.content.length
        item.job.images = (result.content.match(/!\[/g) || []).length
        console.log(JSON.stringify({ file: basename(item.doc.file), pages: item.job.pages, state: 'done', images: item.job.images }))
      }
    } catch (e) {
      item.job.error = String(e.message).replaceAll(config.token, '[REDACTED]')
      item.job.failures = (item.job.failures || 0) + 1
      if (item.job.failures >= 3) item.job.state = 'failed'
    }
    await save()
  }
  let inFlight = jobs.filter(x => x.job.id && !['done', 'failed'].includes(x.job.state)).length
  for (const item of jobs.filter(x => x.job.state === 'new')) {
    if (inFlight >= 2) break
    try {
      const upload = await uploadFile(item.doc, item.job)
      const result = await mineru.start(upload.file, item.doc.subject, upload.pages)
      Object.assign(item.job, { id: result.id, state: 'submitted', uploadPages: upload.pages })
      const jobFile = resolve(mineru.jobDir(result.id), 'job.json')
      const stored = JSON.parse(await readFile(jobFile, 'utf8'))
      await writeFile(jobFile, JSON.stringify({ ...stored, source: item.doc.file, title: basename(item.doc.file), pages: item.job.pages }, null, 2))
      inFlight++
      console.log(JSON.stringify({ file: basename(item.doc.file), pages: item.job.pages, state: 'submitted' }))
    } catch (e) {
      item.job.state = 'failed'
      item.job.error = String(e.message).replaceAll(config.token, '[REDACTED]')
      console.log(JSON.stringify({ file: basename(item.doc.file), state: 'failed', error: item.job.error }))
    }
    await save()
  }
  if (!jobs.some(x => !['done', 'failed'].includes(x.job.state))) break
  await new Promise(r => setTimeout(r, 15000))
}
console.log(JSON.stringify({ done: jobs.filter(x => x.job.state === 'done').length, failed: jobs.filter(x => x.job.state === 'failed').length, remaining: jobs.filter(x => !['done', 'failed'].includes(x.job.state)).length }))
