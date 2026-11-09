/**
 * Ticket 10: the run record is a 30-day, secret-free, machine-readable
 * account of what the daily pipeline did, and the install guide matches the
 * CLI a user can actually type.
 *
 * The storage tests use a real temporary directory because retention and
 * "latest run" are filesystem behaviour. The summary tests feed a full run
 * record (including fields that must never be exposed) through the same
 * function the read-only status route uses.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { main } from '../src/cli/main.js'
import { RETENTION_DAYS, readLatestRun, storagePaths, writeRunRecord } from '../src/storage.js'
import { summarizeRun } from '../src/status.js'

const homes = []

function tempRoot() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-status-'))
  homes.push(home)
  return join(home, 'paper-reader')
}

afterEach(() => {
  while (homes.length > 0) rmSync(homes.pop(), { recursive: true, force: true })
})

function runRecord(date, overrides = {}) {
  return {
    schemaVersion: 1,
    date,
    status: 'ok',
    dryRun: false,
    startedAt: `${date}T09:00:00+08:00`,
    finishedAt: `${date}T09:01:05+08:00`,
    durationMs: 65_000,
    counts: { items: 8 },
    sources: [{ id: 'arxiv', status: 'ok', items: 8 }],
    translation: { status: 'ok', tokensUsed: 0, tokenBudget: 300_000, budgetExceeded: false, pendingItems: 0 },
    ...overrides,
  }
}

function sink() {
  const chunks = []
  return {
    write(text) { chunks.push(String(text)) },
    text() { return chunks.join('') },
  }
}

test('run records keep the newest 30 days and prune older ones after a write', async () => {
  const root = tempRoot()
  const dates = []
  for (let offset = RETENTION_DAYS - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(2026, 0, 31) - offset * 86_400_000).toISOString().slice(0, 10)
    dates.push(date)
    await writeRunRecord({ root, date, record: runRecord(date) })
  }
  assert.equal(readdirSync(storagePaths(root).runsDir).length, RETENTION_DAYS)

  const newest = dates[dates.length - 1]
  const extra = new Date(new Date(`${newest}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)
  const result = await writeRunRecord({ root, date: extra, record: runRecord(extra) })

  assert.deepEqual(result.pruned.deleted, [dates[0]], 'the oldest run record is removed')
  assert.equal(readdirSync(storagePaths(root).runsDir).length, RETENTION_DAYS)
  assert.equal((await readLatestRun({ root })).date, extra)
})

test('retention only touches run-shaped files and never blocks a new record', async () => {
  const root = tempRoot()
  const paths = storagePaths(root)
  mkdirSync(paths.runsDir, { recursive: true })
  writeFileSync(join(paths.runsDir, 'notes.txt'), 'keep me')
  writeFileSync(paths.runPath('2026-01-01'), JSON.stringify(runRecord('2026-01-01')))

  const result = await writeRunRecord({
    root,
    date: '2026-02-15',
    record: runRecord('2026-02-15'),
    retentionDays: 30,
  })

  assert.deepEqual(result.pruned.deleted, ['2026-01-01'])
  assert.deepEqual(readdirSync(paths.runsDir).sort(), ['2026-02-15.json', 'notes.txt'])
})

test('the latest run is the newest date-shaped record, not a lexicographic accident', async () => {
  const root = tempRoot()
  await writeRunRecord({ root, date: '2026-09-30', record: runRecord('2026-09-30') })
  await writeRunRecord({ root, date: '2026-10-02', record: runRecord('2026-10-02') })
  await writeRunRecord({ root, date: '2026-09-01', record: runRecord('2026-09-01') })

  const latest = await readLatestRun({ root })
  assert.equal(latest.date, '2026-10-02')
  assert.equal(latest.record.counts.items, 8)
})

test('the status summary names the latest run, its counts, duration, sources and token budget', () => {
  const record = runRecord('2026-11-05', {
    status: 'partial',
    counts: { items: 7 },
    sources: [
      { id: 'arxiv', status: 'ok', items: 5 },
      { id: 'hf', status: 'skipped', code: 'proxy_auth', reason: 'proxy rejected the configured credentials', items: 0 },
      { id: 'kimi', status: 'failed', code: 'source_failed', reason: 'source_failed', error: 'HTTP 500', items: 0 },
    ],
    translation: {
      status: 'ok',
      tokensUsed: 1200,
      tokenBudget: 300_000,
      budgetExceeded: false,
      pendingItems: 2,
    },
  })

  const summary = summarizeRun(record, { date: '2026-11-05', path: 'runs/2026-11-05.json' })

  assert.equal(summary.date, '2026-11-05')
  assert.equal(summary.status, 'partial')
  assert.equal(summary.durationMs, 65_000)
  assert.equal(summary.items, 7)
  assert.equal(summary.translation.tokensUsed, 1200)
  assert.equal(summary.translation.tokenBudget, 300_000)
  assert.equal(summary.translation.pendingItems, 2)
  assert.deepEqual(summary.skippedSources.map(source => source.code), ['proxy_auth'])
  assert.deepEqual(summary.failedSources.map(source => source.code), ['source_failed'])
  assert.equal(summary.skippedSources[0].label, 'Hugging Face')
  assert.equal(summary.failedSources[0].label, 'Kimi')
})

test('the status summary never copies arbitrary run-record fields, so no secret can leak', () => {
  const record = runRecord('2026-11-05', {
    apiKey: 'sk-test-secret-key-do-not-leak',
    proxy: { url: 'http://user:secret@proxy.local:8080', apiKey: 'sk-test-secret-key-do-not-leak' },
    translation: {
      status: 'ok',
      tokensUsed: 1,
      tokenBudget: 300_000,
      budgetExceeded: false,
      pendingItems: 0,
      apiKey: 'sk-test-secret-key-do-not-leak',
    },
    env: { PAPER_READER_LLM_API_KEY: 'sk-test-secret-key-do-not-leak' },
  })

  const serialized = JSON.stringify(summarizeRun(record, { date: '2026-11-05' }))
  assert.equal(serialized.includes('sk-test-secret-key-do-not-leak'), false)
  assert.equal(serialized.includes('user:secret'), false)
})

test('the install guide and the CLI help agree on every documented pipeline command', async () => {
  const doc = readFileSync(new URL('../docs/INSTALL.md', import.meta.url), 'utf8')
  const stdout = sink()
  const code = await main(['--help'], {
    env: {},
    now: () => new Date('2026-11-05T09:00:00+08:00'),
    stdout,
    stderr: sink(),
  })
  const help = stdout.text()
  assert.equal(code, 0)

  for (const flag of ['--date', '--dry-run', '--source', '--help']) {
    assert.ok(help.includes(flag), `--help documents ${flag}`)
    assert.ok(doc.includes(flag), `INSTALL.md documents ${flag}`)
  }

  const documented = [...doc.matchAll(/node scripts\/paper-reader\.mjs([^\n`]*)/g)]
  assert.ok(documented.length >= 3, 'the guide shows the daily and manual commands')
  for (const [, args] of documented) {
    for (const flag of args.match(/--[a-z-]+/g) ?? []) {
      assert.ok(help.includes(flag), `--help covers documented flag ${flag}`)
    }
  }
})

test('the install guide covers schedule, install lifecycle, rollback and version locking', () => {
  const doc = readFileSync(new URL('../docs/INSTALL.md', import.meta.url), 'utf8')
  for (const phrase of [
    'DSH Schedule',
    '09:00',
    'Asia/Shanghai',
    'DTSTART;TZID=Asia/Shanghai',
    'RRULE:FREQ=DAILY',
    '每次运行新建会话',
    '错过',
    '手动补跑',
    'dsh plugin --profile web add',
    'dsh plugin --profile web remove',
    'engines.dsh',
    'incompatible-version',
    '回退',
  ]) {
    assert.ok(doc.includes(phrase), `INSTALL.md must mention ${phrase}`)
  }
})
