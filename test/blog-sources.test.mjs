/**
 * Anthropic and Kimi blog adapters.
 *
 * The adapters take an injected `fetch`, so list parsing, article extraction,
 * per-article failure and the daily quota are all exercised against captured
 * fixtures without touching the network. The last two tests drive the real
 * pipeline: one fetch serves arXiv, both blogs and the fake translation
 * endpoint, and the assertions are about the digest the reader receives.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { loadConfig } from '../src/config.js'
import { runDaily } from '../src/pipeline/run.js'
import { readDayDigest, readRunRecord, readSourceState } from '../src/storage.js'
import { extractAnthropicArticle, listAnthropic } from '../src/sources/anthropic.js'
import { extractKimiArticle, listKimi } from '../src/sources/kimi.js'
import { fakeArxiv, FULL_TEXT } from './helpers/arxiv.mjs'
import { fakeBlogSources, fakePipelineFetch, SITEMAP_URL } from './helpers/blogs.mjs'
import { fakeLlm, API_KEY, BASE_URL, MODEL, unitsOf } from './helpers/llm.mjs'

const DATE = '2026-11-05'
const NOW = () => new Date('2026-11-05T09:00:00+08:00')
const ENV = {
  PAPER_READER_LLM_BASE_URL: BASE_URL,
  PAPER_READER_LLM_API_KEY: API_KEY,
  PAPER_READER_LLM_MODEL: MODEL,
}

const roots = []
function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-blogs-'))
  roots.push(root)
  return root
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true })
})

/**
 * The fake fetch here knows arXiv and the two blog hosts only. DeepSeek has its
 * own suite, and HF is proxied with its own suite, so both are switched off
 * rather than fed by the wrong fake.
 */
function withoutDeepSeek(config) {
  return {
    ...config,
    sources: {
      ...config.sources,
      deepseek: { ...config.sources.deepseek, enabled: false },
      hf: { ...config.sources.hf, enabled: false },
    },
  }
}

test('blog source config is merged over defaults and invalid keys are named', async () => {
  const root = tempRoot()
  mkdirSync(root, { recursive: true })
  const path = join(root, 'config.json')

  writeFileSync(path, JSON.stringify({ sources: { kimi: { enabled: false, maxCandidates: 5 } } }))
  const loaded = await loadConfig({ root })
  assert.equal(loaded.config.sources.kimi.enabled, false)
  assert.equal(loaded.config.sources.kimi.maxCandidates, 5)
  assert.equal(loaded.config.sources.kimi.listUrl, 'https://www.kimi.com/blog/', 'unset keys keep their defaults')
  assert.equal(loaded.config.sources.anthropic.enabled, true)

  writeFileSync(path, JSON.stringify({ sources: { anthropic: { recentDays: 0 } } }))
  await assert.rejects(
    loadConfig({ root }),
    error => error.code === 'config_invalid' && /sources\.anthropic\.recentDays/.test(error.message),
  )
})

/* ------------------------------------------------------------------ */
/* Anthropic                                                           */
/* ------------------------------------------------------------------ */

test('Anthropic sitemap lists only /news and /research, newest first, and diffs known URLs', async () => {
  const { impl } = fakeBlogSources()

  const { candidates, discovered } = await listAnthropic({
    config: {},
    date: DATE,
    fetch: impl,
  })

  assert.deepEqual(candidates.map(candidate => candidate.url), [
    'https://www.anthropic.com/news/claude-opus-4-5',
    'https://www.anthropic.com/research/agentic-coding',
    'https://www.anthropic.com/research/interpretability-update',
  ])
  assert.equal(candidates[0].id, 'anthropic:news/claude-opus-4-5')
  assert.equal(candidates[0].kind, 'blog')
  assert.equal(candidates[0].sourceId, 'anthropic')
  assert.equal(candidates[0].sourceLanguage, 'en')
  assert.equal(candidates[0].published, '2026-11-03')
  assert.equal(candidates[0].title, 'Claude Opus 4 5')
  assert.equal(
    candidates.some(candidate => candidate.url.includes('/features/')),
    false,
    'non-article sitemap prefixes are ignored',
  )
  assert.equal(
    candidates.some(candidate => candidate.url.includes('older-announcement')),
    false,
    'articles outside the recent window are ignored',
  )
  assert.equal(discovered.length, 4, 'every matching URL is remembered, not only the selected page')

  const diffed = await listAnthropic({
    config: {},
    date: DATE,
    fetch: impl,
    knownUrls: ['https://www.anthropic.com/news/claude-opus-4-5/'],
  })
  assert.deepEqual(diffed.candidates.map(candidate => candidate.url), [
    'https://www.anthropic.com/research/agentic-coding',
    'https://www.anthropic.com/research/interpretability-update',
  ])
})

test('Anthropic article extraction takes ld+json metadata and main#main-content prose', async () => {
  const { impl } = fakeBlogSources()
  const result = await extractAnthropicArticle({
    candidate: { title: 'fallback', url: 'https://www.anthropic.com/news/claude-opus-4-5' },
    config: {},
    fetch: impl,
  })

  assert.equal(result.excerpt, false)
  assert.equal(result.meta.title, 'Claude Opus 4.5 arrives')
  assert.equal(result.meta.summary, 'A faster Claude for coding agents.')
  assert.equal(result.meta.published, '2026-11-03')
  assert.deepEqual(result.meta.authors, ['Anthropic'])
  assert.deepEqual(result.meta.tags, [])

  const types = result.blocks.map(block => block.type)
  assert.ok(types.includes('heading'))
  assert.ok(types.includes('paragraph'))
  assert.ok(types.includes('code'))
  assert.ok(types.includes('figure'))

  const paragraphs = result.blocks.filter(block => block.type === 'paragraph').map(block => block.original)
  assert.ok(paragraphs.includes('A faster Claude for coding agents.'))
  assert.ok(paragraphs.includes('Opus 4.5 plans farther ahead and keeps more of a long repository in view.'))
  assert.ok(paragraphs.includes('Longer context'), 'list items are readable paragraphs')

  const code = result.blocks.find(block => block.type === 'code')
  assert.equal(code.language, 'ts')
  assert.match(code.code, /claude\.messages\.create/)

  const figure = result.blocks.find(block => block.type === 'figure')
  assert.equal(figure.image, 'https://www.anthropic.com/images/agents.png')
  assert.equal(figure.caption.original, 'A coding agent at work.')

  const headings = result.blocks.filter(block => block.type === 'heading').map(block => block.original)
  assert.deepEqual(headings, ['What changed'], 'the page title is not repeated as a body heading')

  const text = JSON.stringify(result.blocks)
  assert.doesNotMatch(text, /Leaked JSON headline|application\/ld\+json|display: none/, 'script/style content never reaches a block')
  assert.doesNotMatch(text, /Related reading|Footer boilerplate/, 'chrome outside the article is skipped')
})

test('an Anthropic page without main#main-content fails as a per-article error', async () => {
  const fetch = async () => ({ ok: true, status: 200, text: async () => '<html><body><p>Nothing here</p></body></html>' })
  await assert.rejects(
    extractAnthropicArticle({
      candidate: { title: 'x', url: 'https://www.anthropic.com/news/x' },
      config: {},
      fetch,
    }),
    error => error.code === 'anthropic_extract' && error.sourceId === 'anthropic',
  )
})

/* ------------------------------------------------------------------ */
/* Kimi                                                                */
/* ------------------------------------------------------------------ */

test('Kimi list parses card title, date and the English article link', async () => {
  const { impl } = fakeBlogSources()
  const { candidates } = await listKimi({ config: {}, date: DATE, fetch: impl })

  assert.deepEqual(candidates.map(candidate => candidate.title), ['Kimi K3.1 Pro', 'Kimi K3', 'Kimi K2.5'])
  assert.deepEqual(candidates.map(candidate => candidate.published), ['2026-10-24', '2026-10-20', '2026-10-12'])
  assert.deepEqual(candidates.map(candidate => candidate.url), [
    'https://www.kimi.com/en/blog/kimi-k3-1-pro',
    'https://www.kimi.com/en/blog/kimi-k3',
    'https://www.kimi.com/en/blog/kimi-k2-5',
  ])
  assert.equal(candidates[0].id, 'kimi:kimi-k3-1-pro')
  assert.equal(candidates[0].kind, 'blog')
  assert.equal(candidates[0].sourceLanguage, 'en')
  assert.equal(
    candidates.some(candidate => candidate.title === 'Kimi K1'),
    false,
    'cards outside the recent window are ignored',
  )
})

test('Kimi article extraction uses main.layout-content and collapses light/dark duplicate images', async () => {
  const { impl } = fakeBlogSources()
  const result = await extractKimiArticle({
    candidate: {
      title: 'Kimi K3.1 Pro',
      url: 'https://www.kimi.com/en/blog/kimi-k3-1-pro',
      publishedAt: '2026-10-24',
    },
    config: {},
    fetch: impl,
  })

  assert.equal(result.excerpt, false)
  assert.equal(result.meta.title, 'Kimi K3.1 Pro')
  assert.equal(result.meta.summary, 'Kimi K3.1 Pro is our newest model.')
  assert.deepEqual(result.meta.authors, ['Kimi'])
  assert.equal(result.meta.published, '2026-10-24', 'the list date fills in the missing datePublished')

  const paragraphs = result.blocks.filter(block => block.type === 'paragraph').map(block => block.original)
  assert.ok(paragraphs.includes('Kimi K3.1 Pro is our newest model for long-horizon coding work.'))
  assert.ok(paragraphs.includes('The model keeps a persistent plan across tool calls and revisions.'))

  const images = result.blocks.filter(block => block.type === 'figure').map(block => block.image)
  assert.deepEqual(images, [
    'https://www.kimi.com/assets/kimi-hero.png',
    'https://www.kimi.com/assets/kimi-chart.png',
  ])
  assert.equal(new Set(images).size, images.length, 'the light/dark copy of the hero image appears once')
  assert.doesNotMatch(JSON.stringify(result.blocks), /dark-mode duplicate|window\.__DATA__/)
})

test('a Kimi page without main.layout-content fails as a per-article error', async () => {
  const fetch = async () => ({ ok: true, status: 200, text: async () => '<html><body><main><p>Nothing here</p></main></body></html>' })
  await assert.rejects(
    extractKimiArticle({
      candidate: { title: 'x', url: 'https://www.kimi.com/en/blog/x' },
      config: {},
      fetch,
    }),
    error => error.code === 'kimi_extract' && error.sourceId === 'kimi',
  )
})

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

test('blog sources share the 4-item quota, are translated and land in the v2 digest', async () => {
  const root = tempRoot()
  const config = withoutDeepSeek((await loadConfig({ root })).config)
  const llm = fakeLlm()
  const blogFetch = fakeBlogSources()
  const arxiv = fakeArxiv({ articles: FULL_TEXT })

  const result = await runDaily({
    root,
    date: DATE,
    config,
    env: ENV,
    fetch: fakePipelineFetch({ llm, arxiv, blogs: blogFetch }),
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.status, 'ok')
  assert.equal(result.counts.items, 7, 'three papers plus four blog posts')
  assert.equal(result.counts.translated, 7)

  const { digest } = await readDayDigest({ root, date: DATE })
  assert.equal(digest.schemaVersion, 2)
  assert.equal(digest.sources.find(source => source.id === 'anthropic').label, 'Anthropic')
  assert.equal(digest.sources.find(source => source.id === 'kimi').label, 'Kimi')

  const blogs = digest.items.filter(item => item.sourceId === 'anthropic' || item.sourceId === 'kimi')
  assert.equal(blogs.length, 4, 'the blog quota is shared by both sources')
  assert.deepEqual([...new Set(blogs.map(item => item.sourceId))].sort(), ['anthropic', 'kimi'])
  for (const item of blogs) {
    assert.equal(item.sourceLanguage, 'en')
    assert.equal(item.translationState, 'complete')
    assert.match(item.title.translation, /^译:/)
    assert.ok(item.blocks.some(block => block.type === 'paragraph' && block.translation?.startsWith('译:')))
  }

  const kimis = digest.items.filter(item => item.sourceId === 'kimi')
  assert.ok(kimis.length >= 1)
  assert.ok(kimis.every(item => item.url.startsWith('https://www.kimi.com/en/blog/')))

  assert.deepEqual(digest.run.sources.map(source => source.status), ['ok', 'ok', 'ok'])
  const record = await readRunRecord({ root, date: DATE })
  assert.equal(record.sources.find(source => source.id === 'anthropic').candidates, 3)
  assert.equal(record.sources.find(source => source.id === 'kimi').candidates, 3)

  const translatedTexts = llm.calls.flatMap(call => unitsOf(call.body).map(unit => unit.text))
  assert.ok(translatedTexts.includes('The model keeps a persistent plan across tool calls and revisions.'),
    'Kimi English prose is sent to the translation endpoint')
  assert.ok(llm.calls.some(call => call.body.model === MODEL))
})

test('one broken Anthropic article is skipped and counted without failing the source', async () => {
  const root = tempRoot()
  const config = withoutDeepSeek((await loadConfig({ root })).config)
  config.sources.kimi.enabled = false
  const llm = fakeLlm()
  const blogs = fakeBlogSources({
    failAnthropic: {
      'research/interpretability-update': Object.assign(new Error('article answered HTTP 500'), { status: 500 }),
    },
  })
  const arxiv = fakeArxiv({ articles: FULL_TEXT })

  const result = await runDaily({
    root,
    date: DATE,
    config,
    env: ENV,
    fetch: fakePipelineFetch({ llm, arxiv, blogs }),
    now: NOW,
  })

  assert.equal(result.exitCode, 0, 'one article failure never fails the day')
  const { digest } = await readDayDigest({ root, date: DATE })
  const anthroIds = digest.items.filter(item => item.sourceId === 'anthropic').map(item => item.id)
  assert.deepEqual(anthroIds, ['anthropic:news/claude-opus-4-5', 'anthropic:research/agentic-coding'])
  assert.equal(digest.items.some(item => item.id === 'anthropic:research/interpretability-update'), false)

  const anthroReport = result.sources.find(source => source.id === 'anthropic')
  assert.equal(anthroReport.status, 'ok', 'a per-article failure is not a source failure')
  assert.equal(anthroReport.skipped, 1)

  const record = await readRunRecord({ root, date: DATE })
  assert.equal(record.sources.find(source => source.id === 'anthropic').skipped, 1)
  assert.ok(record.warnings.some(warning => warning.id === 'anthropic:research/interpretability-update'
    && /HTTP 500/.test(warning.message)))
})

test('the sitemap difference is remembered across days, but a same-day rerun is reproducible', async () => {
  const root = tempRoot()
  const config = withoutDeepSeek((await loadConfig({ root })).config)
  config.sources.kimi.enabled = false
  const llm = fakeLlm()
  const arxiv = fakeArxiv({ articles: FULL_TEXT })
  const blogs = fakeBlogSources()
  const fetch = fakePipelineFetch({ llm, arxiv, blogs })

  const first = await runDaily({ root, date: '2026-11-04', config, env: ENV, fetch, now: () => new Date('2026-11-04T09:00:00+08:00') })
  assert.equal(first.sources.find(source => source.id === 'anthropic').candidates, 3)

  const state = (await readSourceState({ root })).state
  assert.equal(
    state.sources.anthropic.seen['https://www.anthropic.com/news/claude-opus-4-5'],
    '2026-11-04',
    'the first-seen date is what makes the diff reproducible within a day',
  )

  const rerun = await runDaily({ root, date: '2026-11-04', config, env: ENV, fetch, now: () => new Date('2026-11-04T10:00:00+08:00') })
  assert.equal(rerun.sources.find(source => source.id === 'anthropic').candidates, 3, 'a same-day rerun keeps the day reproducible')

  const next = await runDaily({ root, date: '2026-11-05', config, env: ENV, fetch, now: () => new Date('2026-11-05T09:00:00+08:00') })
  const anthropic = next.sources.find(source => source.id === 'anthropic')
  assert.equal(anthropic.status, 'ok')
  assert.equal(anthropic.candidates, 0, 'URLs seen on an earlier day are not new again')
  const { digest } = await readDayDigest({ root, date: '2026-11-05' })
  assert.equal(digest.items.some(item => item.sourceId === 'anthropic'), false)
})
