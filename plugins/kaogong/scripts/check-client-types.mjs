import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

// Consume built public declarations from the target checkout without modifying it.
const source = process.env.KAOGONG_TEST_RUNTIME
const workbench = process.env.KAOGONG_WORKBENCH_TYPES
if (!source || !workbench) throw Error('Set KAOGONG_TEST_RUNTIME and KAOGONG_WORKBENCH_TYPES to built package directories')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const paths = {}
const officialRequire = createRequire(resolve(source, 'packages/storage/storage-domain/package.json'))
paths.zod = [resolve(dirname(officialRequire.resolve('zod/package.json')), 'index.d.ts')]
function addPackage(directory) {
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'))
  for (const [key, target] of Object.entries(manifest.exports ?? {})) {
    if (typeof target !== 'object' || !target.types) continue
    const name = manifest.name + (key === '.' ? '' : key.slice(1))
    paths[name] = [resolve(directory, target.types)]
  }
}
for (const group of readdirSync(resolve(source, 'packages'), { withFileTypes: true }).filter(item => item.isDirectory())) {
  for (const pkg of readdirSync(resolve(source, 'packages', group.name), { withFileTypes: true }).filter(item => item.isDirectory())) {
    addPackage(resolve(source, 'packages', group.name, pkg.name))
  }
}
addPackage(resolve(source, 'vendor/cordis'))
addPackage(workbench)
paths.react = [resolve(source, 'packages/client/ui-renderer/node_modules/@types/react/index.d.ts')]
paths['react/jsx-runtime'] = [resolve(source, 'packages/client/ui-renderer/node_modules/@types/react/jsx-runtime.d.ts')]
mkdirSync(resolve(root, 'lib/typecheck'), { recursive: true })
const config = resolve(root, 'lib/typecheck/tsconfig.json')
writeFileSync(config, JSON.stringify({ extends: '../../tsconfig.client.json', compilerOptions: { paths } }, null, 2) + '\n')
const result = spawnSync(process.execPath, [resolve(source, 'node_modules/typescript/bin/tsc'), '-p', config], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)
paths['@deepseek-ai/dsh-tool-kaogong/client'] = [resolve(root, 'lib/types/client.d.ts')]
const consumerConfig = resolve(root, 'lib/typecheck/consumer.json')
writeFileSync(consumerConfig, JSON.stringify({ extends: './tsconfig.json', compilerOptions: { rootDir: '../..', noEmit: true, emitDeclarationOnly: false, paths }, include: ['../../tests/public-client-consumer.ts'] }, null, 2) + '\n')
const consumer = spawnSync(process.execPath, [resolve(source, 'node_modules/typescript/bin/tsc'), '-p', consumerConfig], { stdio: 'inherit' })
process.exitCode = consumer.status ?? 1
if (consumer.status === 0) {
  const roleConfig = resolve(root, 'lib/typecheck/roles.json')
  writeFileSync(roleConfig, JSON.stringify({ extends: './tsconfig.json', compilerOptions: { noEmit: true, emitDeclarationOnly: false, types: ['node'], paths }, include: ['../../src/role-definitions.ts'] }, null, 2) + '\n')
  const roles = spawnSync(process.execPath, [resolve(source, 'node_modules/typescript/bin/tsc'), '-p', roleConfig], { stdio: 'inherit' })
  process.exitCode = roles.status ?? 1
  if (roles.status === 0) {
    const practiceConfig = resolve(root, 'lib/typecheck/practice.json')
    writeFileSync(practiceConfig, JSON.stringify({ extends: './roles.json', compilerOptions: { noEmit: true, declaration: false, emitDeclarationOnly: false }, include: ['../../src/practice-rounds.ts', '../../src/domain.ts'] }, null, 2) + '\n')
    const practice = spawnSync(process.execPath, [resolve(source, 'node_modules/typescript/bin/tsc'), '-p', practiceConfig], { stdio: 'inherit' })
    process.exitCode = practice.status ?? 1
  }
}
