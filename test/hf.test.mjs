/**
 * Hugging Face daily-papers source.
 *
 * The HF official API is only reachable through the user's proxy, and its only
 * useful form is the dated daily list: `?date=YYYY-MM-DD`. An undated request
 * mixes several days in no meaningful order, so the adapter refuses to build
 * one. These tests pin the request form, the parsed fields and the upvote
 * ordering on a captured fixture; nothing here touches the network.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { defaultConfig } from '../src/config.js'
import { runDaily } from '../src/pipeline/run.js'
import { readDayDigest, readRunRecord } from '../src/storage.js'
import { DEFAULT_PROXY_HEALTH_URL } from '../src/proxy.js'
import { listHf } from '../src/sources/hf.js'
import { fakeArxiv, FULL_TEXT } from './helpers/arxiv.mjs'
import { fakeHf, HF_PAYLOAD } from './helpers/hf.mjs'

const DATE = '2026-11-04'
const NOW = () => new Date('2026-11-04T09:00:00+08:00')
const PROXY_ENV = { HTTPS_PROXY: 'http://proxy.local:8080' }

const roots = []
function tempRoot() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-hf-'))
  roots.push(home)
  return join(home, 'paper-reader')
}
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true })
})

/**
 * The two transports a run uses: a direct one for arXiv (list + article HTML)
 * and a proxied one that answers the health check and the HF daily list.
 */
function fakeTransports({ hfPayload = HF_PAYLOAD, hfStatus = 200, healthStatus = 200 } = {}) {
  const direct = fakeArxiv({ articles: FULL_TEXT })
  const hfCalls = []
  const healthCalls = []
  const proxyFetch = async (url) => {
    const target = String(url)
    if (target === DEFAULT_PROXY_HEALTH_URL) {
      healthCalls.push(target)
      return { ok: healthStatus >= 200 && healthStatus < 300, status: healthStatus, text: async () => '{}' }
    }
    hfCalls.push(target)
    return {
      ok: hfStatus >= 200 && hfStatus < 300,
      status: hfStatus,
      text: async () => hfPayload,
    }
  }
  return { direct, hfCalls, healthCalls, proxyFetch }
}

test('the daily list is requested in its dated form only', async () => {
  const { impl, calls } = fakeHf()
  await listHf({ date: DATE, fetch: impl })

  assert.deepEqual(calls, ['https://huggingface.co/api/daily_papers?date=2026-11-04&limit=50'])
  assert.ok(calls.every(url => !url.includes('hf-mirror')), 'no mirror is ever requested')
})

test('an undated list is refused before any request is made', async () => {
  const { impl, calls } = fakeHf()
  await assert.rejects(listHf({ date: null, fetch: impl }), error => error.code === 'hf_date_required')
  await assert.rejects(listHf({ date: '2026-11-4', fetch: impl }), error => error.code === 'hf_date_required')
  assert.deepEqual(calls, [], 'an undated daily list is never fetched')
})

test('the fixture is parsed into arXiv-backed candidates ordered by upvotes', async () => {
  const { impl } = fakeHf()
  const candidates = await listHf({ date: DATE, fetch: impl })

  assert.deepEqual(candidates.map(candidate => candidate.arxivId), [
    '2611.09001',
    '2611.09003',
    '2611.05377',
    '2611.09002',
  ])

  const top = candidates[0]
  assert.equal(top.id, 'hf:2611.09001')
  assert.equal(top.sourceId, 'hf')
  assert.equal(top.kind, 'paper')
  assert.equal(top.arxivId, '2611.09001')
  assert.equal(top.upvotes, 41)
  assert.equal(top.title, 'Self-Correcting Agents that Plan Ahead')
  assert.match(top.summary, /train an agent to plan/)
  assert.equal(top.aiSummary, 'An agent that verifies steps and repairs its own trajectories gains accuracy.')
  assert.deepEqual(top.aiKeywords, ['agents', 'planning'])
  assert.equal(top.githubRepo, 'https://github.com/example/plan')
  assert.equal(top.url, 'https://arxiv.org/abs/2611.09001', 'the body always comes from arXiv')
  assert.equal(top.publishedAt, '2026-11-03T15:00:00.000Z')
  assert.equal(top.direction, 'agent')
  assert.ok(top.tags.includes('agents'), 'AI keywords are searchable tags')
  assert.equal(top.sourceLanguage, 'en')

  assert.deepEqual(candidates.map(candidate => candidate.upvotes), [41, 7, 3, 0])
  assert.equal(candidates[3].githubRepo, null)
})
test('a run merges the HF board with arXiv without duplicates and takes bodies from arXiv', async () => {
  const root = tempRoot()
  const { direct, hfCalls, healthCalls, proxyFetch } = fakeTransports()

  const result = await runDaily({
    root,
    date: DATE,
    config: defaultConfig(),
    fetch: direct.impl,
    proxyFetch,
    env: PROXY_ENV,
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(healthCalls.length, 1, 'the proxy is checked once before the run')
  assert.deepEqual(hfCalls, [`https://huggingface.co/api/daily_papers?date=${DATE}&limit=50`])

  const { digest } = await readDayDigest({ root, date: DATE })
  assert.deepEqual(digest.items.map(item => item.id), [
    'hf:2611.09001',
    'hf:2611.09003',
    'hf:2611.05377',
    'arxiv:2611.05380',
    'arxiv:2611.05382',
    'hf:2611.09002',
  ])

  const shared = digest.items.filter(item => item.url === 'https://arxiv.org/abs/2611.05377')
  assert.equal(shared.length, 1, 'the arXiv and HF copies of a paper are one entry')
  assert.equal(shared[0].sourceId, 'hf')
  assert.equal(shared[0].excerpt, false)
  assert.ok(shared[0].blocks.some(block => block.type === 'equation'), 'the body came from the arXiv HTML')
  assert.ok(direct.calls.includes('https://arxiv.org/html/2611.05377'))
  assert.ok(direct.calls.every(url => !url.includes('huggingface.co')), 'HF is never fetched directly')
  assert.ok(!shared[0].tags.includes('hf'), 'tags describe the paper, not the transport')

  const hottest = digest.items[0]
  assert.equal(hottest.sourceId, 'hf')
  assert.equal(hottest.excerpt, true, 'no arXiv HTML for this paper yet is an excerpt, not a lost item')
  assert.ok(hottest.tags.includes('agents'), 'AI keywords are searchable tags')
  assert.equal(hottest.title.original, 'Self-Correcting Agents that Plan Ahead')

  assert.deepEqual(digest.run.sources.map(source => source.id), ['arxiv', 'hf'])
  assert.deepEqual(digest.run.sources.map(source => source.status), ['ok', 'ok'])

  const record = await readRunRecord({ root, date: DATE })
  assert.equal(record.counts.candidates, 7, 'three arXiv entries plus four HF entries before dedupe')
  assert.equal(record.selection.duplicates, 1)
  assert.equal(record.sources.find(source => source.id === 'hf').candidates, 4)
  assert.equal(record.sources.find(source => source.id === 'hf').selected, 4)
  assert.equal(record.sources.find(source => source.id === 'arxiv').selected, 2, 'arXiv still fills the rest of the quota')
})

test('an unconfigured proxy skips the HF board, leaves arXiv direct and records the reason', async () => {
  const root = tempRoot()
  const direct = fakeArxiv({ articles: FULL_TEXT })
  const proxyCalls = []
  const proxyFetch = async (url) => {
    proxyCalls.push(String(url))
    throw new Error('a source must never fall back to the proxy when none is configured')
  }

  const result = await runDaily({
    root,
    date: DATE,
    config: defaultConfig(),
    fetch: direct.impl,
    proxyFetch,
    env: {},
    now: NOW,
  })

  assert.equal(result.exitCode, 0, 'the direct source still produced the day')
  assert.equal(result.status, 'partial')
  assert.deepEqual(proxyCalls, [], 'nothing is probed without a proxy address')
  assert.ok(direct.calls.every(url => !url.includes('huggingface.co')), 'HF is never fetched directly')

  const { digest } = await readDayDigest({ root, date: DATE })
  assert.deepEqual(digest.items.map(item => item.id), [
    'arxiv:2611.05377',
    'arxiv:2611.05380',
    'arxiv:2611.05382',
  ], 'arXiv ranks itself and fills the papers quota')

  const skipped = digest.run.sources.find(source => source.id === 'hf')
  assert.equal(skipped.status, 'skipped')
  assert.equal(skipped.code, 'proxy_unconfigured')
  assert.match(skipped.reason, /未配置代理/)
  assert.equal(skipped.label, 'Hugging Face')

  const record = await readRunRecord({ root, date: DATE })
  assert.equal(record.sources.find(source => source.id === 'hf').status, 'skipped')
  assert.equal(record.proxy.code, 'proxy_unconfigured')
})

test('a proxy that fails its health check skips HF without a direct retry', async () => {
  const root = tempRoot()
  const { direct, proxyFetch } = fakeTransports({ healthStatus: 407 })

  const result = await runDaily({
    root,
    date: DATE,
    config: defaultConfig(),
    fetch: direct.impl,
    proxyFetch,
    env: PROXY_ENV,
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  const { digest } = await readDayDigest({ root, date: DATE })
  const skipped = digest.run.sources.find(source => source.id === 'hf')
  assert.equal(skipped.status, 'skipped')
  assert.equal(skipped.code, 'proxy_auth')
  assert.equal(digest.items.length, 3, 'arXiv supplies the whole day')
  assert.ok(direct.calls.every(url => !url.includes('huggingface.co')))
})

test('a failing HF list is one failed source, not a failed day', async () => {
  const root = tempRoot()
  const { direct, proxyFetch } = fakeTransports({ hfStatus: 500 })

  const result = await runDaily({
    root,
    date: DATE,
    config: defaultConfig(),
    fetch: direct.impl,
    proxyFetch,
    env: PROXY_ENV,
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.status, 'partial')
  const { digest } = await readDayDigest({ root, date: DATE })
  assert.equal(digest.items.length, 3)
  const hf = digest.run.sources.find(source => source.id === 'hf')
  assert.equal(hf.status, 'failed')
  assert.match(hf.error, /HTTP 500/)

  const record = await readRunRecord({ root, date: DATE })
  assert.match(record.sources.find(source => source.id === 'hf').error, /HTTP 500/)
})

test('--source hf lists only the board and still reads bodies from arXiv', async () => {
  const root = tempRoot()
  const { direct, hfCalls, proxyFetch } = fakeTransports()

  const result = await runDaily({
    root,
    date: DATE,
    config: defaultConfig(),
    source: 'hf',
    fetch: direct.impl,
    proxyFetch,
    env: PROXY_ENV,
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.deepEqual(hfCalls, [`https://huggingface.co/api/daily_papers?date=${DATE}&limit=50`])
  assert.ok(direct.calls.every(url => !url.includes('/api/query')), 'the arXiv list is not queried')
  assert.ok(direct.calls.includes('https://arxiv.org/html/2611.05377'), 'the body request goes to arXiv')

  const { digest } = await readDayDigest({ root, date: DATE })
  assert.deepEqual(digest.run.sources.map(source => source.id), ['hf'])
  assert.ok(digest.items.every(item => item.sourceId === 'hf'))
})

test('the source code offers no mirror and no undated daily-list entry point', () => {
  const sourceRoot = fileURLToPath(new URL('../src', import.meta.url))
  const files = readdirSync(sourceRoot, { recursive: true })
    .map(entry => String(entry))
    .filter(name => /\.(?:js|jsx|mjs)$/.test(name))
  assert.ok(files.length > 0)
  for (const file of files) {
    const text = readFileSync(join(sourceRoot, file), 'utf8')
    assert.doesNotMatch(text, /hf-mirror|hf\.co\/api|paperswithcode/i, `${file} must not use an HF mirror`)
  }
})
