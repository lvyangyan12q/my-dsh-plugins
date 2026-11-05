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
 * - one blog post failing is skipped and counted on its source report;
 * - if every source fails nothing is written for the day, the run record says
 *   why, and the previous day files stay untouched.
 *
 * Sources are described by `src/sources/registry.js`; this file no longer
 * branches on source ids. Discovery memory (`state/sources.json`) records
 * which URLs were first offered on which day, so a sitemap source offers each
 * article once while a same-day rerun stays reproducible.
 */
import { defaultConfig } from '../config.js'
import { excerptBlocks } from '../sources/arxiv.js'
import { SOURCE_IDS, SOURCE_META, sourceDefinition } from '../sources/registry.js'
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

export { SOURCE_IDS, SOURCE_META }

export const DIRECTION_META = [
  { id: 'agent', label: 'Agent', labelEn: 'Agents' },
  { id: 'reasoning', label: '推理', labelEn: 'Reasoning' },
  { id: 'training', label: '训练', labelEn: 'Training' },
  { id: 'alignment', label: '对齐', labelEn: 'Alignment' },
  { id: 'architecture', label: '架构', labelEn: 'Architecture' },
]

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
async function listSource(id, { config, date, fetch: fetchImpl, knownUrls = [] }) {
  const definition = sourceDefinition(id)
  if (!definition) {
    throw Object.assign(new Error(`source "${id}" is not implemented`), { code: 'source_unimplemented' })
  }
  return definition.list({
    config: config.sources?.[id] ?? definition.defaults,
    date,
    fetch: fetchImpl,
    knownUrls,
  })
}

/** Extract one selected candidate into reader blocks. */
export async function extractCandidate(candidate, { config, fetch: fetchImpl }) {
  const definition = sourceDefinition(candidate.sourceId)
  if (!definition) {
    throw Object.assign(new Error(`no extractor for source "${candidate.sourceId}"`), { code: 'source_unimplemented' })
  }
  return definition.extract({
    candidate,
    config: config.sources?.[candidate.sourceId] ?? definition.defaults,
    fetch: fetchImpl,
  })
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

function wordCount(blocks) {
  return blocks
    .map(block => block.code ?? block.original ?? block.caption?.original ?? block.display ?? '')
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length
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

function toDigestItem(candidate, extraction, { collectedAt }) {
  const blocks = pendingBlocks(extraction.blocks ?? [])
  // An adapter may refine the list-level candidate once it has the page
  // metadata (the sitemap only knows a slug; the article knows its real title,
  // date and author).
  const meta = extraction.meta ?? {}
  const title = meta.title ?? candidate.title
  const summaryText = meta.summary ?? candidate.summary
  const summary = summaryText ? { original: summaryText, translation: null } : null
  const publishedAt = meta.publishedAt ?? candidate.publishedAt ?? null
  const published = meta.published
    ?? candidate.published
    ?? (publishedAt ? String(publishedAt).slice(0, 10) : null)
  const authors = Array.isArray(meta.authors) && meta.authors.length > 0
    ? meta.authors
    : Array.isArray(candidate.authors) ? candidate.authors : []
  return {
    id: candidate.id,
    source: candidate.sourceId,
    sourceId: candidate.sourceId,
    sourceLanguage: meta.sourceLanguage === 'zh' || candidate.sourceLanguage === 'zh' ? 'zh' : 'en',
    title: { original: title, translation: null },
    summary,
    authors,
    venue: meta.venue ?? (candidate.primaryCategory ? `arXiv ${candidate.primaryCategory}` : null),
    published,
    publishedAt,
    collectedAt,
    direction: meta.direction ?? candidate.direction ?? 'architecture',
    tags: Array.isArray(meta.tags) ? meta.tags : Array.isArray(candidate.tags) ? candidate.tags : [],
    readingMinutes: Math.max(1, Math.round(wordCount(blocks) / 180)),
    excerpt: extraction.excerpt === true,
    url: meta.url ?? candidate.url ?? null,
    translationState: 'pending',
    blocks,
  }
}

/**
 * Run the day.
 *
 * `root` is `$DSH_HOME/paper-reader`; `date` is the digest date; `config` is
 * the result of `loadConfig`. `dryRun` performs the same fetch, selection and
 * extraction but writes nothing.
 */
export async function runDaily({
  root,
  date,
  config,
  source = null,
  dryRun = false,
  fetch: fetchImpl = globalThis.fetch,
  env = process.env,
  now = () => new Date(),
} = {}) {
  if (typeof root !== 'string' || root.length === 0) throw new TypeError('runDaily needs a data root')
  if (!isDigestDate(date)) throw usageError('invalid_date', `--date must be a real YYYY-MM-DD date, got ${date}`)
  if (source !== null && !SOURCE_IDS.includes(source)) {
    throw usageError('unsupported_source', `unsupported source "${source}"; available: ${SOURCE_IDS.join(', ')}`)
  }

  const resolved = config ?? defaultConfig()
  const startedAt = asDate(now())
  const startedMs = startedAt.getTime()

  const activeSources = SOURCE_IDS.filter(id => (source ? id === source : resolved.sources?.[id]?.enabled !== false))
  if (activeSources.length === 0) throw usageError('no_sources', 'no sources are enabled in config.json')

  const counters = new Map(activeSources.map(id => [id, { requests: 0 }]))
  const fetchFor = (id) => {
    const counter = counters.get(id) ?? { requests: 0 }
    if (!counters.has(id)) counters.set(id, counter)
    return async (url, init) => {
      counter.requests += 1
      return fetchImpl(url, init)
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
    const sourceStarted = Date.now()
    try {
      const listed = await listSource(id, {
        config: resolved,
        date,
        fetch: fetchFor(id),
        knownUrls: knownUrlsFor(id),
      })
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
  const selection = selectDaily(candidates, {
    quota: resolved.quota,
    categories: unique(sourceSettings.flatMap(settings => settings.categories ?? [])),
    includeKeywords: unique(sourceSettings.flatMap(settings => settings.keywords ?? [])),
    excludeKeywords: unique(sourceSettings.flatMap(settings => settings.excludeKeywords ?? [])),
  })

  const collectedAt = asDate(now()).toISOString()
  const items = []
  let extractionFailures = 0
  for (const candidate of selection.selected) {
    const report = reports.find(entry => entry.id === candidate.sourceId)
    if (report) report.selected += 1
    let extraction
    try {
      extraction = await extractCandidate(candidate, { config: resolved, fetch: fetchFor(candidate.sourceId) })
    } catch (error) {
      const definition = sourceDefinition(candidate.sourceId)
      const message = `extraction failed: ${error?.message ?? error}`
      warnings.push({ id: candidate.id, message })
      // A blog post without its page is dropped; a paper without its HTML
      // degrades to the abstract so the day is not lost.
      if (definition?.onExtractFailure === 'skip') {
        if (report) report.skipped = (report.skipped ?? 0) + 1
        continue
      }
      extractionFailures += 1
      extraction = {
        blocks: excerptBlocks(candidate),
        excerpt: true,
        warnings: [],
      }
    }
    for (const warning of extraction.warnings ?? []) warnings.push({ id: candidate.id, message: warning })
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
    candidates: candidates.length,
    selected: selection.stats.selected,
    items: items.length,
    fullText: items.filter(item => item.excerpt === false).length,
    excerpt: items.filter(item => item.excerpt === true).length,
    extractionFailures,
    skipped: reports.reduce((total, report) => total + (report.skipped ?? 0), 0),
    translated: items.filter(item => item.translationState === 'complete').length,
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
