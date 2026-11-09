/**
 * CLI behaviour: arguments, configuration location, exit codes and the
 * stdout/stderr contract. The command runs in-process with an injected fetch,
 * clock and streams, so these tests exercise the real entry point without
 * spawning a child process or reaching the network.
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { localDate, main, mainWithProxyBootstrap, parseArgs, proxyReexecPlan } from '../src/cli/main.js'
import { defaultConfig } from '../src/config.js'
import { readDayDigest, readRunRecord, storagePaths } from '../src/storage.js'
import { FULL_TEXT } from './helpers/arxiv.mjs'
import { fakeSources } from './helpers/sources.mjs'

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
    fetch: fakeSources().impl,
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
  assert.equal(await main(['--date', '2026-11-04', '--source', 'x'], unknownSource), 2)
  assert.match(unknownSource.stderr.text(), /"x"/)
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
  const raw = JSON.stringify({ quota: { total: 10, papers: 2 }, sources: { deepseek: { enabled: false } } })
  writeFileSync(configPath, raw)

  const stdout = sink()
  assert.equal(await main(['--date', '2026-11-04'], deps({ env: { DSH_HOME: home }, stdout })), 0)
  assert.equal(readFileSync(configPath, 'utf8'), raw)

  const { digest } = await readDayDigest({ root: dataRoot, date: '2026-11-04' })
  assert.equal(digest.items.length, 2)
  assert.ok(stdout.text().includes(storagePaths(dataRoot).dayPath('2026-11-04')))
})

/* ------------------------------------------------------------------ */
/* Configured proxy / self re-exec                                     */
/* ------------------------------------------------------------------ */

const CONFIG_WITH_PROXY = () => {
  const config = defaultConfig()
  config.proxy.url = 'http://proxy.local:3128'
  return config
}

test('--help is decided before the config file, so a broken config cannot hide usage', async () => {
  const home = tempHome()
  const root = join(home, 'paper-reader')
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'config.json'), '{broken')
  const stdout = sink()
  const code = await mainWithProxyBootstrap(['--help'], { env: { DSH_HOME: home }, stdout, stderr: sink() })
  assert.equal(code, 0)
  assert.match(stdout.text(), /Usage: paper-reader/)
})

test('a configured proxy.url makes the CLI re-exec once with NODE_USE_ENV_PROXY=1', async () => {
  const config = CONFIG_WITH_PROXY()
  const plan = proxyReexecPlan({ config, env: {} })
  assert.ok(plan, 'the configured URL needs the environment-proxy bridge')
  assert.equal(plan.env.HTTPS_PROXY, 'http://proxy.local:3128')
  assert.equal(plan.env.HTTP_PROXY, 'http://proxy.local:3128')
  assert.equal(plan.env.ALL_PROXY, 'http://proxy.local:3128')
  assert.equal(plan.env.NODE_USE_ENV_PROXY, '1')
  assert.equal(plan.env.PAPER_READER_PROXY_REEXEC, '1')

  const calls = []
  const spawn = (command, args, options) => {
    calls.push({ command, args, options })
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('exit', 0, null))
    return child
  }
  const stdout = sink()
  const code = await mainWithProxyBootstrap(['--date', '2026-11-04'], {
    config,
    env: {},
    entry: '/tmp/paper-reader.mjs',
    spawn,
    stdout,
    stderr: sink(),
    fetch: async () => { throw new Error('the parent must not run the pipeline') },
  })

  assert.equal(code, 0)
  assert.equal(calls.length, 1, 'exactly one restart, never a loop')
  assert.deepEqual(calls[0].args, ['/tmp/paper-reader.mjs', '--date', '2026-11-04'])
  assert.equal(calls[0].options.env.NODE_USE_ENV_PROXY, '1')
  assert.equal(calls[0].options.stdio, 'inherit')
  assert.equal(stdout.text(), '', 'the parent writes no digest output')
})

test('no restart loop: an enabled or already-bootstrapped environment keeps running in-process', () => {
  const config = CONFIG_WITH_PROXY()
  assert.equal(proxyReexecPlan({ config, env: { NODE_USE_ENV_PROXY: '1' } }), null)
  assert.equal(proxyReexecPlan({ config, env: { PAPER_READER_PROXY_REEXEC: '1' } }), null)
  assert.equal(proxyReexecPlan({ config: defaultConfig(), env: {} }), null, 'no configured URL, no restart')

  const fromEnv = proxyReexecPlan({ config: defaultConfig(), env: { HTTPS_PROXY: 'http://env-proxy.local:8080' } })
  assert.equal(fromEnv.env.HTTPS_PROXY, 'http://env-proxy.local:8080', 'an env proxy is exported for the child too')
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
