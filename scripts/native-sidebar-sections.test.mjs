import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root, 'compat/native-sidebar-sections/manifest.json'), 'utf8'))
assert(process.env.DSH_SOURCE, 'Set DSH_SOURCE for the reviewed native source fixture')
const hash = text => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex')

test('sidebar section adapter preserves local changes, installs its regression and verifies idempotently', async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'my-dsh-sidebar-sections-'))
  const run = (...args) => spawnSync(process.execPath, [resolve(root, 'scripts/check-native-sidebar-sections.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, DSH_SOURCE: fixture } })
  try {
    for (const row of manifest.files) {
      if (row.before === null) continue
      const original = execFileSync('git', ['-C', process.env.DSH_COMPAT_GIT_SOURCE ?? process.env.DSH_SOURCE, 'show', `${manifest.baseCommit}:${row.path}`], { encoding: 'utf8' })
      assert.equal(hash(original), row.before)
      await mkdir(dirname(resolve(fixture, row.path)), { recursive: true })
      await writeFile(resolve(fixture, row.path), original)
    }
    execFileSync('git', ['-C', fixture, 'init'], { stdio: 'ignore' })
    const unrelated = resolve(fixture, 'user-agent.txt')
    await writeFile(unrelated, 'keep user changes\n')
    assert.notEqual(run().status, 0)
    const changed = resolve(fixture, manifest.files[0].path)
    const original = await readFile(changed, 'utf8')
    await writeFile(changed, original + '\n// user change\n')
    const conflict = run('--apply')
    assert.notEqual(conflict.status, 0)
    assert.match(conflict.stderr, /differs from the reviewed patch baseline/)
    assert.equal(await readFile(changed, 'utf8'), original + '\n// user change\n')
    await writeFile(changed, original)
    const applied = run('--apply')
    assert.equal(applied.status, 0, applied.stderr)
    for (const row of manifest.files) assert.equal(hash(await readFile(resolve(fixture, row.path), 'utf8')), row.after)
    assert.equal(await readFile(unrelated, 'utf8'), 'keep user changes\n')
    assert.equal(run().status, 0)
    assert.equal(run('--apply').status, 0)
  } finally {
    assert(basename(fixture).startsWith('my-dsh-sidebar-sections-'))
    assert.equal(dirname(fixture), resolve(tmpdir()))
    await rm(fixture, { recursive: true, force: true })
  }
})

test('native sections accept the exact reviewed retirement combination and reject altered or mixed files', async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'my-dsh-sidebar-sections-'))
  const run = (...args) => spawnSync(process.execPath, [resolve(root, 'scripts/check-native-sidebar-sections.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, DSH_SOURCE: fixture } })
  try {
    for (const row of manifest.files) {
      const original = execFileSync('git', ['-C', process.env.DSH_COMPAT_GIT_SOURCE ?? process.env.DSH_SOURCE, 'show', 'd6a3a72164447bd8717db2ecdc66962a7800985a:' + row.path], { encoding: 'utf8' })
      await mkdir(dirname(resolve(fixture, row.path)), { recursive: true })
      await writeFile(resolve(fixture, row.path), original)
    }
    assert.equal(run().status, 0, 'reviewed retirement + native sections must verify without rewriting files')
    assert.equal(run('--apply').status, 0)
    const changed = resolve(fixture, 'packages/client/ui-sidebar/src/client/contract/slots.ts')
    const original = await readFile(changed, 'utf8')
    await writeFile(changed, original + '\n// unrelated local change\n')
    assert.notEqual(run().status, 0)
    assert.notEqual(run('--apply').status, 0)
    assert.equal(await readFile(changed, 'utf8'), original + '\n// unrelated local change\n')
    await writeFile(changed, original)
    const mixed = 'packages/client/ui-sidebar/tests/sidebar-root.client.spec.tsx'
    const legacy = execFileSync('git', ['-C', process.env.DSH_COMPAT_GIT_SOURCE ?? process.env.DSH_SOURCE, 'show', manifest.baseCommit + ':' + mixed], { encoding: 'utf8' })
    await writeFile(resolve(fixture, mixed), legacy)
    assert.notEqual(run().status, 0, 'mixed states are not a reviewed full twelve-file combination')
    assert.notEqual(run('--apply').status, 0)
  } finally {
    assert(basename(fixture).startsWith('my-dsh-sidebar-sections-'))
    assert.equal(dirname(fixture), resolve(tmpdir()))
    await rm(fixture, { recursive: true, force: true })
  }
})
