import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const value = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
if (!value('--plugin-root') || !path.isAbsolute(value('--plugin-root'))) throw Error('EXPLICIT_PLUGIN_ROOT_REQUIRED')
const root = path.resolve(value('--plugin-root')), materials = path.join(root, 'materials')
const manifest = JSON.parse(await fs.readFile(path.join(materials, 'manifests/migration.json'), 'utf8'))
const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex')
const inside = (base, file) => { const r = path.relative(base, file); return r && !path.isAbsolute(r) && r !== '..' && !r.startsWith('..' + path.sep) }
async function physical(file, base) {
  if (!inside(base, file)) throw Error('PATH_ESCAPE')
  const stat = await fs.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || (await fs.realpath(file)).toLowerCase() !== path.resolve(file).toLowerCase()) throw Error('NONPHYSICAL_FILE')
}
const selected = manifest.files.filter(row => row.disposition === 'archive-legacy-storage')
const links = []
async function scan(dir) {
  const stat = await fs.lstat(dir)
  if (stat.isSymbolicLink()) { links.push(dir); return }
  if (stat.isDirectory()) for (const name of await fs.readdir(dir)) await scan(path.join(dir, name))
}
await scan(materials)
if (links.length) throw Error('MATERIAL_DESTINATION_HAS_LINKS')
const pending = []
for (const row of selected) {
  const candidate = path.join(materials, row.relative)
  if (!row.verified || !row.relative.startsWith('storage' + path.sep) || row.relative.startsWith('storage' + path.sep + 'mineru' + path.sep) || row.newPath !== path.join(root, 'archive/local/legacy-root', row.relative)) throw Error('INVALID_ARCHIVE_RECEIPT')
  try { await fs.lstat(candidate) } catch (e) { if (e.code === 'ENOENT') continue; throw e }
  for (const [file, base] of [[candidate, materials], [row.newPath, path.join(root, 'archive/local')], [row.oldPath, manifest.source]]) await physical(file, base)
  for (const file of [candidate, row.newPath, row.oldPath]) if (await hash(file) !== row.sha256) throw Error('ARCHIVE_HASH_MISMATCH')
  pending.push(candidate)
}
if (args.includes('--apply')) {
  for (const file of pending) {
    await fs.unlink(file)
    let dir = path.dirname(file)
    while (inside(path.join(materials, 'storage'), dir)) {
      try { await fs.rmdir(dir) } catch (e) { if (['ENOTEMPTY', 'ENOENT'].includes(e.code)) break; throw e }
      dir = path.dirname(dir)
    }
  }
  await scan(materials)
  if (links.length) throw Error('MATERIAL_DESTINATION_HAS_LINKS_AFTER_CLEANUP')
}
console.log(JSON.stringify({mode:args.includes('--apply')?'removed-verified-extra-copies':'preview',selected:selected.length,pending:pending.length,links:links.length,sourceDeleted:false,archiveDeleted:false}))
