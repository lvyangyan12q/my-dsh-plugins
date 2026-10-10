import { readFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceArgument = process.env.DSH_SOURCE
if (!sourceArgument || !isAbsolute(sourceArgument)) throw new Error('Set DSH_SOURCE to an absolute official DSH checkout path')
const source = resolve(sourceArgument)
const directory = resolve(root, 'compat/native-session-chrome')
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'))
const allowed = new Set([
  'packages/client/ui-conversation/README.md',
  'packages/client/ui-conversation/README.zh.md',
  'packages/client/ui-conversation/src/client/apply.ts',
  'packages/client/ui-conversation/src/client/contract/slots.ts',
  'packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx',
  'packages/client/ui-conversation/tests/apply-wiring.client.spec.tsx',
])
if (manifest.files.length !== allowed.size || new Set(manifest.files.map(row => row.path)).size !== allowed.size || manifest.files.some(row => !allowed.has(row.path))) throw new Error('Unexpected compatibility patch file set')
const combinations = [manifest.files, ...(manifest.reviewedCombinations ?? []).map(row => row.files)]
for (const files of combinations) if (files.length !== allowed.size || new Set(files.map(row => row.path)).size !== allowed.size || files.some(row => !allowed.has(row.path) || !/^[a-f0-9]{64}$/.test(row.after))) throw new Error('Unexpected reviewed compatibility combination')
const hash = text => createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex')
async function state() {
  return Promise.all(manifest.files.map(async row => ({ ...row, actual: hash(await readFile(resolve(source,row.path),'utf8')) })))
}
const rows = await state()
if (combinations.some(files => rows.every(row => row.actual === files.find(expected => expected.path === row.path).after))) {
  console.log('Native Session chrome source adaptation verified; build the native client before runtime verification')
} else {
  if (!process.argv.includes('--apply')) throw new Error('Native Session chrome adaptation missing; inspect compat/native-session-chrome/README.md and explicitly run this script with --apply')
  if (!rows.every(row => row.actual === row.before)) throw new Error('Native checkout differs from the reviewed patch baseline; preserve local changes and adapt explicitly')
  const patch = resolve(directory, 'native-session-chrome.patch')
  execFileSync('git', ['-C', source, 'apply', '--unidiff-zero', '--check', '-'], { input: await readFile(patch, 'utf8').then(text => text.replaceAll('\r\n', '\n')), stdio: ['pipe','inherit','inherit'] })
  const backup = resolve(root,'.local/backups',`native-session-chrome-${Date.now()}`)
  await mkdir(backup, { recursive:true })
  for (const row of rows) await copyFile(resolve(source,row.path), resolve(backup,row.path.replaceAll('/','__')))
  execFileSync('git', ['-C', source, 'apply', '--unidiff-zero', '-'], { input: await readFile(patch, 'utf8').then(text => text.replaceAll('\r\n', '\n')), stdio: ['pipe','inherit','inherit'] })
  if (!(await state()).every(row => row.actual === row.after)) throw new Error('Applied patch differs from reviewed source')
  console.log('Applied native Session chrome adaptation; originals backed up. Build the native client next.')
}
