import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const command = new URL('../scripts/check-native-public-runtime.mjs', import.meta.url)
test('release preflight accepts an unpatched built rc.2 runtime without installing native adapters', async () => {
 const root = await mkdtemp(join(tmpdir(), 'unpatched-public-runtime-'))
 try {
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.2.0-rc.2' }))
  await mkdir(join(root, 'apps/cli/lib'), { recursive: true })
  await writeFile(join(root, 'apps/cli/lib/bin.js'), '// filesystem boundary fixture; full compilation is a separate release gate')
  const result = spawnSync(process.execPath, [fileURLToPath(command)], { env: { ...process.env, DSH_SOURCE: root }, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).nativeSourceWrites, 0)
 } finally { await rm(root, { recursive: true, force: true }) }
})


