import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

// Owner-local check against an already-built official checkout; no profile is opened.
const source = process.env.DSH_SOURCE
if (!source) throw new Error('Set DSH_SOURCE to an already-built official DSH checkout')
const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(source, 'package.json'))
const paths = {}
for (const top of ['packages', 'vendor']) {
  const roots = top === 'vendor' ? [resolve(source, top)] :
    (await readdir(resolve(source, top), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => resolve(source, top, entry.name))
  for (const root of roots) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const folder = resolve(root, entry.name)
      let manifest
      try { manifest = JSON.parse(await readFile(resolve(folder, 'package.json'), 'utf8')) }
      catch (error) { if (error.code === 'ENOENT') continue; throw error }
      for (const [key, value] of Object.entries(manifest.exports ?? {})) {
        if (typeof value !== 'object' || value === null || typeof value.types !== 'string' || key.includes('*')) continue
        paths[manifest.name + (key === '.' ? '' : key.slice(1))] = [resolve(folder, value.types)]
      }
      if (manifest.types && !paths[manifest.name]) paths[manifest.name] = [resolve(folder, manifest.types)]
    }
  }
}
const clientRequire = createRequire(resolve(source, 'packages/client/ui-conversation/package.json'))
const reactTypes = dirname(clientRequire.resolve('@types/react/package.json'))
paths.react = [resolve(reactTypes, 'index.d.ts')]
paths['react/jsx-runtime'] = [resolve(reactTypes, 'jsx-runtime.d.ts')]
await mkdir(resolve(plugin, '.checks'), { recursive: true })
await writeFile(resolve(plugin, '.checks/tsconfig.json'), JSON.stringify({
  extends: '../tsconfig.json',
  compilerOptions: { paths, types: ['node'], typeRoots: [dirname(dirname(require.resolve('@types/node/package.json'))), dirname(reactTypes)] },
  include: ['../src', '../tests'],
}, null, 2) + '\n')
const emitTypes = process.argv.includes('--emit-types')
const checkConsumer = process.argv.includes('--check-consumer')
if (emitTypes && checkConsumer) throw new Error('Choose declaration emission or consumer checking')
if (emitTypes) await writeFile(resolve(plugin, '.checks/tsconfig.types.json'), JSON.stringify({
  extends: '../tsconfig.types.json', compilerOptions: { paths, types: ['node'], typeRoots: [dirname(dirname(require.resolve('@types/node/package.json'))), dirname(reactTypes)] },
  include: ['../src'],
}, null, 2) + '\n')
if (checkConsumer) {
  paths['@deepseek-ai/dsh-personal-workbench'] = [resolve(plugin, 'lib/types/index.d.ts')]
  paths['@deepseek-ai/dsh-personal-workbench/client'] = [resolve(plugin, 'lib/types/client.d.ts')]
  await writeFile(resolve(plugin, '.checks/consumer.ts'), `import type { Context } from '@deepseek-ai/cordis'
import type { PersonalWorkbench, WorkbenchAppId, WorkbenchInstanceId, WorkbenchAppDefinition, WorkbenchAppProps } from '@deepseek-ai/dsh-personal-workbench/client'
import type { RoleBindingKey, PersonalWorkbenchRoles } from '@deepseek-ai/dsh-personal-workbench/client'
import type { PersonalWorkbenchBindings } from '@deepseek-ai/dsh-personal-workbench'
import type { SkillAssignment, ManagementRequest, ManagementCatalog } from '@deepseek-ai/dsh-personal-workbench'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import { DisplayStore, DisplayModule, DisplayModules, registerDisplaySource, registerRecipeTemplate } from '@deepseek-ai/dsh-personal-workbench/client'
import type { DisplayData, DisplaySource, AppRecipe } from '@deepseek-ai/dsh-personal-workbench/client'
const displayData: DisplayData = { records: [{ id: 'record', title: 'Title', fields: { category: 'work', count: 2 } }], filters: [{ field: 'category', label: 'Category' }], stats: [{ id: 'total', label: 'Total', operation: 'sum', field: 'count' }] }
const displaySource: DisplaySource = { appId: 'kaogong', resource: 'overview', label: 'Overview', load: async () => displayData }
const displayStore = new DisplayStore(displaySource, { appId: 'kaogong', instanceId: 'default', preview: false })
displayStore.setFilter('category', 'work'); displayStore.setSearch('Title'); displayStore.select('record')
void [displayStore.reload(), DisplayModule, DisplayModules, registerDisplaySource(displaySource)]
declare const appRecipe: AppRecipe
void registerRecipeTemplate({ id: 'example', label: 'Example', create: async () => appRecipe })
declare const ctx: Context
const api: PersonalWorkbench = ctx.personalWorkbench
const bindings: PersonalWorkbenchBindings = ctx.personalWorkbenchBindings
const roles: PersonalWorkbenchRoles = ctx.personalWorkbenchRoles
const teacher: RoleBindingKey = { appId: 'kaogong', instanceId: 'default', roleId: 'teacher' }
const declaredRoles = bindings.listRoles()
const assignment: SkillAssignment = { version: 1, key: teacher, revision: 0, names: ['existing-skill'] }
const request: ManagementRequest = { action: 'assign', key: teacher, expectedRevision: assignment.revision, names: assignment.names }
declare const catalog: ManagementCatalog
void [declaredRoles, request, catalog.roles, catalog.skills]
void bindings.read(teacher)
void bindings.ensure(teacher)
const withdraw: () => void = bindings.registerRole({ key: { ...teacher, subject: 'math' }, presetId: 'app.teacher.math.v1', creation: { cwd: 'C:/learning' }, teaching: { skillName: 'kaogong-teach', provider: 'app' } })
void roles.ensure(teacher)
void roles.open(teacher)
void roles.teach(teacher, { kind: 'lesson', context: { subject: 'math', title: 'target', limit: 5 } })
declare const renderer: PropsRenderFactories
renderer.renderFactorySlot('personal-workbench.role-conversation', { bindingKey: teacher, active: true })
const id = 'kaogong' as WorkbenchAppId
const instance = 'default' as WorkbenchInstanceId
const definition: WorkbenchAppDefinition = { id, name: 'Kaogong', version: '1', source: 'plugin', icon: 'graduation-cap', pages: [{ id: 'classroom', label: 'Classroom' }], defaultLayout: { width: 800, height: 600, pageId: 'classroom' }, roles: [{ id: 'teacher', name: 'Teacher' }], dependencies: [{ id: 'native-session', available: true }] }
const dispose: () => void = api.registerApp(definition)
api.openApp(id, instance)
api.openWorkspace()
declare const view: WorkbenchAppProps
const page: string = view.pageId
const active: boolean = view.active
view.selectPage(page)
view.close()
// @ts-expect-error Window presentation has no Session cancellation API.
api.cancel()
// @ts-expect-error Definitions never accept React components.
definition.component = () => null
void [dispose, active, withdraw]
`)
  await writeFile(resolve(plugin, '.checks/tsconfig.consumer.json'), JSON.stringify({
    extends: './tsconfig.json', include: ['./consumer.ts'],
  }, null, 2) + '\n')
}
const config = emitTypes ? 'tsconfig.types.json' : checkConsumer ? 'tsconfig.consumer.json' : 'tsconfig.json'
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), ...(emitTypes ? [] : ['--noEmit']), '-p', resolve(plugin, '.checks', config)], { stdio: 'inherit', cwd: plugin })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
