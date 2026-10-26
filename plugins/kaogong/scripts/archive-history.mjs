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
const manifest = []
for (const entry of entries) {
  const source = path.join(repo, 'docs', entry)
  const destination = path.join(root, 'archive/docs', entry)
  if ((await fs.lstat(source)).isSymbolicLink()) throw Error('Linked source')
  const sourceBytes = await fs.readFile(source)
  const redirected = sourceBytes.toString('utf8').startsWith('<!-- kaogong-history-redirect -->')
  const bytes = redirected ? await fs.readFile(destination) : sourceBytes
  await fs.mkdir(path.dirname(destination), { recursive: true })
  try { await fs.writeFile(destination, bytes, { flag: 'wx' }) }
  catch (e) { if (e.code !== 'EEXIST') throw e }
  if (digest(await fs.readFile(destination)) !== digest(bytes)) throw Error('Archive conflict')
  const references = []
  for (const match of bytes.toString('utf8').matchAll(/\]\(([^)\r\n]+)\)/g)) {
    const link = match[1]
    if (/^(?:[a-z]+:|#|\/)/i.test(link)) continue
    const originalTarget = path.resolve(path.dirname(source), link.split('#')[0])
    let exists = false
    try { await fs.access(originalTarget); exists = true } catch {}
    references.push({ link, originalTarget: path.relative(repo, originalTarget).replaceAll('\\', '/'), exists })
  }
  manifest.push({ source: 'docs/' + entry, archive: entry, sha256: digest(bytes), references })
  if (process.argv.includes('--redirect') && !redirected) {
    const link = path.relative(path.dirname(source), destination).replaceAll('\\', '/')
    await fs.writeFile(source, `<!-- kaogong-history-redirect -->\n# 考公历史文档已归档\n\n[原文（编号、状态、版本及证据保留）](${link})。\n\n本轮独立版规格和工单从 [考公文档入口](${path.relative(path.dirname(source), path.join(root, 'docs/README.md')).replaceAll('\\', '/')}) 进入。历史验收不代表独立版完成。\n`)
  }
}
await fs.writeFile(path.join(root, 'archive/docs/index.json'), JSON.stringify(manifest, null, 2))
await fs.writeFile(path.join(root, 'archive/docs/README.md'), '# 考公历史档案\n\n此处是逐字节核验的历史文档，不是本轮规格或完成证明。原状态与版本原样保留。\n\n归档阶段保留原址以保护既有链接。`index.json` 记录原址、SHA256及各相对引用的原仓库目标；阅读档案中的历史相对链接时以该目标为准。共享平台/Harness资料继续留在根docs。现行入口为 [考公文档](../../docs/README.md)。\n\n' + manifest.map(row => `- [${row.source}](${row.archive})`).join('\n') + '\n')
console.log(JSON.stringify({ archived: manifest.length, references: manifest.reduce((n, r) => n + r.references.length, 0), missingOriginalReferences: manifest.flatMap(r => r.references.filter(v => !v.exists).map(v => ({source:r.source,...v}))) }))
