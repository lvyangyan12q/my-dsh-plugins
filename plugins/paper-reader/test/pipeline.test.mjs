/**
 * Pipeline seam: config discovery plus one full `runDaily` call.
 *
 * The run entry injects fetch and the clock, so every assertion here is about
 * observable output (digest, index, run record) rather than internal steps.
 * The arXiv fixtures are the same ones the adapter tests use.
 */
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { defaultConfig, loadConfig, validateConfig } from '../src/config.js'
import { runDaily, SOURCE_IDS, SOURCE_META } from '../src/pipeline/run.js'
import { SOURCES } from '../src/sources/registry.js'
import * as realStorage from '../src/storage.js'
import {
  readDayDigest,
  readIndex,
  readRunRecord,
  writeDayDigest,
} from '../src/storage.js'
import { fakeArxiv, FULL_TEXT } from './helpers/arxiv.mjs'

const DATE = '2026-11-04'
const NOW = () => new Date('2026-11-04T09:00:00+08:00')

/**
 * These tests describe the arXiv leg of the run; DeepSeek, HF and the blog
 * sources have their own fixture suites, so they are switched off here rather
 * than teaching the arXiv fake about other hosts. The default config still
 * enables all of them.
 */
function arxivOnly(config) {
  return {
    ...config,
    sources: {
      ...config.sources,
      deepseek: { ...config.sources.deepseek, enabled: false },
      hf: { ...config.sources.hf, enabled: false },
      anthropic: { ...config.sources.anthropic, enabled: false },
      kimi: { ...config.sources.kimi, enabled: false },
    },
  }
}

const homes = []
function tempRoot() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-pipeline-'))
  homes.push(home)
  return join(home, 'paper-reader')
}

afterEach(() => {
  while (homes.length > 0) rmSync(homes.pop(), { recursive: true, force: true })
})

test('a missing config file uses built-in defaults and creates nothing', async () => {
  const root = tempRoot()
  const loaded = await loadConfig({ root })

  assert.equal(loaded.exists, false)
  assert.equal(existsSync(loaded.path), false)
  assert.deepEqual(loaded.config.quota, { total: 10, papers: 6, blogs: 4 })
  assert.deepEqual(loaded.config.sources.arxiv.categories, ['cs.AI', 'cs.CL', 'cs.LG'])
  assert.equal(loaded.config.sources.arxiv.timeoutMs, 20_000)
  assert.equal(loaded.config.sources.arxiv.maxResults, 100)
  assert.equal(loaded.config.sources.deepseek.enabled, true)
  assert.equal(loaded.config.sources.deepseek.lookbackDays, 1)
  assert.equal(loaded.config.sources.deepseek.sitemapUrl, 'https://api-docs.deepseek.com/sitemap.xml')
  assert.equal(loaded.config.sources.anthropic.enabled, true)
  assert.equal(loaded.config.sources.anthropic.sitemapUrl, 'https://www.anthropic.com/sitemap.xml')
  assert.equal(loaded.config.sources.kimi.listUrl, 'https://www.kimi.com/blog/')
})

test('the registry is the only source metadata/default table the run and config use', async () => {
  const config = defaultConfig()
  assert.deepEqual(Object.keys(config.sources).sort(), [...SOURCE_IDS].sort())
  assert.deepEqual(SOURCE_META.map(source => source.id).sort(), [...SOURCE_IDS].sort())
  for (const id of SOURCE_IDS) {
    assert.equal(SOURCE_META.find(source => source.id === id).label, SOURCES[id].label)
    assert.equal(config.sources[id].useProxy, SOURCES[id].defaults.useProxy)
    assert.equal(typeof SOURCES[id].validateConfig, 'function', `${id} validates its own config keys`)
  }
  assert.deepEqual(config.selection, { sourceWeights: {}, institutions: [] })
  assert.equal(config.sources.openai.enabled, false, 'OpenAI stays opt-in until its terms review closes')

  // Validation comes from the registry entry, not a duplicate table here.
  const broken = { ...config, sources: { ...config.sources, arxiv: { ...config.sources.arxiv, baseUrl: 'nope' } } }
  assert.throws(
    () => validateConfig(broken),
    error => error.code === 'config_invalid' && /sources\.arxiv\.baseUrl/.test(error.message),
  )
})

test('selection.sourceWeights and selection.institutions are validated and reach the selector', async () => {
  const root = tempRoot()
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'config.json'), JSON.stringify({
    selection: { sourceWeights: { arxiv: 3 }, institutions: ['MIT'] },
  }))
  const { config } = await loadConfig({ root })
  assert.deepEqual(config.selection, { sourceWeights: { arxiv: 3 }, institutions: ['MIT'] })

  writeFileSync(join(root, 'config.json'), JSON.stringify({ selection: { sourceWeights: { arxiv: 'high' } } }))
  await assert.rejects(
    loadConfig({ root }),
    error => error.code === 'config_invalid' && /selection\.sourceWeights\.arxiv/.test(error.message),
  )
  writeFileSync(join(root, 'config.json'), JSON.stringify({ selection: { institutions: 'MIT' } }))
  await assert.rejects(
    loadConfig({ root }),
    error => error.code === 'config_invalid' && /selection\.institutions/.test(error.message),
  )
})

test('a user config is merged with defaults and never rewritten', async () => {
  const root = tempRoot()
  mkdirSync(root, { recursive: true })
  const path = join(root, 'config.json')
  const raw = JSON.stringify({
    quota: { total: 5, papers: 2 },
    sources: { arxiv: { categories: ['cs.CL'], keywords: ['agent'] } },
  })
  writeFileSync(path, raw)

  const loaded = await loadConfig({ root })
  assert.equal(loaded.exists, true)
  assert.deepEqual(loaded.config.quota, { total: 5, papers: 2, blogs: 4 })
  assert.deepEqual(loaded.config.sources.arxiv.categories, ['cs.CL'])
  assert.deepEqual(loaded.config.sources.arxiv.keywords, ['agent'])
  assert.equal(loaded.config.sources.arxiv.maxResults, 100, 'unset keys keep their defaults')
  assert.equal(readFileSync(path, 'utf8'), raw, 'the user file is not silently overwritten')
})

test('invalid config is an explicit error naming the file', async () => {
  const root = tempRoot()
  mkdirSync(root, { recursive: true })
  const path = join(root, 'config.json')

  writeFileSync(path, '{broken')
  await assert.rejects(loadConfig({ root }), error => error.code === 'config_invalid' && /config\.json/.test(error.message))

  writeFileSync(path, JSON.stringify({ quota: { papers: 'many' } }))
  await assert.rejects(
    loadConfig({ root }),
    error => error.code === 'config_invalid' && /quota\.papers/.test(error.message),
  )
})

test('a run writes the day digest, the index and a run record', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const { impl, calls } = fakeArxiv({ articles: FULL_TEXT })

  const result = await runDaily({ root, date: DATE, config: arxivOnly(config), fetch: impl, env: {}, now: NOW })

  assert.equal(result.exitCode, 0)
  assert.equal(result.status, 'ok')
  assert.equal(result.counts.items, 3)
  assert.equal(result.counts.excerpt, 1)
  assert.equal(result.counts.fullText, 2)
  assert.equal(calls.filter(url => url.includes('/html/')).length, 3)

  const { digest } = await readDayDigest({ root, date: DATE })
  assert.equal(digest.schemaVersion, 2)
  assert.deepEqual(digest.items.map(item => item.id), [
    'arxiv:2611.05377',
    'arxiv:2611.05380',
    'arxiv:2611.05382',
  ])

  const first = digest.items[0]
  assert.equal(first.sourceId, 'arxiv')
  assert.equal(first.sourceLanguage, 'en')
  assert.equal(first.title.original, 'Agentic Reasoning with Tool-Augmented Language Models')
  assert.equal(first.title.translation, null)
  assert.equal(first.translationState, 'pending')
  assert.equal(first.summary.translation, null)
  assert.equal(first.excerpt, false)
  assert.equal(first.direction, 'agent')
  assert.ok(first.authors.includes('Ada Lovelace'))
  assert.match(first.url, /^https:\/\/arxiv\.org\/abs\//)
  assert.ok(first.readingMinutes >= 1)
  assert.ok(first.blocks.some(block => block.type === 'equation'))
  assert.ok(first.blocks.some(block => block.type === 'figure'))
  assert.ok(first.blocks.some(block => block.type === 'code'))
  for (const block of first.blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') {
      assert.equal(block.translation, null, 'text blocks start untranslated')
      assert.equal(block.translationState, undefined, 'pending is derived from null translations')
    }
  }

  const excerptItem = digest.items[1]
  assert.equal(excerptItem.excerpt, true, 'a missing HTML page is an excerpt')
  assert.deepEqual(excerptItem.blocks.map(block => block.type), ['heading', 'paragraph'])
  assert.equal(excerptItem.blocks[0].original, 'Abstract')

  const run = digest.run
  assert.equal(run.status, 'ok')
  assert.deepEqual(run.sources, [{ id: 'arxiv', status: 'ok', items: 3 }])

  const { index } = await readIndex({ root })
  assert.deepEqual(index.days.map(day => day.date), [DATE])
  assert.equal(index.days[0].items, 3)
  assert.equal(index.days[0].runStatus, 'ok')

  const record = await readRunRecord({ root, date: DATE })
  assert.equal(record.status, 'ok')
  assert.equal(record.counts.candidates, 3)
  assert.equal(record.counts.items, 3)
  assert.deepEqual(record.sources.map(source => source.id), ['arxiv'])
  assert.equal(record.sources[0].requests, 4, 'one Atom request plus three article requests')
  assert.equal(record.sources[0].candidates, 3)
  assert.equal(record.sources[0].selected, 3)
  assert.equal(record.digest.written, true)
  assert.equal(record.digest.bytes, result.written.bytes)
  assert.equal(record.selection.duplicates, 0)
})

test('dry-run reports the same selection without writing any file', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const { impl, calls } = fakeArxiv({ articles: FULL_TEXT })

  const result = await runDaily({ root, date: DATE, config: arxivOnly(config), fetch: impl, env: {}, now: NOW, dryRun: true })

  assert.equal(result.exitCode, 0)
  assert.equal(result.dryRun, true)
  assert.equal(result.counts.items, 3)
  assert.equal(result.digest.items.length, 3)
  assert.equal(result.written.digest, null)
  assert.equal(result.written.run, null)
  assert.equal(existsSync(root), false, 'dry-run creates no data directory')
  assert.equal(calls.length, 4, 'dry-run still exercises the sources')
})

test('the configured paper quota limits both writes and article fetches', async () => {
  const root = tempRoot()
  const config = {
    ...(await loadConfig({ root })).config,
    quota: { total: 10, papers: 2, blogs: 4 },
  }
  const { impl, calls } = fakeArxiv({ articles: FULL_TEXT })

  const result = await runDaily({ root, date: DATE, config: arxivOnly(config), fetch: impl, env: {}, now: NOW })

  assert.equal(result.counts.items, 2)
  const { digest } = await readDayDigest({ root, date: DATE })
  assert.deepEqual(digest.items.map(item => item.id), ['arxiv:2611.05377', 'arxiv:2611.05380'])
  assert.equal(calls.filter(url => url.includes('/html/')).length, 2, 'unselected papers are never extracted')
  assert.equal(calls.includes('https://arxiv.org/html/2611.05382'), false)
})

test('an item with no summary omits the key instead of writing null', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  // A Kimi article can have no dek at all. Writing `summary: null` is rejected
  // by the digest contract, which used to cost the whole day's file.
  const adapters = {
    kimi: {
      list: () => [{
        id: 'kimi:no-summary',
        sourceId: 'kimi',
        title: 'Kimi post without a dek',
        url: 'https://www.kimi.com/blog/no-summary',
        sourceLanguage: 'en',
        publishedAt: '2026-11-04T01:00:00Z',
        summary: '',
      }],
      extract: () => ({
        blocks: [{ type: 'paragraph', original: 'Body text.' }],
        meta: {
          title: 'Kimi post without a dek',
          publishedAt: '2026-11-04T01:00:00Z',
          sourceLanguage: 'en',
          summary: '',
        },
      }),
    },
  }

  const result = await runDaily({
    root,
    date: DATE,
    config,
    source: 'kimi',
    fetch: async () => { throw new Error('unused in this test') },
    adapters,
    env: {},
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  const { digest } = await readDayDigest({ root, date: DATE })
  assert.equal(digest.items.length, 1)
  assert.equal('summary' in digest.items[0], false, 'the optional key is absent, not null')
  assert.equal(digest.items[0].summary, undefined)
})

test('a network failure is explicit, writes a failed run record and keeps the previous day', async () => {
  const root = tempRoot()
  const previous = {
    schemaVersion: 2,
    date: '2026-11-03',
    generatedAt: '2026-11-03T09:00:00+08:00',
    run: { status: 'ok', sources: [{ id: 'arxiv', status: 'ok', items: 1 }] },
    items: [{
      id: 'arxiv:2611.00001',
      sourceId: 'arxiv',
      sourceLanguage: 'en',
      title: { original: 'Yesterday paper', translation: null },
      blocks: [{ type: 'paragraph', original: 'Body.', translation: null }],
      translationState: 'pending',
    }],
  }
  await writeDayDigest({ root, digest: previous, now: new Date('2026-11-03T09:00:00Z') })

  const { config } = await loadConfig({ root })
  const offline = async () => { throw new Error('getaddrinfo ENOTFOUND export.arxiv.org') }
  const result = await runDaily({ root, date: DATE, config: arxivOnly(config), fetch: offline, env: {}, now: NOW })

  assert.equal(result.exitCode, 1)
  assert.equal(result.status, 'failed')
  assert.equal(result.written.digest, null)
  await assert.rejects(readDayDigest({ root, date: DATE }), error => error.code === 'digest_missing')

  const record = await readRunRecord({ root, date: DATE })
  assert.equal(record.status, 'failed')
  assert.equal(record.sources[0].status, 'failed')
  assert.match(record.sources[0].error, /ENOTFOUND/)

  const { index } = await readIndex({ root })
  assert.deepEqual(index.days.map(day => day.date), ['2026-11-03'], 'the previous index survives')
  const { digest } = await readDayDigest({ root, date: '2026-11-03' })
  assert.equal(digest.items[0].title.original, 'Yesterday paper')
})

test('one broken article degrades to an excerpt while the other papers stay full text', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const { impl } = fakeArxiv({
    articles: FULL_TEXT,
    failArticles: { '2611.05380': new Error('etimedout while reading article') },
  })

  const result = await runDaily({ root, date: DATE, config: arxivOnly(config), fetch: impl, env: {}, now: NOW })

  assert.equal(result.exitCode, 0)
  const { digest } = await readDayDigest({ root, date: DATE })
  const broken = digest.items.find(item => item.id === 'arxiv:2611.05380')
  const healthy = digest.items.find(item => item.id === 'arxiv:2611.05377')
  assert.equal(broken.excerpt, true)
  assert.equal(healthy.excerpt, false)
  assert.ok(healthy.blocks.some(block => block.type === 'equation'))

  const record = await readRunRecord({ root, date: DATE })
  assert.ok(record.warnings.some(warning => warning.id === 'arxiv:2611.05380' && /etimedout/.test(warning.message)))
  assert.equal(record.sources[0].status, 'ok', 'a per-item degradation does not fail the source')
})

test('--source narrows the run to the requested source', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const { impl } = fakeArxiv({ articles: FULL_TEXT })

  const result = await runDaily({ root, date: DATE, config, source: 'arxiv', fetch: impl, env: {}, now: NOW })

  assert.equal(result.exitCode, 0)
  assert.deepEqual(result.sources.map(source => source.id), ['arxiv'])
  const { digest } = await readDayDigest({ root, date: DATE })
  assert.equal(digest.items.length, 3)
  assert.deepEqual(digest.run.sources.map(source => source.id), ['arxiv'])
})

test('runDaily persists only through the injected storage port', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const { impl } = fakeArxiv({ articles: FULL_TEXT })
  const calls = []
  const port = {
    ...realStorage,
    readRunRecord: async (args) => {
      calls.push('readRunRecord')
      return realStorage.readRunRecord(args)
    },
    readSourceState: async (args) => {
      calls.push('readSourceState')
      return realStorage.readSourceState(args)
    },
    writeDayDigest: async (args) => {
      calls.push('writeDayDigest')
      return realStorage.writeDayDigest(args)
    },
    writeRunRecord: async (args) => {
      calls.push('writeRunRecord')
      return realStorage.writeRunRecord(args)
    },
    storagePaths: (args) => {
      calls.push('storagePaths')
      return realStorage.storagePaths(args)
    },
  }

  const result = await runDaily({
    root,
    date: DATE,
    config: arxivOnly(config),
    fetch: impl,
    env: {},
    now: NOW,
    storage: port,
  })

  assert.equal(result.exitCode, 0)
  assert.ok(calls.includes('readSourceState'))
  assert.ok(calls.includes('writeDayDigest'))
  assert.ok(calls.includes('writeRunRecord'))

  const failing = await runDaily({
    root,
    date: DATE,
    config: arxivOnly(config),
    fetch: impl,
    env: {},
    now: NOW,
    storage: {
      ...port,
      writeDayDigest: async () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }) },
    },
  })
  assert.equal(failing.exitCode, 1, 'a storage-port failure is reported, not thrown')
  assert.match(failing.errors.join(' '), /disk full/)
})

test('an unsupported --source and a malformed date are usage errors', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const { impl } = fakeArxiv()

  await assert.rejects(
    runDaily({ root, date: DATE, config, source: 'x', fetch: impl, env: {}, now: NOW }),
    error => error.code === 'unsupported_source' && error.exitCode === 2,
  )
  await assert.rejects(
    runDaily({ root, date: '2026-13-40', config, fetch: impl, env: {}, now: NOW }),
    error => error.code === 'invalid_date' && error.exitCode === 2,
  )
})
