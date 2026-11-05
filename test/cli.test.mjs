/**
 * CLI behaviour: arguments, configuration location, exit codes and the
 * stdout/stderr contract. The command runs in-process with an injected fetch,
 * clock and streams, so these tests exercise the real entry point without
 * spawning a child process or reaching the network.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { localDate, main, parseArgs } from '../src/cli/main.js'
import { readDayDigest, readRunRecord, storagePaths } from '../src/storage.js'
import { fakeArxiv, FULL_TEXT } from './helpers/arxiv.mjs'

const homes = []

function tempHome() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-cli-'))
  homes.push(home)
  return home
}

function sink() {
  const chunks = []
  return {
    write(text) { chunks.push(String(text)) },
    text() { return chunks.join('') },
  }
}

function deps(overrides = {}) {
  return {
    env: { DSH_HOME: '' },
    now: () => new Date('2026-11-04T09:00:00+08:00'),
    fetch: fakeArxiv({ articles: FULL_TEXT }).impl,
    stdout: sink(),
    stderr: sink(),
    ...overrides,
  }
}

afterEach(() => {
  while (homes.length > 0) rmSync(homes.pop(), { recursive: true, force: true })
})

test('parses --date, --dry-run and --source', () => {
  assert.deepEqual(parseArgs(['--date', '2026-11-04', '--dry-run', '--source', 'arxiv']), {
    date: '2026-11-04',
    dryRun: true,
    source: 'arxiv',
    help: false,
  })
  assert.equal(parseArgs(['--date=2026-11-05']).date, '2026-11-05')
  assert.equal(parseArgs(['--source=arxiv']).source, 'arxiv')
  assert.throws(() => parseArgs(['--yesterday']), error => error.code === 'usage')
  assert.throws(() => parseArgs(['--date']), error => error.code === 'usage')
})

test('--help prints usage and exits zero', async () => {
  const stdout = sink()
  assert.equal(await main(['--help'], deps({ stdout })), 0)
  assert.match(stdout.text(), /--date/)
  assert.match(stdout.text(), /--dry-run/)
  assert.match(stdout.text(), /--source/)
})

test('an invalid date or an unknown source is a usage error with exit code 2', async () => {
  const invalidDate = deps({ stderr: sink() })
  assert.equal(await main(['--date', '2026-13-40'], invalidDate), 2)
  assert.match(invalidDate.stderr.text(), /2026-13-40/)

  const unknownSource = deps({ stderr: sink() })
  assert.equal(await main(['--date', '2026-11-04', '--source', 'hf'], unknownSource), 2)
  assert.match(unknownSource.stderr.text(), /hf/)
})

test('--dry-run writes nothing', async () => {
  const home = tempHome()
  const stdout = sink()
  const runDeps = deps({ env: { DSH_HOME: home }, stdout })

  assert.equal(await main(['--date', '2026-11-04', '--dry-run'], runDeps), 0)
  assert.match(stdout.text(), /dry-run/)
  assert.match(stdout.text(), /2026-11-04/)
  assert.equal(existsSync(join(home, 'paper-reader')), false)
})

test('a real run writes the day digest and leaves the user config untouched', async () => {
  const home = tempHome()
  const dataRoot = join(home, 'paper-reader')
  mkdirSync(dataRoot, { recursive: true })
  const configPath = join(dataRoot, 'config.json')
  const raw = JSON.stringify({ quota: { total: 10, papers: 2 } })
  writeFileSync(configPath, raw)

  const stdout = sink()
  assert.equal(await main(['--date', '2026-11-04'], deps({ env: { DSH_HOME: home }, stdout })), 0)
  assert.equal(readFileSync(configPath, 'utf8'), raw)

  const { digest } = await readDayDigest({ root: dataRoot, date: '2026-11-04' })
  assert.equal(digest.items.length, 2)
  assert.ok(stdout.text().includes(storagePaths(dataRoot).dayPath('2026-11-04')))
})

test('the default date is the local day of the injected clock', async () => {
  const home = tempHome()
  const stdout = sink()
  const now = new Date(2026, 10, 5, 12, 0, 0)
  assert.equal(localDate(now), '2026-11-05')

  assert.equal(await main(['--dry-run'], deps({
    env: { DSH_HOME: home },
    now: () => now,
    stdout,
  })), 0)
  assert.match(stdout.text(), /2026-11-05/)
})

test('an offline run exits 1, reports the failed source and records the run', async () => {
  const home = tempHome()
  const stderr = sink()
  const offline = deps({
    env: { DSH_HOME: home },
    stderr,
    fetch: async () => { throw new Error('getaddrinfo ENOTFOUND export.arxiv.org') },
  })

  assert.equal(await main(['--date', '2026-11-04'], offline), 1)
  assert.match(stderr.text(), /arxiv/)
  assert.match(stderr.text(), /ENOTFOUND/)

  const dataRoot = join(home, 'paper-reader')
  assert.equal(existsSync(storagePaths(dataRoot).dayPath('2026-11-04')), false)
  const record = await readRunRecord({ root: dataRoot, date: '2026-11-04' })
  assert.equal(record.status, 'failed')
})
