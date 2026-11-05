/**
 * Translation seam: paragraph-batch requests, caption/equation-note handling,
 * alignment, caching, pending states and the daily token budget.
 *
 * The service takes an injected fetch and clock and writes its cache under a
 * temporary data root, so every test runs offline and observes only the digest
 * fields the reader uses.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { loadConfig } from '../src/config.js'
import { runDaily } from '../src/pipeline/run.js'
import { readDayDigest, readRunRecord } from '../src/storage.js'
import { translateItems } from '../src/translate/service.js'
import { translationCacheKey, translationCachePath } from '../src/translate/cache.js'
import { resolveGlossary } from '../src/translate/glossary.js'
import { fakeArxiv, FULL_TEXT } from './helpers/arxiv.mjs'
import { fakeLlm, unitsOf, API_KEY, BASE_URL, MODEL } from './helpers/llm.mjs'

const DATE = '2026-11-05'
const NOW = () => new Date('2026-11-05T09:00:00+08:00')

const roots = []
function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-translate-'))
  roots.push(root)
  return root
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true })
})

const ENV = {
  PAPER_READER_LLM_BASE_URL: BASE_URL,
  PAPER_READER_LLM_API_KEY: API_KEY,
  PAPER_READER_LLM_MODEL: MODEL,
}

/** A digest item shaped exactly like the pipeline writes it. */
function item({ id = 'arxiv:2611.00001', paragraphs = [], blocks = [], title = 'Agentic Reasoning' } = {}) {
  return {
    id,
    source: 'arxiv',
    sourceId: 'arxiv',
    sourceLanguage: 'en',
    title: { original: title, translation: null },
    summary: { original: 'A short summary about agents.', translation: null },
    translationState: 'pending',
    blocks: [
      { type: 'heading', level: 2, original: 'Abstract', translation: null },
      ...paragraphs.map(text => ({ type: 'paragraph', original: text, translation: null })),
      ...blocks,
    ],
  }
}

const longParagraphs = Array.from({ length: 12 }, (_, index) => `Paragraph ${index + 1} explains the method in detail.`)

function textsOf(request) {
  return unitsOf(request.body).map(unit => unit.text)
}

test('translates title, summary, paragraphs, captions and equation notes in separate batches', async () => {
  const root = tempRoot()
  const llm = fakeLlm()
  const blocks = [
    ...longParagraphs.map(text => ({ type: 'paragraph', original: text, translation: null })),
    { type: 'equation', display: 'E = mc^2', detail: '' },
    { type: 'equation', display: 'a + b', detail: '', note: { original: 'where a is the slope', translation: null } },
    { type: 'code', code: 'x = 1', language: 'python' },
    { type: 'figure', image: null, caption: { original: 'Figure 1: the pipeline', translation: null } },
  ]
  const entry = item({ paragraphs: [], blocks })

  const { items, stats } = await translateItems({
    items: [entry],
    root,
    env: ENV,
    fetch: llm.impl,
    config: { translation: {} },
  })

  assert.equal(stats.status, 'complete')
  assert.equal(stats.requests, 5, 'meta, two body batches, equation note and caption are five batches')
  assert.equal(stats.tokensUsed, 5 * 120)

  const [translated] = items
  assert.equal(translated.title.translation, '译:Agentic Reasoning')
  assert.equal(translated.summary.translation, '译:A short summary about agents.')
  assert.equal(translated.translationState, 'complete')
  for (const block of translated.blocks) {
    if (block.type === 'paragraph' || block.type === 'heading') {
      assert.equal(block.translation, `译:${block.original}`)
    }
    if (block.type === 'figure') assert.equal(block.caption.translation, '译:Figure 1: the pipeline')
    if (block.type === 'equation' && block.note) assert.equal(block.note.translation, '译:where a is the slope')
  }

  // Equations and code are language-neutral: they are sent nowhere and edited nowhere.
  const equation = translated.blocks.find(block => block.display === 'E = mc^2')
  assert.equal(equation.translation, undefined)
  const code = translated.blocks.find(block => block.type === 'code')
  assert.equal(code.translation, undefined)
  assert.equal(code.code, 'x = 1')
  for (const request of llm.calls) {
    const sent = textsOf(request).join('\n')
    assert.doesNotMatch(sent, /mc\^2|x = 1/, 'equation bodies and code are never translated')
  }

  // Paragraphs travel in real batches of 6–12, never as one whole document.
  const paragraphBatches = llm.calls
    .map(request => textsOf(request))
    .filter(texts => texts.some(text => text.startsWith('Paragraph')))
  assert.ok(paragraphBatches.length >= 2)
  for (const batch of paragraphBatches) {
    assert.ok(batch.length >= 6 && batch.length <= 12, `paragraph batch size ${batch.length} is outside 6–12`)
  }
  assert.equal(paragraphBatches.flat().filter(text => text.startsWith('Paragraph')).length, 12)

  // Title/summary, caption and note travel separately from the body.
  const meta = llm.calls.map(textsOf).find(texts => texts.includes('Agentic Reasoning'))
  assert.deepEqual(meta, ['Agentic Reasoning', 'A short summary about agents.'])
  const caption = llm.calls.map(textsOf).find(texts => texts.includes('Figure 1: the pipeline'))
  assert.deepEqual(caption, ['Figure 1: the pipeline'])
  const note = llm.calls.map(textsOf).find(texts => texts.includes('where a is the slope'))
  assert.deepEqual(note, ['where a is the slope'])

  // The glossary reaches the system prompt.
  assert.match(llm.calls[0].body.messages[0].content, /智能体/)
})

test('missing LLM configuration skips translation explicitly and leaves every item pending', async () => {
  const root = tempRoot()
  const llm = fakeLlm()
  const entry = item({ paragraphs: ['One paragraph.'] })

  const { items, stats } = await translateItems({
    items: [entry],
    root,
    env: {},
    fetch: llm.impl,
    config: { translation: {} },
  })

  assert.equal(stats.status, 'skipped')
  assert.equal(stats.reason, 'missing_llm_config')
  assert.deepEqual(stats.missing, [
    'PAPER_READER_LLM_BASE_URL',
    'PAPER_READER_LLM_API_KEY',
    'PAPER_READER_LLM_MODEL',
  ])
  assert.equal(llm.calls.length, 0, 'an unconfigured service never calls the endpoint')
  assert.equal(items[0].translationState, 'pending')
  assert.equal(items[0].blocks[1].translation, null)
  assert.equal(stats.pendingItems, 1)
})

test('a reordered batch reply is rejected, retried and never applied without its own block', async () => {
  const root = tempRoot()
  const llm = fakeLlm({ misalign: units => (units.length > 1 ? 'reorder' : null) })
  const entry = item({ paragraphs: ['First paragraph about agents.', 'Second paragraph about tools.'] })

  const { items, stats } = await translateItems({
    items: [entry],
    root,
    env: ENV,
    fetch: llm.impl,
    config: { translation: {} },
  })

  assert.ok(stats.retries >= 2, 'a reordered batch is retried instead of accepted')
  assert.equal(stats.failedUnits, 0)
  assert.equal(items[0].translationState, 'complete')
  const paragraphs = items[0].blocks.filter(block => block.type === 'paragraph')
  assert.deepEqual(paragraphs.map(block => block.translation), [
    '译:First paragraph about agents.',
    '译:Second paragraph about tools.',
  ], 'each block keeps its own translation, not the neighbour it was sent next to')
  assert.equal(items[0].blocks[0].translation, '译:Abstract')
})

for (const mode of ['missing', 'extra']) {
  test(`a batch reply with ${mode} blocks is a failed request and the item stays pending`, async () => {
    const root = tempRoot()
    const llm = fakeLlm({ misalign: mode })
    const entry = item({ paragraphs: ['Only paragraph.'] })

    const { items, stats } = await translateItems({
      items: [entry],
      root,
      env: ENV,
      fetch: llm.impl,
      config: { translation: {} },
    })

    assert.equal(stats.status, 'pending')
    assert.equal(stats.failedUnits, 4, 'title, summary, heading and the paragraph each give up after their retries')
    assert.ok(stats.retries >= 2)
    assert.equal(items[0].translationState, 'pending')
    assert.equal(items[0].title.translation, null)
    assert.equal(items[0].blocks[1].translation, null)
  })
}

test('one block that keeps failing is left pending while its neighbours keep their translations', async () => {
  const root = tempRoot()
  const llm = fakeLlm({ failTexts: ['BROKEN'] })
  const paragraphs = [
    'Healthy one.',
    'Healthy two.',
    'BROKEN paragraph.',
    'Healthy three.',
    'Healthy four.',
    'Healthy five.',
    'Healthy six.',
    'Healthy seven.',
  ]

  const { items, stats } = await translateItems({
    items: [item({ paragraphs })],
    root,
    env: ENV,
    fetch: llm.impl,
    config: { translation: {} },
  })

  assert.equal(stats.failedUnits, 1)
  assert.equal(stats.status, 'partial')
  assert.equal(stats.reason, 'block_failed')
  const translated = items[0]
  assert.equal(translated.translationState, 'partial')
  const broken = translated.blocks.find(block => block.original === 'BROKEN paragraph.')
  assert.equal(broken.translation, null, 'the failed block is pending, not a fabricated translation')
  for (const block of translated.blocks) {
    if (block.type !== 'paragraph' || block === broken) continue
    assert.equal(block.translation, `译:${block.original}`)
  }
})

test('a second run reuses the cache instead of paying for the same blocks again', async () => {
  const root = tempRoot()
  const first = fakeLlm()
  const pending = item({ paragraphs: ['Cached paragraph one.', 'Cached paragraph two.'] })
  pending.blocks.push({ type: 'figure', image: null, caption: { original: 'Figure caption.', translation: null } })

  const original = await translateItems({
    items: [structuredClone(pending)],
    root,
    env: ENV,
    fetch: first.impl,
    config: { translation: {} },
  })
  const translations = original.items[0].blocks.map(block => block.translation ?? block.caption?.translation ?? null)

  const second = fakeLlm()
  const rerun = await translateItems({
    items: [structuredClone(pending)],
    root,
    env: ENV,
    fetch: second.impl,
    config: { translation: {} },
  })

  assert.equal(first.calls.length > 0, true)
  assert.equal(second.calls.length, 0, 'cache hits never reach the endpoint')
  assert.equal(rerun.stats.requests, 0)
  assert.equal(rerun.stats.cacheHits, 6, 'title, summary, heading, two paragraphs and the caption come from cache')
  assert.equal(rerun.stats.tokensUsed, 0)
  assert.equal(rerun.stats.status, 'complete')
  assert.deepEqual(
    rerun.items[0].blocks.map(block => block.translation ?? block.caption?.translation ?? null),
    translations,
  )

  const key = translationCacheKey({
    text: 'Cached paragraph one.',
    targetLanguage: 'zh',
    model: MODEL,
    glossaryVersion: resolveGlossary({}).version,
  })
  assert.equal(readdirSync(join(root, 'cache')).includes(`${key}.json`), true)
  assert.equal(translationCachePath({ root, key }).endsWith(`${key}.json`), true)
})

test('the cache key covers text, target language, model and glossary version', () => {
  const base = { text: 'We study agents.', targetLanguage: 'zh', model: MODEL, glossaryVersion: 'g-1' }
  const key = translationCacheKey(base)
  assert.match(key, /^[a-f0-9]{64}$/)
  assert.equal(translationCacheKey(base), key, 'the key is deterministic')
  assert.notEqual(translationCacheKey({ ...base, text: 'We study tools.' }), key)
  assert.notEqual(translationCacheKey({ ...base, targetLanguage: 'en' }), key)
  assert.notEqual(translationCacheKey({ ...base, model: 'another-model' }), key)
  assert.notEqual(translationCacheKey({ ...base, glossaryVersion: 'g-2' }), key)

  const builtin = resolveGlossary({})
  assert.match(builtin.version, /^g-[a-f0-9]{12}$/)
  assert.equal(resolveGlossary({}).version, builtin.version, 'the built-in glossary version is stable')
  const custom = resolveGlossary({ glossary: [{ source: 'agent', target: '代理' }] })
  assert.notEqual(custom.version, builtin.version, 'editing a term invalidates the old cache')
  assert.equal(
    resolveGlossary({ glossary: [], glossaryVersion: '2026-11-05' }).version,
    '2026-11-05',
    'an explicit version can pin the cache key',
  )
})

test('exhausting the daily token budget leaves the rest of the items pending', async () => {
  const root = tempRoot()
  const llm = fakeLlm({ usage: 100 })
  const paragraphs = Array.from({ length: 4 }, (_, index) => `Long paragraph ${index + 1}. `.repeat(10))
  const entries = [
    item({ id: 'arxiv:one', paragraphs }),
    item({ id: 'arxiv:two', paragraphs: ['Another paper.'] }),
  ]

  const { items, stats } = await translateItems({
    items: entries,
    root,
    env: ENV,
    fetch: llm.impl,
    config: { translation: { dailyTokenBudget: 150 } },
  })

  assert.equal(stats.budgetExceeded, true)
  assert.equal(stats.reason, 'token_budget_exceeded')
  assert.equal(stats.requests, 1, 'the second request is refused before it is sent')
  assert.equal(stats.tokensUsed, 100)
  assert.equal(items[0].translationState, 'partial')
  assert.equal(items[1].translationState, 'pending')
  assert.equal(items[1].title.translation, null)
  assert.equal(stats.pendingItems, 2)
  assert.deepEqual(stats.items, { total: 2, complete: 0, partial: 1, pending: 1 })
})

/* ------------------------------------------------------------------ */
/* Pipeline integration                                                */
/* ------------------------------------------------------------------ */

/** The pipeline sees one fetch: arXiv requests and Chat Completions requests. */
function combinedFetch(llm, { articles = FULL_TEXT } = {}) {
  const arxiv = fakeArxiv({ articles })
  const impl = async (url, init) => String(url).includes('/chat/completions')
    ? llm.impl(url, init)
    : arxiv.impl(url, init)
  return { impl, arxiv }
}

test('the default translation config is a 300k daily budget with 6–12 block batches', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  assert.equal(config.translation.enabled, true)
  assert.equal(config.translation.targetLanguage, 'zh')
  assert.equal(config.translation.batchSize, 8)
  assert.equal(config.translation.retries, 2)
  assert.equal(config.translation.dailyTokenBudget, 300_000)
  assert.deepEqual(config.translation.glossary, [])
})

test('an invalid translation setting is an explicit config error naming the key', async () => {
  const root = tempRoot()
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'config.json'), JSON.stringify({ translation: { batchSize: 2 } }))
  await assert.rejects(
    loadConfig({ root }),
    error => error.code === 'config_invalid' && /translation\.batchSize/.test(error.message),
  )

  writeFileSync(join(root, 'config.json'), JSON.stringify({ translation: { glossary: [{ source: 'x' }] } }))
  await assert.rejects(
    loadConfig({ root }),
    error => error.code === 'config_invalid' && /translation\.glossary\[0\]/.test(error.message),
  )
})

test('a configured run translates the digest, records the cost and never leaks the key', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const llm = fakeLlm()
  const fetch = combinedFetch(llm)

  const result = await runDaily({ root, date: DATE, config, env: ENV, fetch: fetch.impl, now: NOW })

  assert.equal(result.exitCode, 0)
  assert.equal(result.translation.status, 'complete')
  assert.ok(result.translation.tokensUsed > 0)
  assert.equal(result.translation.model, MODEL)

  const { digest } = await readDayDigest({ root, date: DATE })
  assert.ok(digest.items.length > 0)
  for (const entry of digest.items) {
    assert.equal(entry.translationState, 'complete', entry.id)
    assert.match(entry.title.translation, /^译:/)
  }
  const first = digest.items[0]
  assert.ok(first.blocks.some(block => block.type === 'paragraph' && block.translation?.startsWith('译:')))
  assert.equal(digest.run.translation.status, 'complete')
  assert.equal(digest.run.translation.budgetExceeded, false)

  const record = await readRunRecord({ root, date: DATE })
  assert.equal(record.translation.status, 'complete')
  assert.equal(record.translation.model, MODEL)
  assert.equal(record.translation.tokensUsed, result.translation.tokensUsed)
  assert.equal(record.translation.requests, result.translation.requests)

  // The key travels only in the Authorization header.
  for (const call of llm.calls) {
    assert.equal(String(call.headers.authorization), `Bearer ${API_KEY}`)
    assert.equal(JSON.stringify(call.body).includes(API_KEY), false)
  }
  assert.equal(JSON.stringify(digest).includes(API_KEY), false, 'the digest has no key')
  assert.equal(JSON.stringify(record).includes(API_KEY), false, 'the run record has no key')
  assert.equal(JSON.stringify(result).includes(API_KEY), false, 'the CLI result has no key')

  assert.equal(existsSync(join(root, 'cache')), true, 'translations land in $DSH_HOME/paper-reader/cache')
  assert.ok(readdirSync(join(root, 'cache')).length > 0)
})

test('rerunning the same day serves every block from cache and spends no tokens', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const first = fakeLlm()
  const firstRun = await runDaily({
    root, date: DATE, config, env: ENV, fetch: combinedFetch(first).impl, now: NOW,
  })
  assert.equal(firstRun.translation.requests > 0, true)

  const second = fakeLlm()
  const secondRun = await runDaily({
    root, date: DATE, config, env: ENV, fetch: combinedFetch(second).impl, now: NOW,
  })

  assert.equal(second.calls.length, 0, 'the cached day is not paid for twice')
  assert.equal(secondRun.translation.requests, 0)
  assert.ok(secondRun.translation.cacheHits > 0)
  assert.equal(secondRun.translation.tokensUsed, firstRun.translation.tokensUsed,
    'the daily budget keeps the earlier spend')

  const { digest } = await readDayDigest({ root, date: DATE })
  assert.ok(digest.items.every(entry => entry.translationState === 'complete'))
})

test('an exhausted daily budget leaves items pending, in the digest and the run record', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  config.translation.dailyTokenBudget = 200
  const llm = fakeLlm({ usage: 100 })

  const result = await runDaily({
    root, date: DATE, config, env: ENV, fetch: combinedFetch(llm).impl, now: NOW,
  })

  assert.equal(result.exitCode, 0, 'translation never fails the day')
  assert.equal(result.translation.budgetExceeded, true)
  assert.equal(result.translation.reason, 'token_budget_exceeded')
  assert.ok(result.translation.pendingItems > 0)

  const { digest } = await readDayDigest({ root, date: DATE })
  assert.equal(digest.run.translation.budgetExceeded, true)
  assert.equal(digest.run.translation.status, 'partial')
  assert.ok(digest.items.some(entry => entry.translationState !== 'complete'))

  const record = await readRunRecord({ root, date: DATE })
  assert.equal(record.translation.budgetExceeded, true)
  assert.ok(record.warnings.some(warning => /daily token budget/.test(warning.message)))
})

test('without model configuration the run still succeeds but says translation was skipped', async () => {
  const root = tempRoot()
  const { config } = await loadConfig({ root })
  const llm = fakeLlm()
  const fetch = combinedFetch(llm)

  const result = await runDaily({ root, date: DATE, config, env: {}, fetch: fetch.impl, now: NOW })

  assert.equal(result.exitCode, 0)
  assert.equal(result.translation.status, 'skipped')
  assert.equal(result.translation.reason, 'missing_llm_config')
  assert.equal(llm.calls.length, 0)

  const { digest } = await readDayDigest({ root, date: DATE })
  assert.ok(digest.items.every(entry => entry.translationState === 'pending'))
  assert.equal(digest.run.translation.status, 'skipped')

  const record = await readRunRecord({ root, date: DATE })
  assert.equal(record.translation.status, 'skipped')
  assert.ok(record.warnings.some(warning => /PAPER_READER_LLM_BASE_URL/.test(warning.message)),
    'the missing variables are named, not silently ignored')
  assert.equal(existsSync(join(root, 'cache')), false)
})
