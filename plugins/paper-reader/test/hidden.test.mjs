import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { applyHidden, hiddenFor, hideItem, readHidden, unhideItem } from '../src/hidden.js'

const root = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-hidden-'))
after(() => rmSync(root, { recursive: true, force: true }))

test('a missing hide list hides nothing', async () => {
  const { hidden, missing } = await readHidden({ root })
  assert.equal(missing, true)
  assert.deepEqual(hidden.dates, {})
  assert.deepEqual(await hiddenFor({ root, date: '2026-11-10' }), [])
})

test('hiding an item records its url for that day and survives a re-read', async () => {
  await hideItem({ root, date: '2026-11-10', url: 'https://example.test/a' })
  await hideItem({ root, date: '2026-11-10', url: 'https://example.test/a' })
  const urls = await hiddenFor({ root, date: '2026-11-10' })
  assert.deepEqual(urls, ['https://example.test/a'], 'hiding twice stays one entry')
  assert.deepEqual(await hiddenFor({ root, date: '2026-11-09' }), [], 'other days are untouched')
  assert.ok(existsSync(join(root, 'hidden.json')))
})

test('applyHidden removes the listed urls only', () => {
  const items = [
    { id: '1', url: 'https://example.test/a' },
    { id: '2', url: 'https://example.test/b' },
    { id: '3', url: null },
  ]
  const visible = applyHidden(items, ['https://example.test/a'])
  assert.deepEqual(visible.map(item => item.id), ['2', '3'])
  assert.equal(applyHidden(items, []).length, 3)
})

test('undo puts the item back', async () => {
  await hideItem({ root, date: '2026-11-08', url: 'https://example.test/c' })
  await unhideItem({ root, date: '2026-11-08', url: 'https://example.test/c' })
  assert.deepEqual(await hiddenFor({ root, date: '2026-11-08' }), [])
})

test('a corrupt hide list degrades to hiding nothing', async () => {
  writeFileSync(join(root, 'hidden.json'), '{ not json', 'utf8')
  const { hidden, corrupt } = await readHidden({ root })
  assert.equal(corrupt, true)
  assert.deepEqual(hidden.dates, {})
})

test('an invalid date or url is rejected with a stable code', async () => {
  await assert.rejects(hideItem({ root, date: '10-11-2026', url: 'x' }), error => error.code === 'hidden_invalid_date')
  await assert.rejects(hideItem({ root, date: '2026-11-10', url: '' }), error => error.code === 'hidden_invalid_url')
})

test('the stored file is the documented shape', async () => {
  rmSync(join(root, 'hidden.json'), { force: true })
  await hideItem({ root, date: '2026-11-10', url: 'https://example.test/z' })
  const parsed = JSON.parse(readFileSync(join(root, 'hidden.json'), 'utf8'))
  assert.equal(parsed.schemaVersion, 1)
  assert.deepEqual(parsed.dates['2026-11-10'], ['https://example.test/z'])
})
