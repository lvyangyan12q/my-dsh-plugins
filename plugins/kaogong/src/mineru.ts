import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, stat, realpath } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, posix } from 'node:path'
import AdmZip from 'adm-zip'

export interface MineruConfig {
  token?: string
  model?: 'vlm' | 'pipeline'
  outputDir?: string
}
interface Job {
  id: string
  batchId: string
  source: string
  subject: string
  title: string
  pages: string
}
const LIMIT = 200 * 1024 * 1024

export function safeAsset(path: string): string {
  const parts = path.split('/')
  if (!path || path.includes('\\') || parts.some(p => !p || /[. ]$/.test(p) || /[:\x00-\x1f]/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
    throw new Error('Invalid document asset path')
  }
  return path
}

export function rewriteImages(markdown: string, id: string, directory: string, files: Set<string>): string {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_all, alt, source) => {
    const raw = String(source).replace(/^<|>$/g, '').replace(/^\.\//, '')
    const asset = safeAsset(posix.join(directory, safeAsset(raw)))
    if (!files.has(asset)) throw new Error('MinerU image missing from archive: ' + asset)
    return `![${alt}](/api/kaogong/document-image?id=${id}&asset=${encodeURIComponent(asset)})`
  })
}

async function boundedBody(response: Response, max = LIMIT): Promise<Buffer> {
  if (!response.ok) throw new Error('MinerU HTTP ' + response.status)
  if (!response.body) throw new Error('MinerU empty response')
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body as any) {
    size += chunk.length
    if (size > max) throw new Error('MinerU response exceeds size limit')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export class Mineru {
  private config: () => MineruConfig
  private defaultRoot: string
  private fetcher: typeof fetch
  constructor(config: () => MineruConfig, defaultRoot: string, fetcher: typeof fetch = fetch) {
    this.config = config
    this.defaultRoot = defaultRoot
    this.fetcher = fetcher
  }
  root() { return resolve(this.config().outputDir || this.defaultRoot) }
  jobDir(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid MinerU document id')
    return resolve(this.root(), id)
  }
  async api(path: string, body?: unknown) {
    const token = this.config().token?.trim() || process.env.MINERU_TOKEN?.trim()
    if (!token) throw new Error('请在设置 → kaogong → mineru 中填写 token，或设置 MINERU_TOKEN')
    const response = await this.fetcher('https://mineru.net/api/v4/' + path, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const result = JSON.parse((await boundedBody(response, 2 * 1024 * 1024)).toString())
    // Do not propagate remote messages that could contain credentials or signed URLs.
    if (result.code !== 0 || !result.data) throw new Error('MinerU API error code: ' + String(result.code))
    return result.data
  }
  async start(source: string, subject: string, pages = '1-200') {
    if (!isAbsolute(source) || extname(source).toLowerCase() !== '.pdf') throw new Error('需要 PDF 的绝对路径')
    if (!subject.trim()) throw new Error('科目不能为空')
    const selected = new Set<number>()
    if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(pages)) throw new Error('页码格式示例：4-8,12')
    for (const range of pages.split(',')) {
      const [a, b = a] = range.split('-').map(Number)
      if (a < 1 || b < a || b - a >= 200 || b > 100000) throw new Error('每次最多解析 200 页')
      for (let p = a; p <= b; p++) selected.add(p)
    }
    if (selected.size > 200) throw new Error('每次最多解析 200 页')
    const info = await stat(source)
    if (!info.isFile() || info.size > LIMIT) throw new Error('PDF 不能超过 200 MB')
    const bytes = await readFile(source)
    if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('不是有效的 PDF 文件')
    const id = randomUUID()
    const data = await this.api('file-urls/batch', {
      files: [{ name: basename(source), data_id: id, page_ranges: pages }],
      model_version: this.config().model || 'vlm', enable_table: true, enable_formula: true, language: 'ch',
    })
    const url = new URL(data.file_urls?.[0])
    if (url.protocol !== 'https:') throw new Error('Invalid MinerU upload URL')
    const job: Job = { id, batchId: data.batch_id, source, subject: subject.trim(), title: basename(source), pages }
    await mkdir(this.jobDir(id), { recursive: true })
    await writeFile(resolve(this.jobDir(id), 'job.json'), JSON.stringify(job, null, 2))
    const upload = await this.fetcher(url, { method: 'PUT', body: bytes, redirect: 'error', signal: AbortSignal.timeout(300000) })
    if (!upload.ok) throw new Error('MinerU upload failed HTTP ' + upload.status + '; document id: ' + id)
    return { id, state: 'submitted', pages }
  }
  async collect(id: string): Promise<{ state: string; job: Job; content?: string }> {
    const dir = this.jobDir(id)
    const job: Job = JSON.parse(await readFile(resolve(dir, 'job.json'), 'utf8'))
    try { return { state: 'done', job, content: await readFile(resolve(dir, 'knowledge.md'), 'utf8') } }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
    const data = await this.api('extract-results/batch/' + encodeURIComponent(job.batchId))
    const result = data.extract_result?.find((r: any) => r.data_id === id)
    if (!result) throw new Error('MinerU result does not match document')
    if (result.state !== 'done') return { state: result.state, job }
    const url = new URL(result.full_zip_url)
    if (url.protocol !== 'https:') throw new Error('Invalid MinerU result URL')
    const bytes = await boundedBody(await this.fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(300000) }))
    const entries = new AdmZip(bytes).getEntries()
    let total = 0
    const files = new Set<string>()
    for (const entry of entries) {
      if (entry.isDirectory) continue
      safeAsset(entry.entryName)
      total += entry.header.size
      if (total > 512 * 1024 * 1024 || entries.length > 10000 || files.has(entry.entryName)) throw new Error('Unsafe MinerU archive')
      files.add(entry.entryName)
    }
    const markdowns = [...files].filter(p => posix.basename(p) === 'full.md')
    if (markdowns.length !== 1) throw new Error('MinerU archive must contain one full.md')
    await mkdir(resolve(dir, 'assets'), { recursive: true })
    for (const entry of entries) {
      if (entry.isDirectory) continue
      const dest = resolve(dir, 'assets', entry.entryName)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, entry.getData())
    }
    const md = markdowns[0]
    const content = rewriteImages(await readFile(resolve(dir, 'assets', md), 'utf8'), id, posix.dirname(md), files)
    if (!content.trim()) throw new Error('MinerU returned empty Markdown')
    await writeFile(resolve(dir, 'result.zip'), bytes)
    await writeFile(resolve(dir, 'knowledge.md'), content)
    return { state: 'done', job, content }
  }
  async image(id: string, asset: string) {
    safeAsset(asset)
    if (!/\.(png|jpe?g|webp|gif)$/i.test(asset)) throw new Error('Unsupported image')
    const root = await realpath(resolve(this.jobDir(id), 'assets'))
    const target = await realpath(resolve(root, asset))
    const rel = relative(root, target)
    if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('Invalid asset')
    return readFile(target)
  }
}
