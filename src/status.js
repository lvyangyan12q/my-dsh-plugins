/**
 * Read-only view of the latest daily run.
 *
 * The run record under `$DSH_HOME/paper-reader/runs/YYYY-MM-DD.json` is the
 * diagnostic source of truth: it exists even when the run wrote no digest, so
 * the page can explain a failed day without replacing the previous readable
 * digest. This module turns that record into a small, stable payload:
 *
 * - only explicitly listed fields are copied, so a stray key (an API key in a
 *   future record) can never reach the browser;
 * - failed and skipped sources always carry a stable `code`, whatever wording
 *   the adapter used in `error`;
 * - a missing run directory is data (`latest: null`), not an error.
 *
 * The host route and the tests share this function; the client only renders
 * the resulting shape.
 */
import { readLatestRun } from './storage.js'

export const RUN_STATUS_SCHEMA_VERSION = 1

/** Display labels for sources that may have no items in the current digest. */
export const SOURCE_LABELS = Object.freeze({
  arxiv: 'arXiv',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
  kimi: 'Kimi',
  hf: 'Hugging Face',
  openai: 'OpenAI',
})

export const SOURCE_FAILED_CODE = 'source_failed'
export const SOURCE_SKIPPED_CODE = 'source_skipped'

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function count(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function optionalCount(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

/** The stable reason code for one source report. */
function sourceCode(source, status) {
  const declared = text(source.code)
  if (declared) return declared
  if (status === 'failed') return SOURCE_FAILED_CODE
  if (status === 'skipped') return SOURCE_SKIPPED_CODE
  return null
}

/**
 * Normalize one source report. `reason` keeps the machine code when the
 * adapter did not supply a human explanation; `error` is the adapter detail.
 */
function summarizeSource(source) {
  if (!isObject(source) || typeof source.id !== 'string' || source.id.length === 0) return null
  const status = source.status === 'ok' || source.status === 'skipped' ? source.status : 'failed'
  const code = sourceCode(source, status)
  return {
    id: source.id,
    label: text(source.label) ?? SOURCE_LABELS[source.id] ?? source.id,
    status,
    items: count(source.items),
    code,
    reason: text(source.reason) ?? code,
    error: text(source.error),
  }
}

function summarizeTranslation(value) {
  if (!isObject(value)) return null
  return {
    status: text(value.status),
    reason: text(value.reason),
    model: text(value.model),
    targetLanguage: text(value.targetLanguage),
    tokensUsed: optionalCount(value.tokensUsed),
    tokenBudget: optionalCount(value.tokenBudget),
    budgetExceeded: value.budgetExceeded === true,
    pendingItems: optionalCount(value.pendingItems),
  }
}

/**
 * Build the browser-safe status payload from a stored run record.
 *
 * Returned fields are an explicit whitelist. Adding `apiKey`, `env`, `proxy`
 * or any other future field to the record must not expose it automatically.
 */
export function summarizeRun(record, { date = null, path = null } = {}) {
  if (!isObject(record)) return null
  const sources = (Array.isArray(record.sources) ? record.sources : [])
    .map(summarizeSource)
    .filter(Boolean)
  const failureSources = sources.filter(source => source.status === 'failed')
  const skippedSources = sources.filter(source => source.status === 'skipped')
  const status = record.status === 'ok' || record.status === 'partial' || record.status === 'failed'
    ? record.status
    : 'unknown'

  return {
    schemaVersion: RUN_STATUS_SCHEMA_VERSION,
    date: text(record.date) ?? date,
    status,
    dryRun: record.dryRun === true,
    startedAt: text(record.startedAt),
    finishedAt: text(record.finishedAt),
    durationMs: optionalCount(record.durationMs),
    items: count(record.counts?.items),
    counts: {
      items: count(record.counts?.items),
      fullText: count(record.counts?.fullText),
      excerpt: count(record.counts?.excerpt),
      translated: count(record.counts?.translated),
      translationPending: count(record.counts?.translationPending),
    },
    sources,
    failedSources: failureSources,
    skippedSources,
    translation: summarizeTranslation(record.translation),
    runPath: path,
  }
}

/**
 * Read the newest run record and summarize it. The route answers
 * `{ latest: null }` on a fresh install instead of an error page.
 */
export async function readRunStatus({ root }) {
  const latest = await readLatestRun({ root })
  return {
    schemaVersion: RUN_STATUS_SCHEMA_VERSION,
    source: latest ? 'run' : null,
    date: latest?.date ?? null,
    latest: latest ? summarizeRun(latest.record, { date: latest.date, path: latest.path }) : null,
  }
}
