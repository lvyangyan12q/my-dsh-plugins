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
import {
  DEFAULT_ARXIV_CONFIG,
  excerptBlocks,
  extractArxivPaper,
  listArxiv,
} from '../sources/arxiv.js'
import { isDigestDate, storagePaths, writeDayDigest, writeRunRecord } from '../storage.js'
import { selectDaily } from './select.js'

export const SOURCE_IDS = ['arxiv']

export const DIRECTION_META = [
  { id: 'agent', label: 'Agent', labelEn: 'Agents' },
  { id: 'reasoning', label: '推理', labelEn: 'Reasoning' },
  { id: 'training', label: '训练', labelEn: 'Training' },
  { id: 'alignment', label: '对齐', labelEn: 'Alignment' },
  { id: 'architecture', label: '架构', labelEn: 'Architecture' },
]

export const SOURCE_META = [{ id: 'arxiv', label: 'arXiv', short: 'A' }]

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
async function listSource(id, { config, date, fetch: fetchImpl }) {
  if (id === 'arxiv') {
    return listArxiv({ config: config.sources?.arxiv ?? DEFAULT_ARXIV_CONFIG, date, fetch: fetchImpl })
  }
  throw Object.assign(new Error(`source "${id}" is not implemented`), { code: 'source_unimplemented' })
}

/** Extract one selected candidate into reader blocks. */
export async function extractCandidate(candidate, { config, fetch: fetchImpl }) {
  if (candidate.sourceId === 'arxiv') {
    return extractArxivPaper({
      candidate,
      config: config.sources?.arxiv ?? DEFAULT_ARXIV_CONFIG,
      fetch: fetchImpl,
    })
  }
  throw Object.assign(new Error(`no extractor for source "${candidate.sourceId}"`), { code: 'source_unimplemented' })
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

function toDigestItem(candidate, extraction, { collectedAt }) {
  const blocks = pendingBlocks(extraction.blocks ?? [])
  const summary = candidate.summary
    ? { original: candidate.summary, translation: null }
    : null
  return {
    id: candidate.id,
    source: candidate.sourceId,
    sourceId: candidate.sourceId,
    sourceLanguage: candidate.sourceLanguage === 'zh' ? 'zh' : 'en',
    title: { original: candidate.title, translation: null },
    summary,
    authors: Array.isArray(candidate.authors) ? candidate.authors : [],
    venue: candidate.primaryCategory ? `arXiv ${candidate.primaryCategory}` : null,
    published: candidate.published ?? (candidate.publishedAt ? String(candidate.publishedAt).slice(0, 10) : null),
    publishedAt: candidate.publishedAt ?? null,
    collectedAt,
    direction: candidate.direction ?? 'architecture',
    tags: Array.isArray(candidate.tags) ? candidate.tags : [],
    readingMinutes: Math.max(1, Math.round(wordCount(blocks) / 180)),
    excerpt: extraction.excerpt === true,
    url: candidate.url ?? null,
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

  const candidates = []
  const reports = []
  for (const id of activeSources) {
    const sourceStarted = Date.now()
    try {
      const listed = await listSource(id, { config: resolved, date, fetch: fetchFor(id) })
      candidates.push(...listed)
      reports.push({
        id,
        status: 'ok',
        candidates: listed.length,
        selected: 0,
        requests: counters.get(id).requests,
        durationMs: Date.now() - sourceStarted,
        error: null,
      })
    } catch (error) {
      reports.push({
        id,
        status: 'failed',
        candidates: 0,
        selected: 0,
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
  const warnings = []
  let extractionFailures = 0
  for (const candidate of selection.selected) {
    const report = reports.find(entry => entry.id === candidate.sourceId)
    if (report) report.selected += 1
    let extraction
    try {
      extraction = await extractCandidate(candidate, { config: resolved, fetch: fetchFor(candidate.sourceId) })
    } catch (error) {
      extractionFailures += 1
      extraction = {
        blocks: excerptBlocks(candidate),
        excerpt: true,
        warnings: [`extraction failed: ${error?.message ?? error}`],
      }
    }
    for (const warning of extraction.warnings ?? []) warnings.push({ id: candidate.id, message: warning })
    items.push(toDigestItem(candidate, extraction, { collectedAt }))
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
  }

  const written = { digest: null, index: null, run: null, bytes: 0 }
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
      warnings,
      digest: {
        written: Boolean(written.digest),
        path: written.digest,
        bytes: written.bytes,
        error: digestError ? String(digestError.message ?? digestError) : null,
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
    warnings,
    digest,
    written,
    errors,
    exitCode,
  }
}
