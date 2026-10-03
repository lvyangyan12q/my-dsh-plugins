import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const root = dirname(fileURLToPath(import.meta.url)), workbench = resolve(root, '../personal-workbench')
const config = JSON.parse(await readFile(resolve(workbench, '.checks/tsconfig.json'), 'utf8'))
config.extends = '../tsconfig.json'; config.include = ['../src']
config.compilerOptions.paths['@deepseek-ai/dsh-personal-workbench'] = [resolve(workbench, 'lib/types/index.d.ts')]
config.compilerOptions.paths['@deepseek-ai/dsh-personal-workbench/client'] = [resolve(workbench, 'lib/types/client.d.ts')]
await mkdir(resolve(root, '.checks'), { recursive: true })
await writeFile(resolve(root, '.checks/tsconfig.json'), JSON.stringify(config))
const require = createRequire(resolve(process.env.DSH_SOURCE, 'package.json'))
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', resolve(root, '.checks/tsconfig.json')], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
