import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ownedRoot, runNode } from './release-tools.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), source = process.env.DSH_SOURCE
assert(source, 'DSH_SOURCE must point to the already-built official runtime')
const run = await ownedRoot(root, join(root, '.scratch', 'platform-tests-' + Date.now()))
// Source integration tests execute real shared implementation; installed consumers are checked separately.
const bridge = join(run, 'client-source-bridge.ts')
await writeFile(bridge, [
  `export { PreparedTaskEditor } from ${JSON.stringify('../../plugins/personal-workbench/src/task-view.tsx')}`,
  `export { DisplayModule, DisplayModules } from ${JSON.stringify('../../plugins/personal-workbench/src/display-view.tsx')}`,
  `export { controlStyles } from ${JSON.stringify('../../plugins/personal-workbench/src/control-styles.ts')}`,
  `export { DisplayStore } from ${JSON.stringify('../../plugins/personal-workbench/src/display-store.ts')}`,
].join('\n'))
const config = join(run, 'tsconfig.json')
await writeFile(config, JSON.stringify({ extends: resolve(root, 'plugins/personal-workbench/tsconfig.json'), compilerOptions: { paths: { '@deepseek-ai/dsh-personal-workbench/client': [bridge] } } }))
const env = { ...process.env, DSH_SOURCE: source, KAOGONG_TEST_RUNTIME: source, KAOGONG_WORKBENCH_TYPES: resolve(root, 'plugins/personal-workbench'), NODE_PATH: resolve(source, 'node_modules') }
const output = await runNode([resolve(root, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', config, '--test',
  'plugins/personal-workbench/tests/*.test.ts', 'plugins/personal-workbench/tests/*.test.mjs',
  'plugins/kaogong/tests/*.test.ts', 'plugins/kaogong/tests/*.test.tsx', 'plugins/kaogong/tests/*.test.mjs',
  'plugins/reading-statistics/tests/*.test.mjs', 'tests/release-package.test.mjs'], { cwd: root, env })
await writeFile(join(run, 'tests.log'), output)
console.log(output.split('\n').filter(line => /(?:tests|pass|fail|cancelled|skipped|todo|duration_ms) \d+/.test(line)).join('\n'))
