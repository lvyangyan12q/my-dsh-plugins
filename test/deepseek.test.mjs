/**
 * DeepSeek is the one official bilingual source: the sitemap lists the news
 * slugs, and each slug has an English and a `/zh-cn/` Markdown page that the
 * adapter pairs into `original` (Chinese) + `translation` (English) blocks
 * without any translation call.
 *
 * The tests drive an injected fetch over captured fixtures, so they describe
 * the contract the pipeline consumes: discovery without the `/news` soft 404,
 * the digest date window, the paired blocks, and the English fallback when the
 * Chinese page is missing.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { defaultConfig, loadConfig, mergeConfig, validateConfig } from '../src/config.js'
import { runDaily } from '../src/pipeline/run.js'
import { readDayDigest, readRunRecord } from '../src/storage.js'
import {
  extractDeepSeekArticle,
  listDeepSeek,
  parseDeepSeekSitemap,
  parseMarkdownBlocks,
} from '../src/sources/deepseek.js'
import { mountPage } from './helpers/client.mjs'
import {
  fakeDeepSeek,
  NEWS_EN,
  SITEMAP,
} from './helpers/deepseek.mjs'
import { API_KEY, BASE_URL, fakeLlm, MODEL } from './helpers/llm.mjs'
import { fakeSources } from './helpers/sources.mjs'

const DATE = '2026-11-05'

const CONFIG = {
  enabled: true,
  sitemapUrl: 'https://api-docs.deepseek.com/sitemap.xml',
  baseUrl: 'https://api-docs.deepseek.com',
  timeoutMs: 5_000,
  lookbackDays: 2,
  maxItems: 10,
  maxBlocks: 400,
  legacyYear: 2024,
}

test('discovers news from the sitemap only, deriving the date from the slug', () => {
  const entries = parseDeepSeekSitemap(SITEMAP)

  assert.deepEqual(entries.map(entry => entry.slug), [
    'news0725',
    'news250115',
    'news260910',
    'news261017',
    'news261102',
    'news261103',
    'news261104',
  ])
  assert.ok(entries.every(entry => entry.url === `https://api-docs.deepseek.com/news/${entry.slug}`))
  assert.equal(entries.find(entry => entry.slug === 'news0725').published, '2024-07-25', 'short slugs use the legacy year')
  assert.equal(entries.find(entry => entry.slug === 'news261104').published, '2026-11-04')
  assert.equal(entries.find(entry => entry.slug === 'news250115').published, '2025-01-15')
})

test('listDeepSeek returns the news inside the digest window as blog candidates', async () => {
  const { impl, calls } = fakeDeepSeek()
  const candidates = await listDeepSeek({ config: CONFIG, date: DATE, fetch: impl })

  assert.deepEqual(candidates.map(candidate => candidate.id), [
    'deepseek:news261104',
    'deepseek:news261103',
  ])
  const [newest] = candidates
  assert.equal(newest.sourceId, 'deepseek')
  assert.equal(newest.kind, 'blog')
  assert.equal(newest.sourceLanguage, 'zh')
  assert.equal(newest.slug, 'news261104')
  assert.equal(newest.url, 'https://api-docs.deepseek.com/news/news261104')
  assert.equal(newest.published, '2026-11-04')
  assert.equal(newest.publishedAt, '2026-11-04T00:00:00+08:00')
  assert.ok(newest.tags.includes('deepseek'))
  assert.equal(calls.length, 1, 'listing never fetches a page')
  assert.ok(calls[0].endsWith('/sitemap.xml'))
  assert.doesNotMatch(calls[0], /\/news$/, 'the /news soft 404 is never requested')
})

test('the window is inclusive, skips future news and can be a single day', async () => {
  const { impl } = fakeDeepSeek()

  const singleDay = await listDeepSeek({
    config: { ...CONFIG, lookbackDays: 0 },
    date: '2026-11-03',
    fetch: impl,
  })
  assert.deepEqual(singleDay.map(candidate => candidate.id), ['deepseek:news261103'])

  const window = await listDeepSeek({
    config: { ...CONFIG, lookbackDays: 1 },
    date: '2026-11-04',
    fetch: impl,
  })
  assert.deepEqual(
    window.map(candidate => candidate.id),
    ['deepseek:news261104', 'deepseek:news261103'],
    'the previous day is inside the window',
  )

  const past = await listDeepSeek({
    config: { ...CONFIG, lookbackDays: 0 },
    date: '2026-11-02',
    fetch: impl,
  })
  assert.deepEqual(past.map(candidate => candidate.id), ['deepseek:news261102'], 'news dated after the digest date is ignored')

  const quiet = await listDeepSeek({ config: { ...CONFIG, lookbackDays: 0 }, date: '2026-11-05', fetch: impl })
  assert.deepEqual(quiet, [])
})

test('maxItems caps the listed candidates', async () => {
  const { impl } = fakeDeepSeek()
  const candidates = await listDeepSeek({
    config: { ...CONFIG, maxItems: 1 },
    date: DATE,
    fetch: impl,
  })
  assert.deepEqual(candidates.map(candidate => candidate.id), ['deepseek:news261104'])
})

test('a sitemap failure is an explicit source error, not an empty day', async () => {
  const { impl } = fakeDeepSeek({ failSitemap: new Error('getaddrinfo ENOTFOUND api-docs.deepseek.com') })
  await assert.rejects(
    listDeepSeek({ config: CONFIG, date: DATE, fetch: impl }),
    error => error.code === 'deepseek_network' && error.sourceId === 'deepseek',
  )

  const http = fakeDeepSeek().impl
  await assert.rejects(
    listDeepSeek({ config: CONFIG, date: DATE, fetch: async (url) => (String(url).endsWith('/sitemap.xml')
      ? { ok: false, status: 503, text: async () => 'unavailable' }
      : http(url)) }),
    error => error.code === 'deepseek_http' && error.status === 503,
  )
})

/* ------------------------------------------------------------------ */
/* Markdown → reader blocks                                            */
/* ------------------------------------------------------------------ */

function candidateOf(slug, published) {
  return {
    id: `deepseek:${slug}`,
    sourceId: 'deepseek',
    kind: 'blog',
    sourceLanguage: 'zh',
    slug,
    title: `DeepSeek ${published}`,
    summary: '',
    url: `https://api-docs.deepseek.com/news/${slug}`,
    published,
    publishedAt: `${published}T00:00:00+08:00`,
    direction: 'architecture',
    tags: ['deepseek', 'news'],
  }
}

test('parses the official Markdown into ordered blocks and strips inline syntax', () => {
  const blocks = parseMarkdownBlocks(NEWS_EN)

  assert.deepEqual(blocks.map(block => block.type), [
    'heading',
    'heading',
    'paragraph',
    'paragraph',
    'figure',
    'figure',
    'paragraph',
    'heading',
    'paragraph',
    'paragraph',
    'figure',
    'paragraph',
    'figure',
    'heading',
    'paragraph',
    'paragraph',
    'code',
    'heading',
    'paragraph',
    'paragraph',
    'paragraph',
  ])

  assert.deepEqual(blocks[0], {
    type: 'heading',
    level: 1,
    original: 'DeepSeek-V4.1-Flash-1017: Wish-Driven Programming Made Real',
  })
  assert.deepEqual(blocks[1], { type: 'heading', level: 2, original: '🚀 DeepSeek-V4.1-Flash-1017 is here!' })

  assert.match(blocks[2].original, /Stronger benchmark performance/)
  assert.doesNotMatch(blocks[2].original, /\n/, 'a paragraph is one line')
  assert.equal(blocks[6].original.includes('Pass@1'), true, 'the escaped @ is unescaped')
  assert.doesNotMatch(blocks[6].original, /\\@/, 'Markdown escapes do not leak')

  assert.equal(blocks[4].type, 'figure')
  assert.equal(blocks[4].image, 'https://api-docs.deepseek.com/img/v4.1_261017_benchmark_table_en.png')
  assert.equal(blocks[4].caption, undefined, 'an empty alt is not an empty caption')

  const code = blocks[16]
  assert.equal(code.type, 'code')
  assert.equal(code.language, 'bash')
  assert.match(code.code, /curl https:\/\/api\.deepseek\.com\/search/)
  assert.doesNotMatch(code.code, /```/, 'the fence is not part of the code')

  assert.equal(blocks[19].original, 'Hugging Face: https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017')
  const plain = blocks.filter(block => block.type === 'paragraph').map(block => block.original).join('\n')
  assert.doesNotMatch(plain, /\*\*/, 'bold markers are stripped')
  assert.doesNotMatch(plain, /<https?:/, 'autolinks lose their angle brackets')
})

test('extractDeepSeekArticle pairs the Chinese original with the English translation', async () => {
  const { impl, calls } = fakeDeepSeek()
  const result = await extractDeepSeekArticle({
    candidate: candidateOf('news261104', '2026-11-04'),
    config: CONFIG,
    fetch: impl,
  })

  assert.equal(result.skip, undefined)
  assert.equal(result.finalized, true, 'the adapter writes final pairs; the pipeline must not blank them')
  assert.equal(result.excerpt, false)
  assert.equal(result.sourceLanguage, 'zh')
  assert.equal(result.translationState, 'complete')
  assert.deepEqual(result.title, {
    original: 'DeepSeek V4.1 Flash 新版本：许愿式编程一键成真',
    translation: 'DeepSeek-V4.1-Flash-1017: Wish-Driven Programming Made Real',
  })
  assert.deepEqual(result.summary, {
    original: '新模型在基准测试中表现更强、任务完成更快、输出更短，在性能与成本上实现了帕累托改进。现已上线官网、App 与 API。',
    translation: 'Stronger benchmark performance, faster task completion, and shorter outputs than the previous version—a Pareto improvement in performance and cost. Now live on our website, app, and API.',
  })

  const headings = result.blocks.filter(block => block.type === 'heading')
  assert.equal(headings.length, 4)
  assert.equal(headings[0].original, '🚀 DeepSeek-V4.1-Flash-1017 来了！')
  assert.equal(headings[0].translation, '🚀 DeepSeek-V4.1-Flash-1017 is here!')
  assert.equal(headings[3].original, '🔓 模型开源')
  assert.equal(headings[3].translation, '🔓 Open-source release')

  const paragraphs = result.blocks.filter(block => block.type === 'paragraph')
  assert.equal(paragraphs.length, 11)
  for (const block of paragraphs) {
    assert.ok(block.original, 'every Chinese paragraph is the original')
    assert.ok(block.translation, 'every paragraph has its official English text')
  }

  const figures = result.blocks.filter(block => block.type === 'figure')
  assert.equal(figures.length, 4, 'each image renders once, not once per language')
  assert.ok(figures.every(figure => figure.image.includes('/zh-cn/img/')), 'the Chinese version is the original')

  const codes = result.blocks.filter(block => block.type === 'code')
  assert.equal(codes.length, 1)
  assert.equal(codes[0].language, 'bash')

  const originals = result.blocks
    .map(block => block.original ?? '')
    .filter(Boolean)
  assert.equal(new Set(originals).size, originals.length, 'no paragraph is emitted twice')

  assert.deepEqual(calls, [
    'https://api-docs.deepseek.com/news/news261104.md',
    'https://api-docs.deepseek.com/zh-cn/news/news261104.md',
  ])
  assert.deepEqual(result.warnings, [], 'a fully paired item has nothing to warn about')
})

test('block alignment keeps Chinese-only blocks and drops English-only ones without duplicating text', async () => {
  const { impl } = fakeDeepSeek()
  const result = await extractDeepSeekArticle({
    candidate: candidateOf('news261103', '2026-11-03'),
    config: CONFIG,
    fetch: impl,
  })

  assert.equal(result.sourceLanguage, 'zh')
  assert.equal(result.translationState, 'partial')
  assert.equal(result.blocks.length, 7)

  const chineseOnly = '本节仅中文版保留了一段额外说明，用于验证块级对齐不会重复段落。'
  const extra = result.blocks.find(block => block.original === chineseOnly)
  assert.ok(extra, 'a Chinese-only paragraph stays visible')
  assert.equal(extra.translation, null, 'and is marked untranslated')

  const originals = result.blocks.map(block => block.original ?? '').filter(Boolean)
  assert.equal(new Set(originals).size, originals.length, 'no paragraph is repeated')

  const joined = result.blocks.map(block => block.original ?? '').join('\n')
  assert.doesNotMatch(joined, /Optimized for DeepSeek Harness, Tencent CodeBuddy and WorkBuddy\./, 'English-only extras are not pretending to be Chinese')
  assert.ok(result.warnings.some(warning => /Chinese counterpart/i.test(warning)))
})

test('a missing Chinese page keeps the English item visible and pending', async () => {
  const { impl } = fakeDeepSeek()
  const result = await extractDeepSeekArticle({
    candidate: candidateOf('news261102', '2026-11-02'),
    config: CONFIG,
    fetch: impl,
  })

  assert.equal(result.finalized, true)
  assert.equal(result.sourceLanguage, 'en', 'without Chinese there is nothing to be the original in zh')
  assert.equal(result.translationState, 'pending')
  assert.deepEqual(result.title, {
    original: 'DeepSeek-V4.1-Flash-1017 Developer Preview',
    translation: null,
  })
  assert.equal(result.summary.translation, null)
  assert.equal(result.blocks.length, 4)
  for (const block of result.blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') {
      assert.equal(block.translation, null)
    }
  }
  assert.ok(result.warnings.some(warning => /Chinese/i.test(warning)))
})

test('both Markdown pages missing makes the item skippable, not an empty article', async () => {
  const { impl } = fakeDeepSeek({ news: {} })
  const result = await extractDeepSeekArticle({
    candidate: candidateOf('news261104', '2026-11-04'),
    config: CONFIG,
    fetch: impl,
  })
  assert.equal(result.skip, true)
  assert.ok(result.warnings.length > 0)
})

/* ------------------------------------------------------------------ */
/* Config, pipeline and reading page                                   */
/* ------------------------------------------------------------------ */

const homes = []

function tempRoot() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-deepseek-'))
  homes.push(home)
  return join(home, 'paper-reader')
}

afterEach(() => {
  while (homes.length > 0) rmSync(homes.pop(), { recursive: true, force: true })
})

const NOW = () => new Date('2026-11-05T09:00:00+08:00')

test('the config carries DeepSeek defaults and validates its own keys', async () => {
  const defaults = defaultConfig()
  assert.equal(defaults.sources.deepseek.enabled, true)
  assert.equal(defaults.sources.deepseek.lookbackDays, 1)
  assert.equal(defaults.sources.deepseek.sitemapUrl, 'https://api-docs.deepseek.com/sitemap.xml')

  const merged = mergeConfig({ sources: { deepseek: { lookbackDays: 3 } } })
  assert.equal(merged.sources.deepseek.lookbackDays, 3)
  assert.equal(merged.sources.deepseek.maxItems, 10, 'unset keys keep their defaults')
  assert.deepEqual(merged.sources.arxiv.categories, ['cs.AI', 'cs.CL', 'cs.LG'])

  const invalid = [
    [{ lookbackDays: -1 }, /lookbackDays/],
    [{ maxItems: 0 }, /maxItems/],
    [{ sitemapUrl: 'ftp://example.com/sitemap.xml' }, /sitemapUrl/],
    [{ enabled: 'yes' }, /enabled/],
  ]
  for (const [patch, pattern] of invalid) {
    const config = mergeConfig({ sources: { deepseek: patch } })
    assert.throws(
      () => validateConfig(config),
      error => error.code === 'config_invalid' && pattern.test(error.message),
      JSON.stringify(patch),
    )
  }

  const root = tempRoot()
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'config.json'), JSON.stringify({ sources: { deepseek: { lookbackDays: 2 } } }))
  const loaded = await loadConfig({ root })
  assert.equal(loaded.config.sources.deepseek.lookbackDays, 2)
})

test('a daily run writes the official pair, never calls translation and respects the blog quota', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const { impl, calls } = fakeSources()
  const result = await runDaily({
    root,
    date: DATE,
    config: {
      ...config,
      quota: { total: 10, papers: 6, blogs: 1 },
      sources: {
        ...config.sources,
        deepseek: { ...config.sources.deepseek, lookbackDays: 3 },
        // HF is proxied and this run has no proxy; its own tests cover that leg.
        hf: { ...config.sources.hf, enabled: false },
      },
    },
    fetch: impl,
    env: {},
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.status, 'ok')
  const { digest } = await readDayDigest({ root, date: DATE })
  assert.deepEqual(digest.items.map(item => item.id), [
    'arxiv:2611.05377',
    'arxiv:2611.05380',
    'arxiv:2611.05382',
    'deepseek:news261104',
  ])

  const item = digest.items.find(entry => entry.id === 'deepseek:news261104')
  assert.equal(item.source, 'deepseek')
  assert.equal(item.sourceLanguage, 'zh')
  assert.equal(item.translationState, 'complete')
  assert.equal(item.excerpt, false)
  assert.equal(item.direction, 'architecture')
  assert.deepEqual(item.title, {
    original: 'DeepSeek V4.1 Flash 新版本：许愿式编程一键成真',
    translation: 'DeepSeek-V4.1-Flash-1017: Wish-Driven Programming Made Real',
  })
  assert.equal(item.summary.original, '新模型在基准测试中表现更强、任务完成更快、输出更短，在性能与成本上实现了帕累托改进。现已上线官网、App 与 API。')
  assert.equal(item.summary.translation.startsWith('Stronger benchmark performance'), true)
  const heading = item.blocks.find(block => block.type === 'heading')
  assert.equal(heading.original, '🚀 DeepSeek-V4.1-Flash-1017 来了！')
  assert.equal(heading.translation, '🚀 DeepSeek-V4.1-Flash-1017 is here!')
  const figure = item.blocks.find(block => block.type === 'figure')
  assert.ok(figure.image.includes('/zh-cn/img/'))
  assert.equal(item.published, '2026-11-04')
  assert.ok(item.readingMinutes >= 1)

  const deepseekReport = digest.run.sources.find(source => source.id === 'deepseek')
  assert.deepEqual(deepseekReport, { id: 'deepseek', status: 'ok', items: 1 })
  assert.ok(!calls.some(url => String(url).includes('news261103')), 'the blog quota prevents extracting the second item')

  const record = await readRunRecord({ root, date: DATE })
  const report = record.sources.find(source => source.id === 'deepseek')
  assert.equal(report.candidates, 3)
  assert.equal(report.selected, 1)
  assert.equal(report.requests, 3, 'one sitemap request plus the en/zh pair of the selected item')
})

test('the official pair never triggers a model translation request', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const llm = fakeLlm()
  const { impl } = fakeSources()
  const fetchImpl = async (url, init) => (String(url).includes('/chat/completions')
    ? llm.impl(url, init)
    : impl(url, init))

  const result = await runDaily({
    root,
    date: '2026-11-04',
    config: {
      ...config,
      sources: {
        ...config.sources,
        deepseek: { ...config.sources.deepseek, lookbackDays: 0 },
      },
    },
    source: 'deepseek',
    fetch: fetchImpl,
    env: {
      PAPER_READER_LLM_BASE_URL: BASE_URL,
      PAPER_READER_LLM_API_KEY: API_KEY,
      PAPER_READER_LLM_MODEL: MODEL,
    },
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(llm.calls.length, 0, 'no Chat Completions request is made')
  assert.equal(result.translation.requests, 0)
  assert.equal(result.translation.status, 'complete')
  assert.equal(result.translation.tokensUsed, 0)

  const { digest } = await readDayDigest({ root, date: '2026-11-04' })
  assert.equal(digest.items.length, 1)
  assert.equal(digest.items[0].translationState, 'complete')
  const textBlocks = digest.items[0].blocks.filter(block => block.type === 'heading' || block.type === 'paragraph')
  assert.ok(textBlocks.length > 0)
  assert.ok(textBlocks.every(block => Boolean(block.translation)))
})

test('a DeepSeek item without Chinese stays visible as an English pending item', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const deepened = {
    ...config,
    sources: {
      ...config.sources,
      deepseek: { ...config.sources.deepseek, lookbackDays: 3 },
    },
  }
  const { impl } = fakeSources()
  const result = await runDaily({
    root,
    date: DATE,
    config: deepened,
    source: 'deepseek',
    fetch: impl,
    env: {},
    now: NOW,
  })

  assert.equal(result.exitCode, 0)
  const { digest } = await readDayDigest({ root, date: DATE })
  assert.deepEqual(digest.items.map(item => item.id), [
    'deepseek:news261104',
    'deepseek:news261103',
    'deepseek:news261102',
  ])

  const partial = digest.items.find(item => item.id === 'deepseek:news261103')
  assert.equal(partial.translationState, 'partial')

  const missing = digest.items.find(item => item.id === 'deepseek:news261102')
  assert.equal(missing.sourceLanguage, 'en')
  assert.equal(missing.translationState, 'pending')
  assert.deepEqual(missing.title, {
    original: 'DeepSeek-V4.1-Flash-1017 Developer Preview',
    translation: null,
  })
  for (const block of missing.blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') {
      assert.equal(block.translation, null)
    }
  }

  const record = await readRunRecord({ root, date: DATE })
  assert.equal(record.sources[0].status, 'ok')
  assert.ok(record.warnings.some(warning => warning.id === 'deepseek:news261102' && /Chinese/.test(warning.message)))
})

test('the reading page renders a DeepSeek digest in Chinese-source order and every mode', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const deepened = {
    ...config,
    quota: { total: 10, papers: 6, blogs: 4 },
    sources: {
      ...config.sources,
      deepseek: { ...config.sources.deepseek, lookbackDays: 3 },
    },
  }
  const { impl } = fakeSources()
  await runDaily({ root, date: DATE, config: deepened, source: 'deepseek', fetch: impl, env: {}, now: NOW })
  const { digest } = await readDayDigest({ root, date: DATE })
  const index = { schemaVersion: 2, retentionDays: 30, days: [{ date: DATE, items: digest.items.length }] }
  const routes = {
    '/api/paper-reader/index': index,
    [`/api/paper-reader/digest/${DATE}`]: digest,
  }

  const mounted = []
  const mount = async (prefs, mode) => {
    const page = await mountPage({ routes, mode, prefs })
    mounted.push(page)
    return page
  }

  try {
    const paired = await mount({ activeId: 'deepseek:news261104' }, 'both')
    assert.ok(paired.container.querySelector('.pr-source-deepseek'), 'the DeepSeek source badge is visible')
    const columns = Array.from(
      paired.container.querySelectorAll('.pr-body [data-block-type="paragraph"] [data-column]'),
    )
    assert.equal(columns[0].getAttribute('data-lang'), 'zh')
    assert.equal(columns[1].getAttribute('data-lang'), 'en')
    assert.match(columns[0].textContent, /新模型在基准测试中表现更强/)
    assert.match(columns[1].textContent, /Stronger benchmark performance/)
    assert.equal(paired.container.querySelector('.pr-pending'), null, 'an official pair has no pending block')
    assert.match(paired.container.textContent, /DeepSeek V4\.1 Flash 新版本/)

    const chineseMode = await mount({ activeId: 'deepseek:news261104' }, 'zh')
    assert.match(chineseMode.bodyText(), /新模型在基准测试中表现更强/)
    assert.doesNotMatch(chineseMode.bodyText(), /Stronger benchmark performance/)

    const englishMode = await mount({ activeId: 'deepseek:news261104' }, 'en')
    assert.match(englishMode.bodyText(), /Stronger benchmark performance/)
    assert.doesNotMatch(englishMode.bodyText(), /新模型在基准测试中表现更强/)

    const fallback = await mount({ activeId: 'deepseek:news261102' }, 'both')
    const fallbackColumns = Array.from(
      fallback.container.querySelectorAll('.pr-body [data-block-type="paragraph"] [data-column]'),
    )
    assert.equal(fallbackColumns[0].getAttribute('data-lang'), 'en', 'the English fallback is honest about its language')
    assert.ok(fallback.container.querySelector('.pr-pending'), 'the missing translation is marked pending')

    const fallbackChinese = await mount({ activeId: 'deepseek:news261102' }, 'zh')
    assert.match(fallbackChinese.bodyText(), /The English page is the only version published/)
    assert.match(fallbackChinese.container.textContent, /Developer Preview/)
    assert.match(fallbackChinese.container.textContent, /未翻译/)
  } finally {
    for (const page of mounted) await page.unmount()
  }
})
