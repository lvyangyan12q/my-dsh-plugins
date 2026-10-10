import { readFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceArgument = process.env.DSH_SOURCE
if (!sourceArgument || !isAbsolute(sourceArgument)) throw new Error('Set DSH_SOURCE to an absolute official DSH checkout path')
const source = resolve(sourceArgument)
const directory = resolve(root, 'compat/native-sidebar-sections')
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'))
const allowed = new Set(["packages/client/ui-sidebar/src/client/contract/slots.ts","packages/client/ui-sidebar/src/client/index.ts","packages/client/ui-sidebar/src/client/SidebarRoot.tsx","packages/client/ui-sidebar/tests/apply.client.spec.tsx","packages/client/ui-sidebar/tests/sidebar-root.client.spec.tsx","packages/client/ui-sidebar/tests/sidebar-snapshot.client.spec.tsx","packages/client/ui-sidebar/tests/__snapshots__/sidebar-snapshot.client.spec.tsx.snap","packages/client/ui-sidebar/README.md","packages/client/ui-sidebar/README.zh.md","packages/client/ui-sidebar/README.i18n.yaml","docs/subsystems/slots.md","docs/subsystems/slots.zh.md"])
if (manifest.files.length !== allowed.size || new Set(manifest.files.map(row => row.path)).size !== allowed.size || manifest.files.some(row => !allowed.has(row.path))) throw new Error('Unexpected compatibility patch file set')
const hash = text => createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex')
async function state() {
  return Promise.all(manifest.files.map(async row => ({ ...row, actual: hash(await readFile(resolve(source,row.path),'utf8')) })))
}
const rows = await state()
if (rows.every(row => row.actual === row.after)) {
  console.log('Native sidebar sections source adaptation verified; build the native client before runtime verification')
} else {
  if (!process.argv.includes('--apply')) throw new Error('Native sidebar sections adaptation missing; inspect compat/native-sidebar-sections/README.md and explicitly run this script with --apply')
  if (!rows.every(row => row.actual === row.before)) throw new Error('Native checkout differs from the reviewed patch baseline; preserve local changes and adapt explicitly')
  const patch = resolve(directory, 'native-sidebar-sections.patch')
  execFileSync('git', ['-C',source,'apply','--unidiff-zero','--check',patch], { stdio:'inherit' })
  const backup = resolve(root,'.local/backups',`native-sidebar-sections-${Date.now()}`)
  await mkdir(backup, { recursive:true })
  for (const row of rows) await copyFile(resolve(source,row.path), resolve(backup,row.path.replaceAll('/','__')))
  execFileSync('git', ['-C',source,'apply','--unidiff-zero',patch], { stdio:'inherit' })
  if (!(await state()).every(row => row.actual === row.after)) throw new Error('Applied patch differs from reviewed source')
  console.log('Applied native sidebar sections adaptation; originals backed up. Build the native client next.')
}
