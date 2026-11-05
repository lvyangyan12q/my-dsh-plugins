/**
 * OpenAI source: RSS listing, article-page extraction and the excerpt
 * degradation rules.
 *
 * The adapter takes an injected `fetch`, so every assertion runs on the
 * captured fixtures and never touches the network. The pipeline tests drive
 * the same adapter through `runDaily` with a fake proxy state, which is where
 * the "proxy unavailable → RSS excerpt" rule actually lives.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { defaultConfig } from '../src/config.js'
import { runDaily } from '../src/pipeline/run.js'
import { readDayDigest, readRunRecord } from '../src/storage.js'
import { listOpenAi } from '../src/sources/openai.js'
import { fakeArxiv, FULL_TEXT } from './helpers/arxiv.mjs'
import { fakeLlm, API_KEY, BASE_URL, MODEL } from './helpers/llm.mjs'
import { ARTICLE, fakeOpenai, RSS } from './helpers/openai.mjs'

const DATE = '2026-11-04'
const NOW = () => new Date('2026-11-04T09:00:00+08:00')
const ARTICLES = Object.fromEntries([
  'introducing-agent-mode',
  'gpt-5-system-card',
  'scaling-laws-for-reasoning',
  'codex-in-the-enterprise',
  'a-note-on-safety-practices',
].map(slug => [slug, ARTICLE]))

const homes = []
function tempRoot() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-openai-'))
  homes.push(home)
  return join(home, 'paper-reader')
}

afterEach(() => {
  while (homes.length > 0) rmSync(homes.pop(), { recursive: true, force: true })
})

/** Defaults with the arxiv and openai sources on and the other sources off. */
function testConfig(overrides = {}) {
  const config = defaultConfig()
  config.sources = {
    ...config.sources,
    arxiv: { ...config.sources.arxiv, enabled: true },
    deepseek: { ...config.sources.deepseek, enabled: false },
    // HF is proxied by default (ticket 07), so leaving it on would make the
    // default run `partial` in tests that only fake the OpenAI transport.
    hf: { ...config.sources.hf, enabled: false },
    // Anthropic/Kimi (ticket 06) are on by default too; this suite only fakes
    // arXiv and OpenAI, so both are switched off here as in the HF suite.
    anthropic: { ...config.sources.anthropic, enabled: false },
    kimi: { ...config.sources.kimi, enabled: false },
    openai: { ...config.sources.openai, enabled: true },
  }
  return { ...config, ...overrides, sources: { ...config.sources, ...(overrides.sources ?? {}) } }
}

/** A proxy transport that answers the health probe and then serves `impl`. */
function fakeProxy(impl) {
  const calls = []
  const transport = async (url, init) => {
    calls.push(String(url))
    if (String(url).includes('/health')) {
      return { ok: true, status: 200, text: async () => 'ok', json: async () => ({ ok: true }) }
    }
    return impl(url, init)
  }
  return { impl: transport, calls }
}

const PROXY_CONFIG = {
  url: 'http://127.0.0.1:7897',
  healthCheckUrl: 'https://proxy.example.test/health',
  timeoutMs: 8_000,
}

test('the RSS list yields blog candidates newest first, with title, dek, category and link', async () => {
  const { impl, calls } = fakeOpenai()

  const candidates = await listOpenAi({ config: {}, date: DATE, fetch: impl })

  assert.deepEqual(calls, ['https://openai.com/news/rss.xml'])
  assert.equal(candidates.length, 5)
  assert.deepEqual(candidates.map(candidate => candidate.id), [
    'openai:introducing-agent-mode',
    'openai:gpt-5-system-card',
    'openai:scaling-laws-for-reasoning',
    'openai:codex-in-the-enterprise',
    'openai:a-note-on-safety-practices',
  ])

  const newest = candidates[0]
  assert.equal(newest.sourceId, 'openai')
  assert.equal(newest.kind, 'blog')
  assert.equal(newest.sourceLanguage, 'en')
  assert.equal(newest.title, 'Introducing agent mode in ChatGPT')
  assert.equal(newest.url, 'https://openai.com/index/introducing-agent-mode/')
  assert.equal(newest.publishedAt, '2026-11-04T18:00:00.000Z')
  assert.equal(newest.published, '2026-11-04')
  assert.deepEqual(newest.categories, ['Product'])
  assert.ok(newest.tags.includes('Product'))
  assert.equal(
    newest.summary,
    'Agent mode lets ChatGPT plan and carry out multi-step tasks with the tools you already use & keeps you in control.',
    'the official dek is the summary, with entities decoded',
  )

  const times = candidates.map(candidate => Date.parse(candidate.publishedAt))
  assert.deepEqual(times, [...times].sort((left, right) => right - left), 'newest first')
  assert.ok(RSS.includes('<item>'))
})

test('a failed RSS request is a tagged openai error, not an empty list', async () => {
  const offline = fakeOpenai({ failRss: new Error('getaddrinfo ENOTFOUND openai.com') })
  await assert.rejects(
    listOpenAi({ config: {}, date: DATE, fetch: offline.impl }),
    error => error.code === 'openai_network' && error.sourceId === 'openai' && /ENOTFOUND/.test(error.message),
  )

  const notFound = fakeOpenai({ rss: '<html>maintenance</html>' })
  await assert.rejects(
    listOpenAi({ config: {}, date: DATE, fetch: notFound.impl }),
    error => error.code === 'openai_invalid' && error.sourceId === 'openai',
  )
})

test('the article page yields title, date, author and reader blocks', async () => {
  const { extractOpenAiArticle } = await import('../src/sources/openai.js')
  const { impl, calls } = fakeOpenai({ articles: { 'introducing-agent-mode': ARTICLE } })

  const extraction = await extractOpenAiArticle({
    candidate: {
      id: 'openai:introducing-agent-mode',
      url: 'https://openai.com/index/introducing-agent-mode/',
      title: 'Introducing agent mode in ChatGPT',
      summary: 'Agent mode lets ChatGPT plan and carry out multi-step tasks.',
      publishedAt: '2026-11-04T18:00:00.000Z',
    },
    config: {},
    fetch: impl,
  })

  assert.equal(extraction.excerpt, false)
  assert.deepEqual(extraction.warnings, [])
  assert.equal(extraction.title, 'Introducing agent mode in ChatGPT')
  assert.equal(extraction.publishedAt, '2026-11-04T18:00:00.000Z')
  assert.deepEqual(extraction.authors, ['OpenAI'])
  assert.deepEqual(calls, ['https://openai.com/index/introducing-agent-mode/'])

  const blocks = extraction.blocks
  assert.deepEqual(blocks.map(block => block.type), [
    'paragraph',
    'heading',
    'paragraph',
    'figure',
    'heading',
    'paragraph',
    'code',
  ])
  assert.equal(blocks[1].original, 'How agent mode works')
  assert.equal(blocks[1].level, 2)
  assert.match(blocks[2].original, /breaks a request into steps/)
  assert.equal(blocks[3].caption.original, 'Agent mode working through a multi-step task.')
  assert.equal(blocks[6].code, '{"mode": "agent"}')
  assert.equal(blocks[6].language, 'json')
  assert.ok(!blocks.some(block => block.original === 'OpenAI © 2026'), 'the footer is not article text')
  assert.ok(!blocks.some(block => block.original === 'News'), 'the site nav is not article text')
})

test('the defaults keep OpenAI opt-in and route only its article page through the proxy', () => {
  const config = defaultConfig()
  assert.equal(config.sources.openai.enabled, false, 'the RSS/article fetch ships opt-in')
  assert.equal(config.sources.openai.useProxy, true, 'OpenAI is a proxied source')
  assert.equal(config.sources.openai.extractViaProxy, true, 'only the article page needs the proxy')
  assert.equal(config.sources.openai.rssUrl, 'https://openai.com/news/rss.xml')
  assert.equal(config.sources.openai.extractFullText, true)
})

test('--source openai narrows the run to the blog source', async () => {
  const root = tempRoot()
  const openai = fakeOpenai({ articles: ARTICLES })
  const arxiv = fakeArxiv({ articles: FULL_TEXT })

  const result = await runDaily({
    root,
    date: DATE,
    config: testConfig(),
    source: 'openai',
    fetch: openai.impl,
    env: {},
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(arxiv.calls.length, 0)
  assert.deepEqual(result.sources.map(source => source.id), ['openai'])
  const { digest } = await readDayDigest({ root, date: DATE })
  assert.equal(digest.items.length, 4)
  assert.ok(digest.items.every(item => item.sourceId === 'openai' && item.excerpt === true))
})

test('turning the proxy switch off lets the article page go direct', async () => {
  const root = tempRoot()
  const openai = fakeOpenai({ articles: ARTICLES })
  const arxiv = fakeArxiv({ articles: FULL_TEXT })
  const fetchImpl = async (url, init) => String(url).includes('openai.com')
    ? openai.impl(url, init)
    : arxiv.impl(url, init)

  const result = await runDaily({
    root,
    date: DATE,
    config: testConfig({
      sources: { openai: { ...testConfig().sources.openai, useProxy: false } },
    }),
    fetch: fetchImpl,
    env: {},
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.counts.excerpt, 1, 'only the arXiv paper without HTML is an excerpt')
  assert.ok(openai.articleCalls().length >= 4, 'the article page was fetched directly')
  const { digest } = await readDayDigest({ root, date: DATE })
  assert.equal(digest.items.find(item => item.id === 'openai:introducing-agent-mode').excerpt, false)
})

test('without a proxy every OpenAI item stays an RSS excerpt and the article page is never requested', async () => {
  const root = tempRoot()
  const openai = fakeOpenai({ articles: ARTICLES })
  const arxiv = fakeArxiv({ articles: FULL_TEXT })
  const fetchImpl = async (url, init) => String(url).includes('openai.com')
    ? openai.impl(url, init)
    : arxiv.impl(url, init)

  const result = await runDaily({
    root,
    date: DATE,
    config: testConfig(),
    fetch: fetchImpl,
    env: {},
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.status, 'ok')
  assert.equal(result.counts.items, 7, '3 arXiv papers + 4 OpenAI blog items')
  assert.equal(result.counts.excerpt, 5, 'the arXiv excerpt plus the four OpenAI excerpts')
  assert.equal(result.counts.fullText, 2)
  assert.deepEqual(openai.articleCalls(), [], 'no proxy means no article-page bypass')

  const { digest } = await readDayDigest({ root, date: DATE })
  const openaiItems = digest.items.filter(item => item.sourceId === 'openai')
  assert.equal(openaiItems.length, 4)
  for (const item of openaiItems) {
    assert.equal(item.excerpt, true)
    assert.equal(item.excerptReason.code, 'proxy_unavailable')
    assert.match(item.excerptReason.message, /代理不可用/)
    assert.match(item.excerptReason.message, /节选/)
    assert.deepEqual(item.blocks.map(block => block.type), ['paragraph'])
    assert.equal(item.blocks[0].original, item.summary.original)
    assert.equal(item.blocks[0].translation, null, 'the dek still starts untranslated')
    assert.equal(item.summary.original.length > 0, true)
    assert.equal(item.url.startsWith('https://openai.com/index/'), true)
  }
  const openaiIds = openaiItems.map(item => item.id)
  assert.ok(openaiIds.includes('openai:introducing-agent-mode'))
  assert.equal(openaiIds.includes('openai:a-note-on-safety-practices'), false, 'the fifth item loses to the quota')

  const run = digest.run
  assert.deepEqual(run.sources.map(source => source.id), ['arxiv', 'openai'])
  assert.equal(run.sources[1].status, 'ok')
  assert.equal(run.proxy.status, 'unconfigured')

  const record = await readRunRecord({ root, date: DATE })
  const reported = record.sources.find(source => source.id === 'openai')
  assert.equal(reported.requests, 1, 'one RSS request, no article retries')
  assert.ok(record.warnings.some(warning => /代理不可用/.test(warning.message)))
})

test('with a healthy proxy the article page is extracted and becomes full text', async () => {
  const root = tempRoot()
  const openai = fakeOpenai({ articles: ARTICLES })
  const arxiv = fakeArxiv({ articles: FULL_TEXT })
  const proxy = fakeProxy(openai.impl)
  const directCalls = []
  const direct = async (url, init) => {
    directCalls.push(String(url))
    return String(url).includes('openai.com') ? openai.impl(url, init) : arxiv.impl(url, init)
  }

  const result = await runDaily({
    root,
    date: DATE,
    config: testConfig({ proxy: { ...PROXY_CONFIG } }),
    fetch: direct,
    proxyFetch: proxy.impl,
    env: {},
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.status, 'ok')
  assert.equal(result.counts.items, 7)
  assert.equal(result.counts.excerpt, 1, 'only the arXiv paper without HTML stays an excerpt')
  assert.deepEqual(directCalls.filter(url => url.includes('/index/')), [],
    'the RSS list is direct; only article pages go through the proxy')
  assert.equal(directCalls.filter(url => url.includes('/news/rss.xml')).length, 1)
  assert.equal(proxy.calls.filter(url => url.includes('/index/')).length, 4)

  const { digest } = await readDayDigest({ root, date: DATE })
  const newest = digest.items.find(item => item.id === 'openai:introducing-agent-mode')
  assert.equal(newest.excerpt, false)
  assert.equal(newest.excerptReason, undefined)
  assert.equal(newest.title.original, 'Introducing agent mode in ChatGPT')
  assert.equal(newest.publishedAt, '2026-11-04T18:00:00.000Z')
  assert.deepEqual(newest.authors, ['OpenAI'])
  assert.equal(newest.venue, 'OpenAI Product')
  assert.deepEqual(newest.tags, ['Product'])
  assert.ok(newest.blocks.some(block => block.type === 'heading' && block.original === 'How agent mode works'))
  assert.ok(newest.blocks.some(block => block.type === 'code'))
})

test('a single 403 degrades only its own item', async () => {
  const root = tempRoot()
  const openai = fakeOpenai({ articles: ARTICLES, statusArticles: { 'gpt-5-system-card': 403 } })
  const arxiv = fakeArxiv({ articles: FULL_TEXT })
  const proxy = fakeProxy(openai.impl)
  const direct = async (url, init) => String(url).includes('openai.com')
    ? openai.impl(url, init)
    : arxiv.impl(url, init)

  const result = await runDaily({
    root,
    date: DATE,
    config: testConfig({ proxy: { ...PROXY_CONFIG } }),
    fetch: direct,
    proxyFetch: proxy.impl,
    env: {},
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  const { digest } = await readDayDigest({ root, date: DATE })
  const blocked = digest.items.find(item => item.id === 'openai:gpt-5-system-card')
  const healthy = digest.items.find(item => item.id === 'openai:introducing-agent-mode')
  assert.equal(blocked.excerpt, true)
  assert.equal(blocked.excerptReason.code, 'http_403')
  assert.match(blocked.excerptReason.message, /403/)
  assert.equal(healthy.excerpt, false)
  assert.equal(result.sources.find(source => source.id === 'openai').status, 'ok')
})

test('a network failure on one article degrades only that item', async () => {
  const root = tempRoot()
  const openai = fakeOpenai({
    articles: ARTICLES,
    failArticles: { 'scaling-laws-for-reasoning': new Error('socket hang up') },
  })
  const arxiv = fakeArxiv({ articles: FULL_TEXT })
  const proxy = fakeProxy(openai.impl)
  const direct = async (url, init) => String(url).includes('openai.com')
    ? openai.impl(url, init)
    : arxiv.impl(url, init)

  await runDaily({
    root,
    date: DATE,
    config: testConfig({ proxy: { ...PROXY_CONFIG } }),
    fetch: direct,
    proxyFetch: proxy.impl,
    env: {},
    now: NOW,
  })

  const { digest } = await readDayDigest({ root, date: DATE })
  const failed = digest.items.find(item => item.id === 'openai:scaling-laws-for-reasoning')
  assert.equal(failed.excerpt, true)
  assert.equal(failed.excerptReason.code, 'network')
  assert.match(failed.excerptReason.detail, /socket hang up/)
  assert.equal(digest.items.find(item => item.id === 'openai:codex-in-the-enterprise').excerpt, false)
})

test('excerpts fill the blog quota but do not count as translated full text', async () => {
  const root = tempRoot()
  const openai = fakeOpenai({ articles: ARTICLES })
  const arxiv = fakeArxiv({ articles: FULL_TEXT })
  const llm = fakeLlm()
  const fetchImpl = async (url, init) => {
    const target = String(url)
    if (target.includes('/chat/completions')) return llm.impl(url, init)
    if (target.includes('openai.com')) return openai.impl(url, init)
    return arxiv.impl(url, init)
  }

  const result = await runDaily({
    root,
    date: DATE,
    config: testConfig(),
    fetch: fetchImpl,
    env: { PAPER_READER_LLM_BASE_URL: BASE_URL, PAPER_READER_LLM_API_KEY: API_KEY, PAPER_READER_LLM_MODEL: MODEL },
    now: NOW,
  })

  assert.equal(result.counts.items, 7)
  assert.equal(result.counts.excerpt, 5, 'both full text and excerpt items use the quota')
  assert.equal(result.counts.translated, 7, 'excerpt titles and deks are translated too')
  assert.equal(result.counts.fullTextTranslated, 2, 'excerpts stay out of the translated-full-text count')

  const { digest } = await readDayDigest({ root, date: DATE })
  const excerpt = digest.items.find(item => item.id === 'openai:introducing-agent-mode')
  assert.equal(excerpt.translationState, 'complete')
  assert.match(excerpt.title.translation, /^译:/)
  assert.match(excerpt.summary.translation, /^译:/)
  assert.match(excerpt.blocks[0].translation, /^译:/)
})

