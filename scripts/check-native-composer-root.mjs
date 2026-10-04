import { readFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (!process.env.DSH_SOURCE || !isAbsolute(process.env.DSH_SOURCE)) throw new Error('Set DSH_SOURCE to an absolute official DSH checkout path')
const source = resolve(process.env.DSH_SOURCE)
const directory = resolve(root, 'compat/native-composer-root')
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'))
const allowed = new Set([
  'packages/client/ui-conversation/src/client/input/editor/ComposerContentEditable.tsx',
  'packages/client/ui-conversation/tests/composer-root-ownership.client.spec.tsx',
])
if (manifest.files.length !== allowed.size || new Set(manifest.files.map(row => row.path)).size !== allowed.size || manifest.files.some(row => !allowed.has(row.path))) throw new Error('Unexpected compatibility patch file set')
const hash = value => createHash('sha256').update(value.replaceAll('\r\n', '\n')).digest('hex')
async function state() {
  return Promise.all(manifest.files.map(async row => {
    try { return { ...row, actual: hash(await readFile(resolve(source, row.path), 'utf8')) } }
    catch (error) { if (error.code === 'ENOENT') return { ...row, actual: null }; throw error }
  }))
}
const rows = await state()
if (rows.every(row => row.actual === row.after)) {
  console.log('Native composer teardown ownership adaptation verified; rebuild native client before runtime acceptance')
} else {
  if (!process.argv.includes('--apply')) throw new Error('Native composer root adaptation missing; explicitly run with --apply after reviewing compat/native-composer-root/README.md')
  if (!rows.every(row => row.actual === row.before)) throw new Error('Native checkout differs from the reviewed baseline; preserve local changes and adapt explicitly')
  const patch = resolve(directory, 'native-composer-root.patch')
  execFileSync('git', ['-C', source, 'apply', '--check', patch], { stdio: 'inherit' })
  const backup = resolve(root, '.local/backups', `native-composer-root-${Date.now()}`)
  await mkdir(backup, { recursive: true })
  for (const row of rows) if (row.before !== null) await copyFile(resolve(source, row.path), resolve(backup, row.path.replaceAll('/', '__')))
  execFileSync('git', ['-C', source, 'apply', patch], { stdio: 'inherit' })
  if (!(await state()).every(row => row.actual === row.after)) throw new Error('Applied patch differs from reviewed source')
  console.log('Applied native composer root ownership adaptation; originals backed up. Rebuild native client next.')
}
