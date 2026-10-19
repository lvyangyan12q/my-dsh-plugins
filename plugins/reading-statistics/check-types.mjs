import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const root = dirname(fileURLToPath(import.meta.url))
const workbench = resolve(process.env.READING_LEGACY_ROOT ?? resolve(root, '../..'), 'plugins/personal-workbench')
const config = { extends: '../tsconfig.json', include: ['../src'], compilerOptions: { types: ['node','react'], paths: {
  '@deepseek-ai/dsh-personal-workbench': [resolve(workbench, 'lib/types/index.d.ts')],
  '@deepseek-ai/dsh-personal-workbench/client': [resolve(workbench, 'lib/types/client.d.ts')],
} } }
await mkdir(resolve(root, '.checks'), { recursive: true })
await writeFile(resolve(root, '.checks/tsconfig.json'), JSON.stringify(config))
const require = createRequire(resolve(process.env.DSH_SOURCE, 'package.json'))
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', resolve(root, '.checks/tsconfig.json')], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
