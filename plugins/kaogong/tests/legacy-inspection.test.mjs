import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { inspectLegacy, writeLegacyInspection } from '../src/legacy-inspection.mjs'

const specs = { kaogong_bank: [2, 'questions'], kaogong_knowledge: [1, 'entries'], kaogong_lessons: [1, 'lessons'], kaogong_notebook: [1, 'questions'], kaogong_practice: [1, 'rounds'], kaogong_progress: [1, 'days'], personal_workbench_role_bindings: [1, 'bindings'] }
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-inspection-'))
  t.after(async () => {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(root))
    assert.ok(relative.startsWith('legacy-inspection-') && !relative.includes(path.sep))
    await fs.rm(root, { recursive: true, force: true })
  })
  const home = path.join(root, 'home')
  await fs.mkdir(path.join(home, 'storages'), { recursive: true })
  for (const [name, [version, table]] of Object.entries(specs)) {
    await fs.writeFile(path.join(home, 'storages', name + '.json'), JSON.stringify({ unit: { name, version }, global: null, tables: { [table]: {} } }))
  }
  return { root, home, output: path.join(root, 'preview.private.json') }
}
test('inspection preserves exact source bytes privately and emits only counts and hashes', async t => {
  const f = await fixture(t)
  const source = path.join(f.home, 'storages/kaogong_notebook.json')
  const raw = '{ "unit":{"name":"kaogong_notebook","version":1},"global":null,"tables":{"questions":{"private-id":{"answer":"secret","score":3,"order":[2,1]}}}}\n'
  await fs.writeFile(source, raw)
  const inspection = await inspectLegacy({ home: f.home })
  assert.equal(inspection.summary.counts.kaogong_notebook, 1)
  assert.equal(Buffer.from(inspection.snapshot.files.find(x => x.name === 'kaogong_notebook').bytesBase64, 'base64').toString(), raw)
  assert.doesNotMatch(JSON.stringify(inspection.summary), /private-id|secret|score|home/)
  await writeLegacyInspection({ home: f.home, output: f.output })
  assert.equal(await fs.readFile(source, 'utf8'), raw)
  await assert.rejects(writeLegacyInspection({ home: f.home, output: f.output }), { code: 'OUTPUT_EXISTS' })
})
test('unknown storage providers block instead of producing an empty inventory', async t => {
  const f = await fixture(t)
  await assert.rejects(inspectLegacy({ home: f.home, provider: 'unknown' }), { code: 'UNSUPPORTED_PROVIDER' })
})
test('one-command CLI requires explicit home and output and sanitizes failures', async t => {
  const f = await fixture(t)
  const script = fileURLToPath(new URL('../scripts/inspect-legacy.mjs', import.meta.url))
  const good = spawnSync(process.execPath, [script, '--home', f.home, '--output', f.output], { encoding: 'utf8' })
  assert.equal(good.status, 0, good.stderr)
  assert.equal(JSON.parse(good.stdout).status, 'inspection-only')
  const missing = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  assert.equal(missing.status, 1)
  assert.equal(missing.stderr.trim(), 'INSPECTION_BLOCKED: EXPLICIT_HOME_AND_OUTPUT_REQUIRED')
  assert.doesNotMatch(good.stdout + good.stderr + missing.stderr, new RegExp(f.root.replaceAll('\\', '\\\\')))
})
for (const [label, replacement, code] of [
  ['malformed JSON', '{', 'MALFORMED_SOURCE'],
  ['unknown version', JSON.stringify({ unit: { name: 'kaogong_bank', version: 99 }, global: null, tables: { questions: {} } }), 'UNSUPPORTED_SOURCE_VERSION'],
  ['unknown tables', JSON.stringify({ unit: { name: 'kaogong_bank', version: 2 }, global: null, tables: { other: {} } }), 'MALFORMED_SOURCE'],
  ['missing source', null, 'SOURCE_UNAVAILABLE'],
]) test(label + ' blocks snapshot creation', async t => {
  const f = await fixture(t)
  const target = path.join(f.home, 'storages/kaogong_bank.json')
  if (replacement === null) await fs.unlink(target)
  else await fs.writeFile(target, replacement)
  await assert.rejects(writeLegacyInspection({ home: f.home, output: f.output }), { code })
  await assert.rejects(fs.stat(f.output), { code: 'ENOENT' })
})
test('a concurrent source edit blocks the stale snapshot', async t => {
  const f = await fixture(t)
  let reads = 0
  const io = { ...fs, readFile: async target => {
    const bytes = await fs.readFile(target)
    if (++reads === 7) await fs.writeFile(path.join(f.home, 'storages/kaogong_bank.json'), JSON.stringify({ unit: { name: 'kaogong_bank', version: 2 }, global: null, tables: { questions: { newer: { answer: 'B' } } } }))
    return bytes
  } }
  await assert.rejects(writeLegacyInspection({ home: f.home, output: f.output, io }), { code: 'SOURCE_CHANGED' })
  await assert.rejects(fs.stat(f.output), { code: 'ENOENT' })
})
test('notes and unverified materials stay private; foreign bindings are retained but excluded from plan inputs', async t => {
  const f = await fixture(t)
  const bindings = { own: { key: { appId: 'kaogong' }, sessionId: 's1', previousSessionIds: ['s0'], presetId: 'p', selectedPreset: false, creation: { cwd: '/unchanged' }, phase: 'unknown' }, foreign: { key: { appId: 'reading' }, sessionId: 'foreign' } }
  await fs.writeFile(path.join(f.home, 'storages/personal_workbench_role_bindings.json'), JSON.stringify({ unit: { name: 'personal_workbench_role_bindings', version: 1 }, global: null, tables: { bindings } }))
  await fs.writeFile(path.join(f.home, 'storages/kaogong_knowledge.json'), JSON.stringify({ unit: { name: 'kaogong_knowledge', version: 1 }, global: null, tables: { entries: { note: { kind: '笔记' }, material: { kind: '讲义', source: '/unverified/material.md' } } } }))
  const { summary, snapshot } = await inspectLegacy({ home: f.home })
  assert.deepEqual(summary.knowledge, { privateNotes: 1, unverifiedPrivate: 1, verifiedShareable: 0 })
  assert.deepEqual(summary.bindings, { kaogong: 1, retainedForeign: 1 })
  assert.deepEqual(snapshot.planInputs.kaogongBindings, [{ id: 'own', binding: bindings.own }])
  assert.equal(JSON.parse(Buffer.from(snapshot.files.find(x => x.name === 'personal_workbench_role_bindings').bytesBase64, 'base64')).tables.bindings.foreign.sessionId, 'foreign')
  assert.ok(snapshot.planInputs.knowledge.every(row => row.ownership === 'private'))
})
test('output inside source, including a directory alias, is rejected', async t => {
  const f = await fixture(t)
  await assert.rejects(writeLegacyInspection({ home: f.home, output: path.join(f.home, 'preview.json') }), { code: 'OUTPUT_IN_SOURCE' })
  const alias = path.join(f.root, 'alias')
  await fs.symlink(f.home, alias, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(writeLegacyInspection({ home: f.home, output: path.join(alias, 'preview.json') }), { code: 'OUTPUT_IN_SOURCE' })
})
test('storage directory symlink escaping explicit home is rejected', async t => {
  const f = await fixture(t)
  await fs.rename(path.join(f.home, 'storages'), path.join(f.root, 'outside'))
  await fs.symlink(path.join(f.root, 'outside'), path.join(f.home, 'storages'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(inspectLegacy({ home: f.home }), { code: 'SOURCE_PATH_ESCAPE' })
})
