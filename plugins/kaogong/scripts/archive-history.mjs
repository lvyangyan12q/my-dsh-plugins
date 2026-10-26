import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
const root = path.resolve(import.meta.dirname, '..')
const repo = path.resolve(root, '../..')
const entries = [
  'ticket04-kaogong-evidence.md',
  'application-platform-kaogong-evidence.md',
  'wayfinder/harness-upgrade/issues/02-kaogong-migration.md',
  'wayfinder/harness-upgrade/issues/04-kaogong-ownership.md',
  'wayfinder/harness-upgrade/implementation/08-kaogong-instances.md',
  'wayfinder/harness-upgrade/implementation/13-kaogong-role-scope.md',
  'wayfinder/harness-upgrade/implementation/14-kaogong-adoption-preflight.md',
  'wayfinder/harness-upgrade/implementation/15-kaogong-fresh-materials.md',
  'wayfinder/workbench-completion/implementation/10-kaogong.md',
]
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const archiveRoot = path.join(root, 'archive/docs')
const manifest = []
const originalRootIndex = process.argv.indexOf('--original-root')
const originalRoot = originalRootIndex < 0 ? undefined : process.argv[originalRootIndex + 1]
if (originalRoot && !path.isAbsolute(originalRoot)) throw Error('ABSOLUTE_ORIGINAL_ROOT_REQUIRED')
let previous = []
try { previous = JSON.parse(await fs.readFile(path.join(originalRoot ?? archiveRoot, 'index.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
await fs.mkdir(path.join(archiveRoot, 'originals'), {recursive:true})
await fs.writeFile(path.join(archiveRoot, 'originals/.gitattributes'), '* -text\n')
for (const entry of entries) {
  const source = path.join(repo, 'docs', entry)
  const destination = path.join(archiveRoot, entry)
  const original = path.join(archiveRoot, 'originals', entry)
  if ((await fs.lstat(source)).isSymbolicLink()) throw Error('Linked source')
  const sourceBytes = await fs.readFile(source)
  const redirected = sourceBytes.toString('utf8').startsWith('<!-- kaogong-history-redirect -->')
  let bytes
  try { bytes = await fs.readFile(originalRoot ? path.join(originalRoot, entry) : original) }
  catch (error) { if (error.code !== 'ENOENT') throw error; bytes = redirected ? await fs.readFile(destination) : sourceBytes }
  const old = previous.find(row => row.archive === entry)
  if (originalRoot && old && digest(bytes) !== old.sha256) throw Error('Original source bytes conflict')
  await fs.mkdir(path.dirname(original), { recursive: true })
  if (originalRoot) await fs.writeFile(original, bytes)
  try { await fs.writeFile(original, bytes, { flag: 'wx' }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  if (digest(await fs.readFile(original)) !== digest(bytes)) throw Error('Archive conflict')
  const references = []
  const rendered = bytes.toString('utf8').replace(/\]\(([^)\r\n]+)\)/g, (match, link) => {
    if (/^(?:[a-z]+:|#|\/)/i.test(link)) return match
    const [file, ...fragment] = link.split('#')
    const originalTarget = path.resolve(path.dirname(source), file)
    const sourceRelative = path.relative(path.join(repo, 'docs'), originalTarget).replaceAll('\\', '/')
    const target = entries.includes(sourceRelative) ? path.join(archiveRoot, sourceRelative) : originalTarget
    const archiveTarget = path.relative(path.dirname(destination), target).replaceAll('\\', '/') + (fragment.length ? '#' + fragment.join('#') : '')
    references.push({ link, originalTarget: path.relative(repo, originalTarget).replaceAll('\\', '/'), archiveTarget })
    return `](${archiveTarget})`
  })
  for (const reference of references) {
    const target = path.resolve(path.dirname(destination), reference.archiveTarget.split('#')[0])
    try { await fs.access(target); reference.exists = true } catch { reference.exists = false }
  }
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.writeFile(destination, rendered)
  manifest.push({ source: 'docs/' + entry, archive: entry, original: 'originals/' + entry, sha256: digest(bytes), canonicalTextSha256: digest(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'))), renderedTextSha256: digest(Buffer.from(rendered.replaceAll('\r\n', '\n'))), references })
  if (process.argv.includes('--redirect') && !redirected) {
    const link = path.relative(path.dirname(source), destination).replaceAll('\\', '/')
    await fs.writeFile(source, `<!-- kaogong-history-redirect -->\n# 考公历史文档已归档\n\n[原文（编号、状态、版本及证据保留）](${link})。\n\n本轮独立版规格和工单从 [考公文档入口](${path.relative(path.dirname(source), path.join(root, 'docs/README.md')).replaceAll('\\', '/')}) 进入。历史验收不代表独立版完成。\n`)
  }
}
await fs.writeFile(path.join(archiveRoot, 'index.json'), JSON.stringify(manifest, null, 2))
await fs.writeFile(path.join(archiveRoot, 'README.md'), '# 考公历史档案\n\n归档文档保留原编号、状态、版本和证据边界；历史验收不代表本轮独立版完成。相对链接已按每个原始目标精确重定位。`originals/` 保存逐字节原文，`index.json` 同时记录原文原始字节SHA256、规范LF文本SHA256及引用映射；可读副本文本哈希按LF计算，避免Windows检出换行造成误报。共享平台/Harness材料继续留在根docs。现行入口为 [考公文档](../../docs/README.md)。\n\n' + manifest.map(row => `- [${row.source}](${row.archive}) · [逐字节原文](${row.original})`).join('\n') + '\n')
const missing = manifest.flatMap(row => row.references.filter(ref => !ref.exists).map(ref => ({ source: row.source, ...ref })))
console.log(JSON.stringify({ archived: manifest.length, references: manifest.reduce((n, row) => n + row.references.length, 0), missingReferences: missing }))
if (missing.length) process.exitCode = 1
