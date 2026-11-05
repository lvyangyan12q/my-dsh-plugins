/**
 * Day-file storage behaviour: one digest per day, an index that names them,
 * atomic replacement, the 8 MiB ceiling and the 30-day retention window.
 *
 * Everything here runs against a real temporary directory, because the
 * guarantee under test ("a failed write keeps the previous file") lives in the
 * filesystem, not in a mock.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import {
  MAX_DAY_BYTES,
  RETENTION_DAYS,
  pruneExpired,
  readDayDigest,
  readIndex,
  storagePaths,
  writeDayDigest,
} from '../src/storage.js'

const homes = []

function tempRoot() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-store-'))
  homes.push(home)
  return join(home, 'paper-reader')
}

afterEach(() => {
  while (homes.length > 0) rmSync(homes.pop(), { recursive: true, force: true })
})

function dayDigest(date, count = 2) {
  return {
    schemaVersion: 2,
    date,
    generatedAt: `${date}T09:02:00+08:00`,
    run: { status: 'ok', finishedAt: `${date}T09:03:00+08:00`, sources: [{ id: 'arxiv', status: 'ok', items: count }] },
    items: Array.from({ length: count }, (_, index) => ({
      id: `${date}-item-${index}`,
      source: 'arxiv',
      sourceId: 'arxiv',
      sourceLanguage: 'en',
      title: { original: `Title ${index}`, translation: `标题 ${index}` },
      summary: { original: 'Summary', translation: '摘要' },
      direction: 'agent',
      excerpt: false,
      blocks: [{ type: 'paragraph', original: 'Body.', translation: '正文。' }],
    })),
  }
}

function dayFiles(root) {
  try {
    return readdirSync(storagePaths(root).digestDir).sort()
  } catch {
    return []
  }
}

test('writing one day produces digest/YYYY-MM-DD.json and an index naming it', async () => {
  const root = tempRoot()
  const digest = dayDigest('2026-11-04')
  const result = await writeDayDigest({ root, digest, now: new Date('2026-11-04T09:05:00Z') })

  assert.deepEqual(dayFiles(root), ['2026-11-04.json'])
  assert.equal(readFileSync(storagePaths(root).dayPath('2026-11-04'), 'utf8'), JSON.stringify(digest))
  assert.equal(result.bytes, Buffer.byteLength(JSON.stringify(digest)))

  const { index, missing } = await readIndex({ root })
  assert.equal(missing, false)
  assert.equal(index.schemaVersion, 2)
  assert.equal(index.updatedAt, '2026-11-04T09:05:00.000Z')
  assert.equal(index.retentionDays, RETENTION_DAYS)
  assert.deepEqual(index.days.map(day => day.date), ['2026-11-04'])
  assert.equal(index.days[0].items, 2)
  assert.equal(index.days[0].bytes, result.bytes)
  assert.equal(index.days[0].runStatus, 'ok')
  assert.deepEqual(index.days[0].sources, [{ id: 'arxiv', status: 'ok', items: 2 }])
})

test('reading one day returns the stored document and rejects an unknown date', async () => {
  const root = tempRoot()
  const digest = dayDigest('2026-11-04', 3)
  await writeDayDigest({ root, digest, now: new Date('2026-11-04T09:05:00Z') })

  const read = await readDayDigest({ root, date: '2026-11-04' })
  assert.equal(read.digest.date, '2026-11-04')
  assert.equal(read.digest.items.length, 3)

  await assert.rejects(
    readDayDigest({ root, date: '2026-11-05' }),
    error => error.code === 'digest_missing' && error.status === 404,
  )
  await assert.rejects(
    readDayDigest({ root, date: '2026-13-40' }),
    error => error.code === 'digest_invalid_date' && error.status === 400,
  )
})

test('a second write for the same date replaces the file and keeps one index entry', async () => {
  const root = tempRoot()
  await writeDayDigest({ root, digest: dayDigest('2026-11-04', 1), now: new Date('2026-11-04T09:05:00Z') })
  await writeDayDigest({ root, digest: dayDigest('2026-11-04', 4), now: new Date('2026-11-04T10:00:00Z') })

  assert.deepEqual(dayFiles(root), ['2026-11-04.json'])
  const { index } = await readIndex({ root })
  assert.equal(index.days.length, 1)
  assert.equal(index.days[0].items, 4)
  assert.equal(index.updatedAt, '2026-11-04T10:00:00.000Z')
})

test('index lists days newest first and never leaves a temporary file behind', async () => {
  const root = tempRoot()
  await writeDayDigest({ root, digest: dayDigest('2026-11-02'), now: new Date('2026-11-02T09:05:00Z') })
  await writeDayDigest({ root, digest: dayDigest('2026-11-04'), now: new Date('2026-11-04T09:05:00Z') })
  await writeDayDigest({ root, digest: dayDigest('2026-11-03'), now: new Date('2026-11-03T09:05:00Z') })

  const { index } = await readIndex({ root })
  assert.deepEqual(index.days.map(day => day.date), ['2026-11-04', '2026-11-03', '2026-11-02'])
  assert.deepEqual(dayFiles(root), ['2026-11-02.json', '2026-11-03.json', '2026-11-04.json'])
  assert.ok(dayFiles(root).every(name => !name.startsWith('.')))
})

test('a day file over 8 MiB is rejected and the previous file stays readable', async () => {
  const root = tempRoot()
  const previous = dayDigest('2026-11-04', 1)
  await writeDayDigest({ root, digest: previous, now: new Date('2026-11-04T09:05:00Z') })

  const oversized = { ...dayDigest('2026-11-04', 1), filler: 'x'.repeat(MAX_DAY_BYTES) }
  await assert.rejects(
    writeDayDigest({ root, digest: oversized, now: new Date('2026-11-04T10:00:00Z') }),
    error => error.code === 'digest_too_large' && error.status === 413,
  )

  const stored = JSON.parse(readFileSync(storagePaths(root).dayPath('2026-11-04'), 'utf8'))
  assert.equal(stored.items.length, 1)
  assert.equal(stored.filler, undefined)
  const { index } = await readIndex({ root })
  assert.equal(index.days[0].items, 1)
  assert.equal(index.updatedAt, '2026-11-04T09:05:00.000Z')
})

test('a stored day file larger than the ceiling reads as a 413 instead of a corrupt digest', async () => {
  const root = tempRoot()
  const paths = storagePaths(root)
  mkdirSync(paths.digestDir, { recursive: true })
  writeFileSync(paths.dayPath('2026-11-04'), JSON.stringify({ date: '2026-11-04', items: [], filler: 'x'.repeat(MAX_DAY_BYTES) }))

  await assert.rejects(
    readDayDigest({ root, date: '2026-11-04' }),
    error => error.code === 'digest_too_large' && error.status === 413,
  )
})

test('a corrupt or mismatched day file is an explicit error, not an empty day', async () => {
  const root = tempRoot()
  const paths = storagePaths(root)
  mkdirSync(paths.digestDir, { recursive: true })

  writeFileSync(paths.dayPath('2026-11-04'), '{broken')
  await assert.rejects(
    readDayDigest({ root, date: '2026-11-04' }),
    error => error.code === 'digest_invalid' && error.status === 422,
  )

  writeFileSync(paths.dayPath('2026-11-05'), JSON.stringify(dayDigest('2026-11-04')))
  await assert.rejects(
    readDayDigest({ root, date: '2026-11-05' }),
    error => error.code === 'digest_invalid' && error.status === 422,
  )

  writeFileSync(paths.dayPath('2026-11-06'), JSON.stringify({ date: '2026-11-06', items: [{ id: 1 }] }))
  await assert.rejects(
    readDayDigest({ root, date: '2026-11-06' }),
    error => error.code === 'digest_invalid' && error.status === 422,
  )
})

test('missing index is reported as missing; a corrupt index is a 422', async () => {
  const root = tempRoot()
  assert.deepEqual(await readIndex({ root }), { index: null, missing: true })

  mkdirSync(root, { recursive: true })
  writeFileSync(storagePaths(root).indexPath, '{broken')
  await assert.rejects(
    readIndex({ root }),
    error => error.code === 'index_invalid' && error.status === 422,
  )
})

test('retention keeps the newest 30 days and deletes older day files', async () => {
  const root = tempRoot()
  const dates = []
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(2026, 0, 31) - offset * 86_400_000).toISOString().slice(0, 10)
    dates.push(date)
    await writeDayDigest({ root, digest: dayDigest(date, 1), now: new Date(`${date}T09:05:00Z`) })
  }
  assert.equal((await readIndex({ root })).index.days.length, 30)

  const newest = dates[dates.length - 1]
  const extra = new Date(new Date(`${newest}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)
  const result = await writeDayDigest({ root, digest: dayDigest(extra, 2), now: new Date(`${extra}T09:05:00Z`) })

  const { index } = await readIndex({ root })
  assert.equal(index.days.length, RETENTION_DAYS)
  assert.equal(index.days[0].date, extra)
  assert.equal(dayFiles(root).length, RETENTION_DAYS)
  assert.ok(!dayFiles(root).includes(`${dates[0]}.json`), 'the oldest day file is pruned')
  assert.ok(result.pruned.deleted.includes(dates[0]))
})

test('a prune failure is reported but never blocks the day write', async () => {
  const root = tempRoot()
  // A directory named like a day file makes unlink fail on every platform.
  mkdirSync(join(storagePaths(root).digestDir, '2026-01-01.json'), { recursive: true })

  const result = await writeDayDigest({
    root,
    digest: dayDigest('2026-02-15', 2),
    now: new Date('2026-02-15T09:05:00Z'),
  })

  assert.equal(result.date, '2026-02-15')
  assert.deepEqual(result.pruned.failed.map(entry => entry.date), ['2026-01-01'])
  const { index } = await readIndex({ root })
  assert.deepEqual(index.days.map(day => day.date), ['2026-02-15'])
})

test('pruneExpired on its own only touches day-shaped files', async () => {
  const root = tempRoot()
  const paths = storagePaths(root)
  mkdirSync(paths.digestDir, { recursive: true })
  writeFileSync(paths.dayPath('2026-01-01'), '{}')
  writeFileSync(join(paths.digestDir, 'notes.txt'), 'keep me')

  const result = await pruneExpired({ root, today: '2026-02-15', retentionDays: 30 })
  assert.deepEqual(result.deleted, ['2026-01-01'])
  assert.deepEqual(readdirSync(paths.digestDir).sort(), ['notes.txt'])
  assert.ok(statSync(join(paths.digestDir, 'notes.txt')).size > 0)
})
