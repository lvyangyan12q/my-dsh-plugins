/**
 * One daily pipeline run: list sources → select → extract → translate → write.
 *
 * This is the high seam the tests drive. Network I/O is injected (`fetch`,
 * clock, `proxyFetch`), and persistence goes through an injected `storage`
 * port, so a run is reproducible from fixtures and the CLI, a future scheduler
 * and the tests share exactly one code path.
 *
 * Failure rules:
 * - one source failing does not stop the others (`status: "partial"`);
 * - one paper's HTML failing does not drop that paper (it becomes `excerpt`);
 * - if every source fails nothing is written for the day, the run record says
 *   why, and the previous day files stay untouched.
 *
 * Source metadata, defaults, validation and adapters all come from
 * `src/sources/registry.js`; this file only orchestrates the stages.
 */
import { defaultConfig } from '../config.js'
import { checkProxyHealth, proxySkipReason, redactProxyUrl, resolveProxyUrl } from '../proxy.js'
import { excerptBlocks } from '../sources/arxiv.js'
import {
  SOURCES,
  SOURCE_IDS,
  sourceDefinition,
  sourceLabel,
  sourceMetadata,
} from '../sources/registry.js'
import * as defaultStorage from '../storage.js'
import { translateItems } from '../translate/service.js'
import { isTextBlock, readableTextOf } from '../shared/blocks.js'
import { normalizeInstant } from '../shared/date.js'
import { selectDaily } from './select.js'
import { scoreImportance } from './importance.js'

export { SOURCE_IDS }

export const DIRECTION_META = [
  { id: 'agent', label: 'Agent', labelEn: 'Agents' },
  { id: 'reasoning', label: '推理', labelEn: 'Reasoning' },
  { id: 'training', label: '训练', labelEn: 'Training' },
  { id: 'alignment', label: '对齐', labelEn: 'Alignment' },
  { id: 'architecture', label: '架构', labelEn: 'Architecture' },
]

/** Reader-facing source list, derived from the registry (never copied by hand). */
export const SOURCE_META = sourceMetadata()

/**
 * Built-in adapters, derived from the registry.
 *
 * Each source owns its defaults; the adapter wrapper resolves the per-source
 * config once, so `runDaily` never re-implements a source's wiring. HF has no
 * extractor of its own: its candidates declare `extractVia: 'arxiv'`.
 */
const BUILTIN_ADAPTERS = Object.fromEntries(SOURCE_IDS.map((id) => {
  const definition = SOURCES[id]
  const settingsFor = config => config.sources?.[id] ?? definition.defaults
  const adapter = {
    list: ctx => definition.list({ ...ctx, config: settingsFor(ctx.config) }),
  }
  if (definition.extract) {
    adapter.extract = ctx => definition.extract({ ...ctx, config: settingsFor(ctx.config) })
  }
  return [id, adapter]
}))

function adapterFor(id, adapters) {
  return adapters?.[id] ?? BUILTIN_ADAPTERS[id] ?? null
}

function usageError(code, message) {
  return Object.assign(new Error(message), { code, exitCode: 2, status: 400 })
}

function asDate(value) {
  return value instanceof Date ? value : new Date(value)
}

function unique(values) {
  return [...new Set(values)]
}

/** Resolve the storage port, letting a caller override one operation. */
function storagePort(overrides) {
  return { ...defaultStorage, ...(overrides ?? {}) }
}

/** List the candidates one source offers for the day. */
async function listSource(id, ctx, adapters) {
  const adapter = adapterFor(id, adapters)
  if (!adapter?.list) {
    throw Object.assign(new Error(`source "${id}" is not implemented`), { code: 'source_unimplemented' })
  }
  return adapter.list(ctx)
}

/**
 * The source an adapter reads a candidate's body from. HF papers live on arXiv,
 * so their candidates declare `extractVia: 'arxiv'`; this keeps the proxy
 * policy per transport instead of per list.
 */
export function extractViaOf(candidate) {
  return candidate.extractVia ?? candidate.sourceId
}

/** Extract one selected candidate into reader blocks. */
export async function extractCandidate(candidate, { config, fetch: fetchImpl, adapters = null, proxy = null } = {}) {
  const sourceId = extractViaOf(candidate)
  const adapter = adapterFor(sourceId, adapters)
  if (!adapter?.extract) {
    throw Object.assign(new Error(`no extractor for source "${sourceId}"`), { code: 'source_unimplemented' })
  }
  return adapter.extract({ candidate, config, fetch: fetchImpl, proxy })
}

/**
 * Resolve the proxy policy for the sources that need it.
 *
 * Two kinds of need are supported:
 * - `fullProxyIds`: the source cannot even be listed without the proxy (HF). A
 *   proxy failure marks the source `skipped`; the run never retries it direct.
 * - `extractProxyIds`: the list is direct, but the article page needs the proxy
 *   (OpenAI). A proxy failure keeps the source in the run and only its
 *   extraction degrades to an excerpt.
 *
 * The returned `state` is data (safe to store in the digest and run record);
 * `transport` is the fetch the proxied requests must use, and is `null` whenever
 * the state is not `ok`. A proxied source never receives the direct fetch.
 */
async function prepareProxy({
  config,
  env,
  fullProxyIds = [],
  extractProxyIds = [],
  proxyFetch,
  fetchImpl,
  now,
}) {
  const settings = config.proxy ?? {}
  const needsProxy = [...new Set([...fullProxyIds, ...extractProxyIds])]
  const state = {
    status: 'not_needed',
    origin: null,
    url: null,
    healthCheckUrl: settings.healthCheckUrl ?? null,
    timeoutMs: settings.timeoutMs ?? null,
    checkedAt: null,
    latencyMs: null,
    code: null,
    error: null,
    reason: null,
    skipped: [...fullProxyIds],
    extractSkipped: [],
    probed: false,
  }
  if (needsProxy.length === 0) return { state, transport: null }

  const resolved = resolveProxyUrl({ config, env })
  state.origin = resolved.origin
  state.url = redactProxyUrl(resolved.url)

  const unavailable = (status, code, error) => {
    state.status = status
    state.code = code
    state.error = error
    state.reason = proxySkipReason(code)
    state.skipped = [...fullProxyIds]
    state.extractSkipped = [...extractProxyIds]
    return { state, transport: null }
  }

  if (!resolved.url) {
    return unavailable(resolved.code === 'proxy_invalid' ? 'failed' : 'unconfigured', resolved.code, resolved.error)
  }

  let transport = proxyFetch
  if (!transport && resolved.origin === 'env') {
    if (env?.NODE_USE_ENV_PROXY === '1') {
      // Node routes its own fetch through the environment proxy under this flag.
      transport = fetchImpl
    } else {
      return unavailable(
        'failed',
        'proxy_env_disabled',
        'HTTP(S)_PROXY is set but NODE_USE_ENV_PROXY is not; start Node with NODE_USE_ENV_PROXY=1',
      )
    }
  }
  if (!transport) {
    return unavailable(
      'failed',
      'proxy_transport_missing',
      'proxy.url is configured but no proxy-capable fetch was provided',
    )
  }

  const health = await checkProxyHealth({
    url: resolved.url,
    fetch: transport,
    healthCheckUrl: settings.healthCheckUrl,
    timeoutMs: settings.timeoutMs,
    now,
  })
  state.status = health.status
  state.code = health.code
  state.error = health.error
  state.checkedAt = health.checkedAt
  state.latencyMs = health.latencyMs
  state.probed = true
  state.reason = health.status === 'ok' ? null : proxySkipReason(health.code)
  if (health.status === 'ok') {
    state.skipped = []
    state.extractSkipped = []
  } else {
    state.skipped = [...fullProxyIds]
    state.extractSkipped = [...extractProxyIds]
  }
  return { state, transport: health.status === 'ok' ? transport : null }
}

/** Text blocks start pending: the translation stage fills them later. */
function pendingBlocks(blocks) {
  return blocks.map((block) => {
    if (isTextBlock(block)) return { ...block, translation: null }
    if (block.type === 'figure' && block.caption) {
      return { ...block, caption: { ...block.caption, translation: null } }
    }
    return block
  })
}

const CJK = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/g

/**
 * Reading time in minutes. CJK characters are read faster per character than
 * an English word, so they are counted separately instead of collapsing a
 * Chinese paragraph into "one word".
 */
export function readingMinutesOf(blocks) {
  const text = blocks.map(readableTextOf).join(' ')
  const cjk = (text.match(CJK) ?? []).length
  const words = text.replace(CJK, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(cjk / 350 + words / 180))
}

/**
 * Build the digest item.
 *
 * Two extraction shapes meet here:
 * - sources that already carry final original/translation pairs (DeepSeek's
 *   official bilingual pages) set `finalized: true` and their text is kept as
 *   written;
 * - blog adapters return `meta` for the fields only the article page knows
 *   (the sitemap candidate has just a slug), and the prose starts pending so
 *   the translation service can fill it later.
 *
 * Contract: `sourceId` and `publishedAt` are the only spellings written; the
 * old `source` / `published` keys were aliases and are not emitted.
 */
export function toDigestItem(candidate, extraction, { collectedAt }) {
  const finalized = extraction.finalized === true
  const meta = extraction.meta ?? {}
  const blocks = finalized ? (extraction.blocks ?? []) : pendingBlocks(extraction.blocks ?? [])
  // Captions and notes may come from an extractor that never created a
  // translation key (for example a table caption). The contract wants the key
  // present with `null`, not absent.
  const pairedBlocks = blocks.map((block) => {
    const next = { ...block }
    for (const key of ['caption', 'note']) {
      if (next[key] && typeof next[key] === 'object' && !Object.prototype.hasOwnProperty.call(next[key], 'translation')) {
        next[key] = { ...next[key], translation: null }
      }
    }
    return next
  })
  // An extractor may refine what the list declared: the article page knows the
  // canonical title, date and author list, the RSS only the headline.
  const publishedAt = normalizeInstant(extraction.publishedAt ?? meta.publishedAt ?? candidate.publishedAt)
  const authors = Array.isArray(extraction.authors) && extraction.authors.length > 0
    ? extraction.authors
    : Array.isArray(meta.authors) && meta.authors.length > 0
      ? meta.authors
      : Array.isArray(candidate.authors) ? candidate.authors : []
  const venue = meta.venue ?? candidate.venue
    ?? (candidate.primaryCategory ? `arXiv ${candidate.primaryCategory}` : null)
  const title = finalized && extraction.title
    ? { original: extraction.title.original, translation: extraction.title.translation ?? null }
    : { original: extraction.title || meta.title || candidate.title, translation: null }
  let summary = null
  if (finalized) {
    summary = extraction.summary ?? null
  } else {
    const summaryText = meta.summary ?? candidate.summary
    summary = summaryText ? { original: summaryText, translation: null } : null
  }

  const sourceLanguage = finalized ? extraction.sourceLanguage : (meta.sourceLanguage ?? candidate.sourceLanguage)

  return {
    id: candidate.id,
    sourceId: candidate.sourceId,
    sourceLanguage: sourceLanguage === 'zh' ? 'zh' : 'en',
    title,
    // The contract keeps `summary` optional: a source with no dek (Kimi, an
    // arXiv excerpt) omits the key instead of writing `null`, which the digest
    // validator rejects and which would cost the whole day's file.
    ...(summary ? { summary } : {}),
    authors,
    venue,
    publishedAt,
    collectedAt,
    direction: extraction.direction ?? meta.direction ?? candidate.direction ?? 'architecture',
    tags: Array.isArray(meta.tags)
      ? meta.tags
      : Array.isArray(candidate.tags) ? candidate.tags : [],
    readingMinutes: readingMinutesOf(blocks),
    excerpt: extraction.excerpt === true,
    ...(extraction.excerptReason ? { excerptReason: extraction.excerptReason } : {}),
    url: meta.url ?? candidate.url ?? null,
    translationState: finalized ? (extraction.translationState ?? 'pending') : 'pending',
    blocks: pairedBlocks,
  }
}

/**
 * Stage 1: list every active source.
 *
 * Returns the candidates plus one report per source. A proxied source whose
 * transport is unavailable is reported `skipped` and never retried directly.
 */
async function listSources({
  activeSources,
  proxiedSources,
  proxy,
  config,
  date,
  fetchFor,
  counters,
  adapters,
  sourceState,
  knownUrlsFor,
  storage,
  now,
}) {
  const candidates = []
  const reports = []
  let state = sourceState
  let stateChanged = false

  for (const id of activeSources) {
    const definition = sourceDefinition(id)
    if (proxiedSources.includes(id) && !proxy.transport) {
      reports.push({
        id,
        kind: definition?.kind ?? 'paper',
        status: 'skipped',
        candidates: 0,
        selected: 0,
        skipped: 0,
        requests: 0,
        durationMs: 0,
        error: proxy.state.reason,
        code: proxy.state.code,
        reason: proxy.state.reason,
      })
      continue
    }
    const sourceStarted = Date.now()
    try {
      const listed = await listSource(
        id,
        { config, date, fetch: fetchFor(id), proxy: { ...proxy.state, available: Boolean(proxy.transport) }, knownUrls: knownUrlsFor(id) },
        adapters,
      )
      const discovered = Array.isArray(listed)
        ? listed.map(candidate => candidate.url)
        : Array.isArray(listed?.discovered) ? listed.discovered : []
      const list = Array.isArray(listed) ? listed : (listed?.candidates ?? [])
      candidates.push(...list)
      if (definition?.tracksSeen && discovered.length > 0) {
        state = storage.mergeSourceSeen(state, id, discovered, {
          date,
          updatedAt: asDate(now()).toISOString(),
          maxUrls: config.sources?.[id]?.maxSeenUrls,
        })
        stateChanged = true
      }
      reports.push({
        id,
        kind: definition?.kind ?? 'paper',
        status: 'ok',
        candidates: list.length,
        selected: 0,
        skipped: 0,
        requests: counters.get(id)?.requests ?? 0,
        durationMs: Date.now() - sourceStarted,
        error: null,
      })
    } catch (error) {
      reports.push({
        id,
        kind: definition?.kind ?? 'paper',
        status: 'failed',
        candidates: 0,
        selected: 0,
        skipped: 0,
        requests: counters.get(id)?.requests ?? 0,
        durationMs: Date.now() - sourceStarted,
        error: String(error?.message ?? error),
        // A stable code is what the status page shows; the error text stays
        // diagnostic detail. Unknown transport errors get the generic code.
        code: error?.code ?? 'source_failed',
        reason: error?.code ?? 'source_failed',
      })
    }
  }

  return { candidates, reports, sourceState: state, stateChanged }
}

/**
 * Stage 2: extract the selected candidates.
 *
 * A blog item with no readable page is dropped (`onExtractFailure: 'skip'`); a
 * paper falls back to its abstract excerpt. Items already carrying official
 * pairs (`finalized`) are returned in `officialIds`: the translation stage must
 * never touch them.
 */
async function extractSelected({
  selection,
  reports,
  config,
  fetchFor,
  adapters,
  extractProxiedSources,
  proxyState,
  collectedAt,
}) {
  const items = []
  const officialIds = new Set()
  const warnings = []
  let extractionFailures = 0
  let skipped = 0

  const skipItem = (report) => {
    if (report) {
      report.selected = Math.max(0, report.selected - 1)
      report.skipped = (report.skipped ?? 0) + 1
    }
    skipped += 1
  }

  for (const candidate of selection.selected) {
    const report = reports.find(entry => entry.id === candidate.sourceId)
    if (report) report.selected += 1
    let extraction
    try {
      extraction = await extractCandidate(candidate, {
        config,
        fetch: fetchFor(extractViaOf(candidate), 'extract'),
        adapters,
        // Only a source whose extraction is proxy-routed reads the proxy state;
        // with the switch off its fetch is the direct one.
        proxy: extractProxiedSources.includes(candidate.sourceId) ? proxyState : null,
      })
    } catch (error) {
      const definition = sourceDefinition(candidate.sourceId)
      if (definition?.onExtractFailure === 'skip') {
        warnings.push({ id: candidate.id, message: `extraction failed: ${error?.message ?? error}` })
        skipItem(report)
        continue
      }
      extractionFailures += 1
      extraction = { blocks: excerptBlocks(candidate), excerpt: true, warnings: [] }
      warnings.push({ id: candidate.id, message: `extraction failed: ${error?.message ?? error}` })
    }
    for (const warning of extraction.warnings ?? []) warnings.push({ id: candidate.id, message: warning })
    if (extraction.skip === true) {
      skipItem(report)
      continue
    }
    const item = toDigestItem(candidate, extraction, { collectedAt })
    if (extraction.finalized === true) officialIds.add(item.id)
    items.push(item)
  }

  return { items, officialIds, warnings, extractionFailures, skipped }
}

/** Stage 3: translation, with official bilingual items explicitly skipped. */
async function translateSelected({ items, officialIds, root, config, env, fetchImpl, dryRun, date, storage, warnings }) {
  const budgetUsed = await translationTokensUsed({ root, date, dryRun, storage })
  const translationResult = await translateItems({
    items,
    root,
    config,
    env,
    fetch: fetchImpl,
    dryRun,
    budgetUsed,
    // DeepSeek's official pairs are final text, not requests: a missing side
    // stays `pending` rather than being machine-translated against the spec.
    skipIds: officialIds,
  })
  const translation = translationResult.stats

  if (translation.status === 'skipped' && translation.reason === 'missing_llm_config') {
    warnings.push({ id: null, message: `translation skipped: set ${translation.missing.join(', ')}` })
  } else if (translation.status === 'skipped' && translation.reason === 'disabled') {
    warnings.push({ id: null, message: 'translation is disabled in config.json (translation.enabled=false)' })
  } else if (translation.budgetExceeded) {
    warnings.push({
      id: null,
      message: `translation stopped at the daily token budget (${translation.tokensUsed}/${translation.tokenBudget});`
        + ` ${translation.pendingItems} item(s) left pending`,
    })
  } else if (translation.failedUnits > 0) {
    warnings.push({
      id: null,
      message: `${translation.failedUnits} translation block(s) failed; the affected items stay partial or pending`,
    })
  }
  return translation
}

/**
 * Tokens already spent on this date. The daily budget is a day cap, not a
 * per-invocation cap, so a manual rerun continues where the scheduled run
 * stopped instead of doubling the spend.
 */
async function translationTokensUsed({ root, date, dryRun, storage }) {
  if (dryRun) return 0
  try {
    const record = await storage.readRunRecord({ root, date })
    const used = Number(record?.translation?.tokensUsed)
    return Number.isFinite(used) && used > 0 ? used : 0
  } catch {
    return 0
  }
}

/** Build the digest's per-source entries, including the failure reason. */
export function sourceEntriesOf(reports, items) {
  return reports.map(report => {
    const entry = {
      id: report.id,
      status: report.status,
      items: items.filter(item => item.sourceId === report.id).length,
    }
    if (report.skipped > 0) entry.skipped = report.skipped
    if (report.error) entry.error = report.error
    if (report.status === 'failed' || report.status === 'skipped') {
      entry.code = report.code ?? (report.status === 'failed' ? 'source_failed' : null)
      entry.reason = report.reason ?? (report.status === 'failed' ? 'source_failed' : null)
      entry.label = sourceLabel(report.id)
    }
    return entry
  })
}

/** Counts the run record and the terminal summary report. */
export function countsOf({ reports, candidates, selection, items, extractionFailures, skipped, proxy }) {
  return {
    sources: reports.length,
    skipped: reports.filter(report => report.status === 'skipped').length,
    candidates: candidates.length,
    selected: selection.stats.selected,
    items: items.length,
    fullText: items.filter(item => item.excerpt === false).length,
    excerpt: items.filter(item => item.excerpt === true).length,
    extractionFailures,
    itemsSkipped: skipped,
    proxyHealthChecks: proxy.state.probed ? 1 : 0,
    translated: items.filter(item => item.translationState === 'complete').length,
    // An excerpt is translated too (title + dek), but it is not full text: the
    // "translated full text" figure the reader sees must not count it.
    fullTextTranslated: items.filter(item => item.excerpt === false && item.translationState === 'complete').length,
    translationPending: items.filter(item => item.translationState !== 'complete').length,
  }
}

/**
 * Run the day.
 *
 * `root` is `$DSH_HOME/paper-reader`; `date` is the digest date; `config` is
 * the result of `loadConfig`. `dryRun` performs the same fetch, selection and
 * extraction but writes nothing.
 *
 * `proxyFetch` is the transport used for sources that declare `useProxy`; the
 * host (or an environment-proxy-aware process) provides it. `env` is the
 * proxy environment and `adapters` adds source adapters for tests and for
 * later source tickets. `storage` overrides any operation of the persistence
 * port (day file, index, runs, source discovery state); the default is the
 * real `src/storage.js`.
 */
export async function runDaily({
  root,
  date,
  config,
  source = null,
  dryRun = false,
  fetch: fetchImpl = globalThis.fetch,
  proxyFetch = null,
  env = process.env,
  adapters = null,
  now = () => new Date(),
  storage = null,
} = {}) {
  if (typeof root !== 'string' || root.length === 0) throw new TypeError('runDaily needs a data root')
  if (!defaultStorage.isDigestDate(date)) throw usageError('invalid_date', `--date must be a real YYYY-MM-DD date, got ${date}`)
  const availableSources = unique([...SOURCE_IDS, ...Object.keys(adapters ?? {})])
  if (source !== null && !availableSources.includes(source)) {
    throw usageError('unsupported_source', `unsupported source "${source}"; available: ${availableSources.join(', ')}`)
  }

  const store = storagePort(storage)
  const resolved = config ?? defaultConfig()
  const startedAt = asDate(now())
  const startedMs = startedAt.getTime()

  const activeSources = availableSources.filter(id => (source ? id === source : resolved.sources?.[id]?.enabled !== false))
  if (activeSources.length === 0) throw usageError('no_sources', 'no sources are enabled in config.json')

  // A proxied source normally needs the proxy to even list (HF). A source that
  // sets `extractViaProxy` lists directly and only its article pages go through
  // the proxy (OpenAI): a missing proxy degrades extraction instead of skipping
  // the whole source.
  const proxiedSources = activeSources.filter(id => resolved.sources?.[id]?.useProxy === true
    && resolved.sources?.[id]?.extractViaProxy !== true)
  const extractProxiedSources = activeSources.filter(id => resolved.sources?.[id]?.useProxy === true
    && resolved.sources?.[id]?.extractViaProxy === true)
  const proxy = await prepareProxy({
    config: resolved,
    env,
    fullProxyIds: proxiedSources,
    extractProxyIds: extractProxiedSources,
    proxyFetch,
    fetchImpl,
    now,
  })
  /** The proxy state adapters read; `available` decides full text vs excerpt. */
  const proxyState = { ...proxy.state, available: Boolean(proxy.transport) }
  const needsProxy = (id) => proxiedSources.includes(id) || extractProxiedSources.includes(id)

  const counters = new Map(activeSources.map(id => [id, {
    requests: 0,
    listTransport: proxiedSources.includes(id) ? proxy.transport : fetchImpl,
    extractTransport: needsProxy(id) ? proxy.transport : fetchImpl,
  }]))
  /**
   * Per-source fetch that counts requests. A proxied phase never falls back to
   * the direct fetch: without a transport it fails, and the adapter degrades.
   */
  const fetchFor = (id, phase = 'list') => {
    let counter = counters.get(id)
    if (!counter) {
      counter = { requests: 0, listTransport: fetchImpl, extractTransport: fetchImpl }
      counters.set(id, counter)
    }
    const target = counter
    return async (url, init) => {
      target.requests += 1
      const transport = phase === 'extract' ? target.extractTransport : target.listTransport
      if (typeof transport !== 'function') {
        throw Object.assign(new Error(`proxy unavailable for ${id} ${phase}`), { code: 'proxy_unavailable' })
      }
      return transport(url, init)
    }
  }

  const warnings = []
  let sourceState = { schemaVersion: 1, updatedAt: null, sources: {} }
  try {
    sourceState = (await store.readSourceState({ root })).state
  } catch (error) {
    // Discovery memory is an optimization: losing it re-offers the archive,
    // which is recoverable, so it must never abort the day.
    warnings.push({ id: null, message: `source discovery state could not be read: ${error?.message ?? error}` })
  }

  /**
   * URLs any *other* day already offered.
   *
   * The rule is "shown on a different date", not "shown earlier": re-running
   * today keeps today's items (they were recorded with today's date), while a
   * backfill of an older date does not resurrect posts that a later day already
   * ran. Filtering only `firstSeen < date` made every backfilled day repeat the
   * same blog posts, because their first-seen date was later than the day being
   * rebuilt.
   */
  const knownUrlsFor = (id) => {
    const seen = sourceState.sources?.[id]?.seen
    if (!seen || typeof seen !== 'object') return []
    return Object.entries(seen)
      .filter(([, firstSeen]) => typeof firstSeen === 'string' && firstSeen !== date)
      .map(([url]) => url)
  }

  const listed = await listSources({
    activeSources,
    proxiedSources,
    proxy,
    config: resolved,
    date,
    fetchFor,
    counters,
    adapters,
    sourceState,
    knownUrlsFor,
    storage: store,
    now,
  })
  const { candidates, reports } = listed
  sourceState = listed.sourceState
  const stateChanged = listed.stateChanged

  const sourceSettings = activeSources.map(id => resolved.sources?.[id] ?? {})
  // Category rules belong to the source that declared them: arXiv categories
  // must not filter an OpenAI post that categorises itself as "Product".
  const categoriesBySource = Object.fromEntries(
    activeSources
      .map(id => [id, resolved.sources?.[id]?.categories])
      .filter(([, categories]) => Array.isArray(categories) && categories.length > 0),
  )
  // Quality gate: score every candidate before the quota is applied, so a day
  // with four mediocre posts yields fewer items instead of an unreadable list.
  const importance = await scoreImportance({
    candidates,
    config: resolved,
    env,
    fetchImpl,
    now,
  })
  if (importance.failed) {
    warnings.push({ id: null, message: `importance scoring failed: ${importance.reason}` })
  }
  const selection = selectDaily(importance.scored, {
    quota: resolved.quota,
    categoriesBySource,
    includeKeywords: unique(sourceSettings.flatMap(settings => settings.keywords ?? [])),
    excludeKeywords: unique(sourceSettings.flatMap(settings => settings.excludeKeywords ?? [])),
    sourceWeights: resolved.selection?.sourceWeights,
    institutions: resolved.selection?.institutions,
    importance: resolved.selection?.importance,
  })

  const collectedAt = asDate(now()).toISOString()
  const extracted = await extractSelected({
    selection,
    reports,
    config: resolved,
    fetchFor,
    adapters,
    extractProxiedSources,
    proxyState,
    collectedAt,
  })
  const { items, officialIds, extractionFailures, skipped } = extracted
  warnings.push(...extracted.warnings)

  // Translate the selected items before anything is written. A missing model
  // configuration is an explicit skip (everything stays pending), never a
  // silent no-op; a failed block or an exhausted budget only leaves the
  // affected items pending and never fails the day.
  const translation = await translateSelected({
    items,
    officialIds,
    root,
    config: resolved,
    env,
    fetchImpl,
    dryRun,
    date,
    storage: store,
    warnings,
  })

  // Extraction adds requests after the listing report was created.
  for (const report of reports) {
    const counter = counters.get(report.id)
    if (counter) report.requests = counter.requests
  }

  const finishedAt = asDate(now())
  const durationMs = Math.max(0, finishedAt.getTime() - startedMs)
  const finishedIso = finishedAt.toISOString()
  const okSources = reports.filter(report => report.status === 'ok').length
  const status = okSources === 0 ? 'failed' : okSources === reports.length ? 'ok' : 'partial'
  const shouldWrite = okSources > 0

  const sourceEntries = sourceEntriesOf(reports, items)
  const digest = {
    schemaVersion: 2,
    date,
    generatedAt: finishedIso,
    run: {
      status,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedIso,
      durationMs,
      proxy: proxy.state,
      sources: sourceEntries,
      translation: {
        status: translation.status,
        reason: translation.reason,
        model: translation.model,
        targetLanguage: translation.targetLanguage,
        tokensUsed: translation.tokensUsed,
        tokenBudget: translation.tokenBudget,
        budgetExceeded: translation.budgetExceeded,
        pendingItems: translation.pendingItems,
      },
    },
    directions: DIRECTION_META,
    sources: SOURCE_META,
    items,
  }

  const counts = countsOf({ reports, candidates, selection, items, extractionFailures, skipped, proxy })

  const written = { digest: null, index: null, run: null, state: null, bytes: 0 }
  let digestError = null

  if (!dryRun) {
    if (shouldWrite) {
      try {
        const result = await store.writeDayDigest({
          root,
          digest,
          now: finishedAt,
          retentionDays: resolved.retentionDays,
        })
        written.digest = result.path
        written.index = store.storagePaths(root).indexPath
        written.bytes = result.bytes
      } catch (error) {
        digestError = error
      }
    }

    // Only remember the discovery difference once the day is safely written:
    // if the digest failed, tomorrow's run must be able to retry these URLs.
    if (shouldWrite && !digestError && stateChanged) {
      try {
        const result = await store.writeSourceState({ root, state: sourceState, now: finishedAt })
        written.state = result.path
      } catch (error) {
        warnings.push({ id: null, message: `source discovery state not written: ${error?.message ?? error}` })
      }
    }

    const record = {
      schemaVersion: 1,
      date,
      status,
      dryRun: false,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedIso,
      durationMs,
      args: { source },
      proxy: proxy.state,
      sources: reports,
      counts,
      selection: selection.stats,
      translation,
      warnings,
      digest: {
        written: Boolean(written.digest),
        path: written.digest,
        bytes: written.bytes,
        error: digestError ? String(digestError.message ?? digestError) : null,
      },
      sourceState: {
        written: Boolean(written.state),
        path: written.state,
      },
    }
    try {
      await store.writeRunRecord({ root, date, record, retentionDays: resolved.retentionDays })
      written.run = store.storagePaths(root).runPath(date)
    } catch (error) {
      warnings.push({ id: null, message: `run record not written: ${error?.message ?? error}` })
    }
  }

  const errors = []
  if (digestError) errors.push(String(digestError.message ?? digestError))
  for (const report of reports) {
    if (report.status === 'failed') errors.push(`${report.id}: ${report.error}`)
    if (report.status === 'skipped') errors.push(`${report.id}: skipped because ${report.reason}`)
  }
  if (shouldWrite && digestError) errors.push('the day digest was not written')

  const exitCode = dryRun
    ? (okSources > 0 ? 0 : 1)
    : (written.digest && !digestError ? 0 : 1)

  return {
    date,
    dryRun,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedIso,
    durationMs,
    counts,
    proxy: proxy.state,
    sources: reports,
    selection: selection.stats,
    translation,
    warnings,
    digest,
    written,
    errors,
    exitCode,
  }
}
