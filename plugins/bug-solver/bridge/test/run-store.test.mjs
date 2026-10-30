/**
 * 接缝：RunStore —— 公开 API 只有 get/list/put/remove/flush/ensureRunDir。
 * 用真实临时目录验证版本化文件、原子写（无残留 tmp）、并发写与重启恢复。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { createRunStore } from '../lib/run-store.js'

const base = mkdtempSync(join(tmpdir(), 'bs-store-'))
let seq = 0
let dir

beforeEach(() => {
  dir = join(base, `case-${seq++}`)
})

after(() => rmSync(base, { recursive: true, force: true }))

const runFixture = (id, patch = {}) => ({
  version: 1,
  id,
  bugId: `BUG-${id}`,
  state: 'draft',
  createdAt: 1,
  updatedAt: 1,
  ...patch,
})

test('persists runs with a versioned JSON file and reads them back after reopen', async () => {
  const store = createRunStore({ dir })
  await store.put(runFixture('r1'))
  await store.put(runFixture('r2', { state: 'confirmed' }))
  await store.flush()

  const raw = JSON.parse(readFileSync(join(dir, 'runs.json'), 'utf8'))
  assert.equal(raw.version, 1)
  assert.equal(raw.runs.r1.bugId, 'BUG-r1')
  assert.equal(raw.runs.r2.state, 'confirmed')

  const reopened = createRunStore({ dir })
  assert.deepEqual(await reopened.get('r1'), runFixture('r1'))
  assert.deepEqual(
    (await reopened.list()).map((run) => run.id).sort(),
    ['r1', 'r2'],
  )
})

test('returns a defensive copy so callers cannot mutate stored state', async () => {
  const store = createRunStore({ dir })
  const run = runFixture('r1')
  await store.put(run)
  run.state = 'hacked'
  const loaded = await store.get('r1')
  loaded.state = 'also-hacked'
  assert.equal((await store.get('r1')).state, 'draft')
})

test('serializes concurrent writes and leaves no temp files behind', async () => {
  const store = createRunStore({ dir })
  await Promise.all(Array.from({ length: 12 }, (_, i) => store.put(runFixture(`r${i}`, { createdAt: i }))))
  await store.flush()

  const entries = readdirSync(dir)
  assert.deepEqual(entries, ['runs.json'], `unexpected files: ${entries.join(', ')}`)
  const raw = JSON.parse(readFileSync(join(dir, 'runs.json'), 'utf8'))
  assert.equal(Object.keys(raw.runs).length, 12)
})

test('remove deletes a run from the table', async () => {
  const store = createRunStore({ dir })
  await store.put(runFixture('r1'))
  await store.put(runFixture('r2'))
  await store.remove('r1')
  assert.equal(await store.get('r1'), null)
  assert.deepEqual((await store.list()).map((run) => run.id), ['r2'])
})

test('ensureRunDir creates one directory per run', async () => {
  const store = createRunStore({ dir })
  const runDir = await store.ensureRunDir('r1')
  assert.ok(existsSync(runDir))
  assert.equal(runDir, join(dir, 'runs', 'r1'))
})

test('rejects an unknown store version instead of guessing', async () => {
  const store = createRunStore({ dir })
  await store.put(runFixture('r1'))
  await store.flush()
  writeFileSync(join(dir, 'runs.json'), JSON.stringify({ version: 99, runs: {} }), 'utf8')

  await assert.rejects(createRunStore({ dir }).list(), (error) => {
    assert.equal(error.code, 'store/bad-version')
    return true
  })
})

test('reports corrupt store JSON clearly', async () => {
  const dir2 = join(base, 'corrupt')
  const store = createRunStore({ dir: dir2 })
  await store.put(runFixture('r1'))
  await store.flush()
  writeFileSync(join(dir2, 'runs.json'), '{not json', 'utf8')

  await assert.rejects(createRunStore({ dir: dir2 }).get('r1'), (error) => {
    assert.equal(error.code, 'store/corrupt')
    return true
  })
})

test('rejects runs without an id', async () => {
  const store = createRunStore({ dir })
  await assert.rejects(store.put({ state: 'draft' }), (error) => {
    assert.equal(error.code, 'store/bad-run')
    return true
  })
})
