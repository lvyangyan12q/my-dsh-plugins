import assert from 'node:assert/strict'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runNode, npmCli } from './release-tools.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
assert(process.env.DSH_SOURCE, 'Set DSH_SOURCE to the already-built official DSH checkout')
// Each maintained package owns its current build and compatibility checks.
// The retired personal-workbench platform is no longer a build prerequisite.
for (const pkg of ['worktable/01_content', 'project-notes', 'kaogong', 'reading-statistics']) {
  await runNode([npmCli(), 'run', 'build'], { cwd: resolve(root, 'plugins', pkg), env: process.env })
  console.log(`${pkg}: package build completed`)
}
