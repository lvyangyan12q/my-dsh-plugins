import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root, 'compat/native-composer-root/manifest.json'), 'utf8'))
assert(process.env.DSH_SOURCE, 'Set DSH_SOURCE for the reviewed native source fixture')
const hash = text => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex')

test('composer adapter preserves local changes, installs its regression and verifies idempotently', async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'my-dsh-composer-root-'))
  const run = (...args) => spawnSync(process.execPath, [resolve(root, 'scripts/check-native-composer-root.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, DSH_SOURCE: fixture } })
  try {
    for (const row of manifest.files) {
      if (row.before === null) continue
      const original = execFileSync('git', ['-C', process.env.DSH_SOURCE, 'show', `${manifest.baseCommit}:${row.path}`], { encoding: 'utf8' })
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
    assert.match(conflict.stderr, /differs from the reviewed baseline/)
    assert.equal(await readFile(changed, 'utf8'), original + '\n// user change\n')
    await writeFile(changed, original)
    const applied = run('--apply')
    assert.equal(applied.status, 0, applied.stderr)
    for (const row of manifest.files) assert.equal(hash(await readFile(resolve(fixture, row.path), 'utf8')), row.after)
    assert.equal(await readFile(unrelated, 'utf8'), 'keep user changes\n')
    assert.equal(run().status, 0)
    assert.equal(run('--apply').status, 0)
    execFileSync('git', ['-C', fixture, 'apply', '--unidiff-zero', '-R', resolve(root, 'compat/native-composer-root/upgrade-native-composer-root.patch')], { stdio: 'ignore' })
    for (const row of manifest.files) {
      if (row.previous === null) {
        await assert.rejects(readFile(resolve(fixture, row.path)), { code: 'ENOENT' })
      } else {
        assert.equal(hash(await readFile(resolve(fixture, row.path), 'utf8')), row.previous)
      }
    }
    assert.notEqual(run().status, 0)
    const upgraded = run('--apply')
    assert.equal(upgraded.status, 0, upgraded.stderr)
    for (const row of manifest.files) assert.equal(hash(await readFile(resolve(fixture, row.path), 'utf8')), row.after)
    assert.equal(await readFile(unrelated, 'utf8'), 'keep user changes\n')
  } finally {
    assert(basename(fixture).startsWith('my-dsh-composer-root-'))
    assert.equal(dirname(fixture), resolve(tmpdir()))
    await rm(fixture, { recursive: true, force: true })
  }
})
