import assert from 'node:assert/strict'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runNode } from './release-tools.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = process.env.DSH_SOURCE
assert(source, 'Set DSH_SOURCE to the already-built official rc.2 checkout')
const tsdown = process.env.RELEASE_TSDOWN_CLI ?? resolve(root, 'node_modules/tsdown/dist/run.mjs')
const env = { ...process.env, DSH_SOURCE: source, KAOGONG_TEST_RUNTIME: source, KAOGONG_WORKBENCH_TYPES: resolve(root, 'plugins/personal-workbench') }
// The Host build cleans this package's lib once; Client and declarations then add their outputs.
for (const [pkg, commands] of [
  ['personal-workbench', [[tsdown, '-c', 'tsdown.config.ts'], ['scripts/check-source.mjs'], ['scripts/check-source.mjs', '--emit-types'], ['scripts/check-source.mjs', '--check-consumer']]],
  ['kaogong', [[tsdown, '-c', 'tsdown.host.config.ts'], [tsdown, '-c', 'tsdown.config.ts'], ['scripts/check-client-types.mjs']]],
  ['reading-statistics', [[tsdown, '-c', 'tsdown.config.ts'], ['check-types.mjs']]],
]) {
  for (const command of commands) await runNode(command, { cwd: resolve(root, 'plugins', pkg), env })
  console.log(`${pkg}: clean Host/Client build, declarations and source consumers passed`)
}
