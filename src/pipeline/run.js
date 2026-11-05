/**
 * One daily pipeline run: list sources → select → extract → write.
 *
 * This is the high seam the tests drive. All I/O is injected (`fetch`, clock)
 * or delegated to `src/storage.js`, so a run is reproducible from fixtures and
 * the CLI, a future scheduler and the tests share exactly one code path.
 *
 * Failure rules:
 * - one source failing does not stop the others (`status: "partial"`);
 * - one paper's HTML failing does not drop that paper (it becomes `excerpt`);
 * - if every source fails nothing is written for the day, the run record says
 *   why, and the previous day files stay untouched.
 */
import { defaultConfig } from '../config.js'
import { checkProxyHealth, proxySkipReason, redactProxyUrl, resolveProxyUrl } from '../proxy.js'
import {
  DEFAULT_ARXIV_CONFIG,
  excerptBlocks,
  extractArxivPaper,
  listArxiv,
} from '../sources/arxiv.js'
import {
  DEFAULT_OPENAI_CONFIG,
  extractOpenAiArticle,
  listOpenAi,
} from '../sources/openai.js'
import {
  DEFAULT_DEEPSEEK_CONFIG,
  extractDeepSeekArticle,
  listDeepSeek,
} from '../sources/deepseek.js'
import { DEFAULT_ANTHROPIC_CONFIG, extractAnthropicArticle, listAnthropic } from '../sources/anthropic.js'
import { DEFAULT_KIMI_CONFIG, extractKimiArticle, listKimi } from '../sources/kimi.js'
import { DEFAULT_HF_CONFIG, listHf } from '../sources/hf.js'
import { SOURCE_IDS, sourceDefinition } from '../sources/registry.js'
import {
  isDigestDate,
  mergeSourceSeen,
  readRunRecord,
  readSourceState,
  storagePaths,
  writeDayDigest,
  writeRunRecord,
  writeSourceState,
} from '../storage.js'
import { translateItems } from '../translate/service.js'
import { selectDaily } from './select.js'

export { SOURCE_IDS }

export const DIRECTION_META = [
  { id: 'agent', label: 'Agent', labelEn: 'Agents' },
  { id: 'reasoning', label: '推理', labelEn: 'Reasoning' },
  { id: 'training', label: '训练', labelEn: 'Training' },
  { id: 'alignment', label: '对齐', labelEn: 'Alignment' },
  { id: 'architecture', label: '架构', labelEn: 'Architecture' },
]

export const SOURCE_META = [
  { id: 'arxiv', label: 'arXiv', short: 'A' },
  { id: 'deepseek', label: 'DeepSeek', short: 'D' },
  { id: 'anthropic', label: 'Anthropic', short: 'C' },
  { id: 'kimi', label: 'Kimi', short: 'K' },
  { id: 'hf', label: 'Hugging Face', short: 'H' },
  { id: 'openai', label: 'OpenAI', short: 'O' },
]

const SOURCE_LABELS = new Map(SOURCE_META.map(source => [source.id, source.label]))

/**
 * Built-in source adapters. Later source tickets add theirs here; the run also
 * accepts an `adapters` override so a two-source proxy scenario is testable
 * without inventing a production adapter.
 *
 * HF has no extractor of its own: its candidates declare `extractVia: 'arxiv'`,
 * so the arXiv adapter reads the body from `arxiv.org/html/<id>`. A source that
 * reuses another source's body simply declares where it lives.
 */
const BUILTIN_ADAPTERS = {
  arxiv: {
    list: ({ config, date, fetch }) => listArxiv({
      config: config.sources?.arxiv ?? DEFAULT_ARXIV_CONFIG,
      date,
      fetch,
    }),
    extract: ({ candidate, config, fetch }) => extractArxivPaper({
      candidate,
      config: config.sources?.arxiv ?? DEFAULT_ARXIV_CONFIG,
      fetch,
    }),
  },
  deepseek: {
    list: ({ config, date, fetch }) => listDeepSeek({
      config: config.sources?.deepseek ?? DEFAULT_DEEPSEEK_CONFIG,
      date,
      fetch,
    }),
    extract: ({ candidate, config, fetch }) => extractDeepSeekArticle({
      candidate,
      config: config.sources?.deepseek ?? DEFAULT_DEEPSEEK_CONFIG,
      fetch,
    }),
  },
  anthropic: {
    list: ({ config, date, fetch, knownUrls }) => listAnthropic({
      config: config.sources?.anthropic ?? DEFAULT_ANTHROPIC_CONFIG,
      date,
      fetch,
      knownUrls,
    }),
    extract: ({ candidate, config, fetch }) => extractAnthropicArticle({
      candidate,
      config: config.sources?.anthropic ?? DEFAULT_ANTHROPIC_CONFIG,
      fetch,
    }),
  },
  kimi: {
    list: ({ config, date, fetch }) => listKimi({
      config: config.sources?.kimi ?? DEFAULT_KIMI_CONFIG,
      date,
      fetch,
    }),
    extract: ({ candidate, config, fetch }) => extractKimiArticle({
      candidate,
      config: config.sources?.kimi ?? DEFAULT_KIMI_CONFIG,
      fetch,
    }),
  },
  hf: {
    list: ({ config, date, fetch }) => listHf({
      config: config.sources?.hf ?? DEFAULT_HF_CONFIG,
      date,
      fetch,
    }),
  },
  openai: {
    list: ({ config, fetch }) => listOpenAi({
      config: config.sources?.openai ?? DEFAULT_OPENAI_CONFIG,
      fetch,
    }),
    extract: ({ candidate, config, fetch, proxy }) => extractOpenAiArticle({
      candidate,
      config: config.sources?.openai ?? DEFAULT_OPENAI_CONFIG,
      fetch,
      proxy,
    }),
  },
}

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
 * so their candidates point at the arXiv adapter and the arXiv transport; this
 * keeps the proxy policy per transport instead of per list.
 */
function bodySourceOf(candidate) {
  return candidate.extractVia ?? candidate.sourceId
}

/** Extract one selected candidate into reader blocks. */
export async function extractCandidate(candidate, { config, fetch: fetchImpl, adapters = null, proxy = null } = {}) {
  const adapter = adapterFor(bodySourceOf(candidate), adapters)
  if (!adapter?.extract) {
    throw Object.assign(new Error(`no extractor for source "${bodySourceOf(candidate)}"`), { code: 'source_unimplemented' })
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

/** Text blocks start pending: the translation ticket fills them later. */
function pendingBlocks(blocks) {
  return blocks.map((block) => {
    if (block.type === 'heading' || block.type === 'paragraph') {
      return { ...block, translation: null }
    }
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
function readingMinutesOf(blocks) {
  const text = blocks
    .map(block => block.code ?? block.original ?? block.caption?.original ?? block.display ?? '')
    .join(' ')
  const cjk = (text.match(CJK) ?? []).length
  const words = text.replace(CJK, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(cjk / 350 + words / 180))
}

/**
 * Tokens already spent on this date. The daily budget is a day cap, not a
 * per-invocation cap, so a manual rerun continues where the scheduled run
 * stopped instead of doubling the spend.
 */
async function translationTokensUsed({ root, date, dryRun }) {
  if (dryRun) return 0
  try {
    const record = await readRunRecord({ root, date })
    const used = Number(record?.translation?.tokensUsed)
    return Number.isFinite(used) && used > 0 ? used : 0
  } catch {
    return 0
  }
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
 */
function toDigestItem(candidate, extraction, { collectedAt }) {
  const finalized = extraction.finalized === true
  const meta = extraction.meta ?? {}
  const blocks = finalized ? (extraction.blocks ?? []) : pendingBlocks(extraction.blocks ?? [])
  // An extractor may refine what the list declared: the article page knows the
  // canonical title, date and author list, the RSS only the headline. Blog
  // adapters report those through `meta`; arXiv/OpenAI on the extraction itself.
  const publishedAt = extraction.publishedAt ?? meta.publishedAt ?? candidate.publishedAt ?? null
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
    source: candidate.sourceId,
    sourceId: candidate.sourceId,
    sourceLanguage: sourceLanguage === 'zh' ? 'zh' : 'en',
    title,
    summary,
    authors,
    venue,
    published: meta.published
      ?? candidate.published
      ?? (publishedAt ? String(publishedAt).slice(0, 10) : null),
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
    blocks,
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
 * later source tickets.
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
} = {}) {
  if (typeof root !== 'string' || root.length === 0) throw new TypeError('runDaily needs a data root')
  if (!isDigestDate(date)) throw usageError('invalid_date', `--date must be a real YYYY-MM-DD date, got ${date}`)
  const availableSources = unique([...SOURCE_IDS, ...Object.keys(adapters ?? {})])
  if (source !== null && !availableSources.includes(source)) {
    throw usageError('unsupported_source', `unsupported source "${source}"; available: ${availableSources.join(', ')}`)
  }

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
  /** The proxy state adapters read; `available` is what decides full text vs excerpt. */
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
    sourceState = (await readSourceState({ root })).state
  } catch (error) {
    // Discovery memory is an optimization: losing it re-offers the archive,
    // which is recoverable, so it must never abort the day.
    warnings.push({ id: null, message: `source discovery state could not be read: ${error?.message ?? error}` })
  }
  let stateChanged = false

  /** URLs an earlier day already offered; a same-day URL stays new. */
  const knownUrlsFor = (id) => {
    const seen = sourceState.sources?.[id]?.seen
    if (!seen || typeof seen !== 'object') return []
    return Object.entries(seen)
      .filter(([, firstSeen]) => typeof firstSeen === 'string' && firstSeen < date)
      .map(([url]) => url)
  }

  const candidates = []
  const reports = []
  for (const id of activeSources) {
    const definition = sourceDefinition(id)
    if (proxiedSources.includes(id) && !proxy.transport) {
      // A proxied source is skipped, never retried through a direct connection.
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
        { config: resolved, date, fetch: fetchFor(id), proxy: proxyState, knownUrls: knownUrlsFor(id) },
        adapters,
      )
      const discovered = Array.isArray(listed)
        ? listed.map(candidate => candidate.url)
        : Array.isArray(listed?.discovered) ? listed.discovered : []
      const list = Array.isArray(listed) ? listed : (listed?.candidates ?? [])
      candidates.push(...list)
      if (definition?.tracksSeen && discovered.length > 0) {
        sourceState = mergeSourceSeen(sourceState, id, discovered, {
          date,
          updatedAt: startedAt.toISOString(),
          maxUrls: resolved.sources?.[id]?.maxSeenUrls,
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
        requests: counters.get(id).requests,
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
      })
    }
  }

  const sourceSettings = activeSources.map(id => resolved.sources?.[id] ?? {})
  // Category rules belong to the source that declared them: arXiv categories
  // must not filter an OpenAI post that categorises itself as "Product".
  const categoriesBySource = Object.fromEntries(
    activeSources
      .map(id => [id, resolved.sources?.[id]?.categories])
      .filter(([, categories]) => Array.isArray(categories) && categories.length > 0),
  )
  const selection = selectDaily(candidates, {
    quota: resolved.quota,
    categoriesBySource,
    includeKeywords: unique(sourceSettings.flatMap(settings => settings.keywords ?? [])),
    excludeKeywords: unique(sourceSettings.flatMap(settings => settings.excludeKeywords ?? [])),
  })

  const collectedAt = asDate(now()).toISOString()
  const items = []
  let extractionFailures = 0
  let skipped = 0

  /** A blog item with no readable page is dropped, not written as an empty shell. */
  const skipItem = (candidate, report) => {
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
        config: resolved,
        fetch: fetchFor(bodySourceOf(candidate), 'extract'),
        adapters,
        // Only a source whose extraction is proxy-routed reads the proxy state;
        // with the switch off its fetch is the direct one.
        proxy: extractProxiedSources.includes(candidate.sourceId) ? proxyState : null,
      })
    } catch (error) {
      const definition = sourceDefinition(candidate.sourceId)
      if (definition?.onExtractFailure === 'skip') {
        warnings.push({ id: candidate.id, message: `extraction failed: ${error?.message ?? error}` })
        skipItem(candidate, report)
        continue
      }
      extractionFailures += 1
      extraction = {
        blocks: excerptBlocks(candidate),
        excerpt: true,
        warnings: [],
      }
      warnings.push({ id: candidate.id, message: `extraction failed: ${error?.message ?? error}` })
    }
    for (const warning of extraction.warnings ?? []) warnings.push({ id: candidate.id, message: warning })
    if (extraction.skip === true) {
      skipItem(candidate, report)
      continue
    }
    items.push(toDigestItem(candidate, extraction, { collectedAt }))
  }

  // Translate the selected items before anything is written. A missing model
  // configuration is an explicit skip (everything stays pending), never a
  // silent no-op; a failed block or an exhausted budget only leaves the
  // affected items pending and never fails the day.
  const translationResult = await translateItems({
    items,
    root,
    config: resolved,
    env,
    fetch: fetchImpl,
    dryRun,
    budgetUsed: await translationTokensUsed({ root, date, dryRun }),
  })
  const translation = translationResult.stats
  if (translation.status === 'skipped' && translation.reason === 'missing_llm_config') {
    warnings.push({
      id: null,
      message: `translation skipped: set ${translation.missing.join(', ')}`,
    })
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

  const sourceEntries = reports.map(report => {
    const entry = {
      id: report.id,
      status: report.status,
      items: items.filter(item => item.sourceId === report.id).length,
    }
    if (report.skipped > 0) entry.skipped = report.skipped
    if (report.error) entry.error = report.error
    if (report.status === 'skipped') {
      // A skipped source has no items to derive a label from, so it carries the
      // reason and label the page needs to explain the gap.
      entry.code = report.code
      entry.reason = report.reason
      entry.label = SOURCE_LABELS.get(report.id) ?? report.id
    }
    return entry
  })

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

  const counts = {
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

  const written = { digest: null, index: null, run: null, state: null, bytes: 0 }
  let digestError = null

  if (!dryRun) {
    if (shouldWrite) {
      try {
        const result = await writeDayDigest({
          root,
          digest,
          now: finishedAt,
          retentionDays: resolved.retentionDays,
        })
        written.digest = result.path
        written.index = storagePaths(root).indexPath
        written.bytes = result.bytes
      } catch (error) {
        digestError = error
      }
    }

    // Only remember the discovery difference once the day is safely written:
    // if the digest failed, tomorrow's run must be able to retry these URLs.
    if (shouldWrite && !digestError && stateChanged) {
      try {
        const result = await writeSourceState({ root, state: sourceState, now: finishedAt })
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
      const result = await writeRunRecord({ root, date, record })
      written.run = result.path
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
