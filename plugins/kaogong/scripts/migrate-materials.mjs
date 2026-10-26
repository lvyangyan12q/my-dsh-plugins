import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

// Copy-only migration: links are recorded and never traversed; existing files
// must match. No source removal or configuration/proof mutation is performed.
const root = path.resolve(import.meta.dirname, '..')
const source = path.resolve(root, '../../materials/kaogong')
const target = path.join(root, 'materials')
const apply = process.argv.includes('--copy')
const digest = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
async function ensureDirectory(directory) {
  const relative = path.relative(root, directory)
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) throw Error('Destination outside plugin')
  let current = root
  for (const part of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part)
    try { await fs.mkdir(current) } catch (error) { if (error.code !== 'EEXIST') throw error }
    const stat = await fs.lstat(current)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Linked or invalid destination directory')
  }
}
const files = [], links = []
const materialRoots = new Set(['讲义', '题目', '讲义_text', '题目_text', '题目_images', 'storage'])
function destination(relative) {
  const first = relative.split(path.sep)[0]
  if (first === 'storage' && relative.split(path.sep)[1] !== 'mineru') return { newPath: path.join(root, 'archive/local/legacy-root', relative), disposition: 'archive-legacy-storage' }
  if (materialRoots.has(first)) return { newPath: path.join(target, relative), disposition: 'material-copy' }
  if (['node_modules', '.pdftool', '.tmp'].includes(first)) return { newPath: null, disposition: 'retain-source-pending-cache-review' }
  return { newPath: path.join(root, 'archive/local/legacy-root', relative), disposition: 'archive-unknown-or-code' }
}
async function scan(dir) {
  for (const name of (await fs.readdir(dir)).sort()) {
    const file = path.join(dir, name)
    const stat = await fs.lstat(file)
    if (stat.isSymbolicLink()) { links.push({ path: file, target: await fs.readlink(file) }); continue }
    if (stat.isDirectory()) { await scan(file); continue }
    if (!stat.isFile()) throw new Error(`Unsupported entry: ${file}`)
    const relative = path.relative(source, file)
    files.push({ relative, oldPath: file, ...destination(relative), bytes: stat.size, sha256: await digest(file) })
  }
}
if ((await fs.lstat(source)).isSymbolicLink()) throw new Error('Source root must be physical')
await scan(source)
for (const file of files) {
  if (!apply || !file.newPath) continue
  await ensureDirectory(path.dirname(file.newPath))
  if ((await fs.lstat(file.oldPath)).isSymbolicLink() || (await fs.realpath(file.oldPath)).toLowerCase() !== file.oldPath.toLowerCase()) throw Error('Source path changed')
  try { await fs.copyFile(file.oldPath, file.newPath, fs.constants.COPYFILE_EXCL) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  if (!(await fs.lstat(file.newPath)).isFile() || (await fs.lstat(file.newPath)).isSymbolicLink()) throw new Error(`Invalid destination: ${file.newPath}`)
  if (await digest(file.newPath) !== file.sha256 || await digest(file.oldPath) !== file.sha256) throw new Error(`Hash mismatch: ${file.relative}`)
  file.verified = true
}
const result = { source, target, mode: apply ? 'copied-and-verified' : 'inventory', generatedAt: new Date().toISOString(), count: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0), links, files, references: 'pending: retain original paths and proofs' }
await ensureDirectory(path.join(target, 'manifests'))
await fs.writeFile(path.join(target, 'manifests', apply ? 'migration.json' : 'migration-inventory.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify({ mode: result.mode, count: result.count, bytes: result.bytes, links: links.length }))
