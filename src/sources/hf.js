/**
 * Hugging Face daily-papers source.
 *
 * HF's official API is network-restricted: the pipeline reaches it only through
 * the user's proxy (`sources.hf.useProxy`), and an unavailable proxy skips the
 * whole source rather than falling back to a direct connection or a mirror.
 *
 * The adapter's only list form is the dated daily list:
 * `GET https://huggingface.co/api/daily_papers?date=YYYY-MM-DD`. An undated
 * request mixes several days in no meaningful order, so it is refused before a
 * request is made — the day's snapshot is what the reader is promised.
 *
 * HF carries no full text. `paper.id` is the arXiv id, so a candidate points at
 * `arxiv.org/abs/<id>` and its blocks are extracted by the arXiv adapter
 * (`extractVia: 'arxiv'`); HF contributes the heat signal (`upvotes`), the
 * authors, the model-written TLDR and keywords.
 */
import { classifyDirection, normalizeArxivId } from './arxiv.js'
import { fetchText } from '../shared/http.js'
import {
  assertPositive,
  assertUrl,
  configError,
  isPlainObject,
} from './validation.js'

export const SOURCE_ID = 'hf'

export const DEFAULT_HF_CONFIG = {
  enabled: true,
  useProxy: true,
  baseUrl: 'https://huggingface.co/api/daily_papers',
  maxItems: 50,
  timeoutMs: 20_000,
  userAgent: 'dsh-paper-reader/0.1 (+https://huggingface.co)',
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function sourceError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID }, extra)
}

function withDefaults(config) {
  return { ...DEFAULT_HF_CONFIG, ...(config ?? {}) }
}

function collapseText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Build the dated daily-list URL.
 *
 * `date` is required and must already be a `YYYY-MM-DD` day: there is
 * deliberately no way to ask for an undated list here.
 */
export function buildDailyPapersUrl({ baseUrl, date, limit }) {
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
    throw sourceError('hf_date_required', `the HF daily list needs a YYYY-MM-DD date, got ${date}`)
  }
  const url = new URL(baseUrl || DEFAULT_HF_CONFIG.baseUrl)
  url.searchParams.set('date', date)
  if (Number.isInteger(limit) && limit > 0) url.searchParams.set('limit', String(limit))
  return url.toString()
}

function keywordList(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(keyword => collapseText(keyword).toLowerCase())
    .filter(Boolean)
}

/** The arXiv id of an HF paper, tolerating either a bare id or an abs URL. */
function arxivIdOf(paper) {
  const raw = paper?.id
  if (typeof raw !== 'string' || raw.trim().length === 0) return ''
  const normalized = normalizeArxivId(raw)
  return /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})$/.test(normalized) ? normalized : ''
}

function toCandidate(entry) {
  const paper = entry.paper ?? entry
  const arxivId = arxivIdOf(paper)
  if (!arxivId) return null
  const title = collapseText(paper.title)
  const summary = collapseText(paper.summary)
  const aiSummary = collapseText(paper.ai_summary) || null
  const aiKeywords = keywordList(paper.ai_keywords)
  const publishedAt = paper.publishedAt ?? entry.publishedAt ?? null
  const direction = classifyDirection({ title, summary: `${summary}\n${aiSummary ?? ''}` })
  return {
    id: `${SOURCE_ID}:${arxivId}`,
    sourceId: SOURCE_ID,
    kind: 'paper',
    arxivId,
    sourceLanguage: 'en',
    title,
    summary,
    aiSummary,
    aiKeywords,
    upvotes: Number(paper.upvotes) || 0,
    githubRepo: typeof paper.githubRepo === 'string' && paper.githubRepo.trim().length > 0
      ? paper.githubRepo.trim()
      : null,
    authors: Array.isArray(paper.authors)
      ? paper.authors.map(author => collapseText(author?.name ?? author)).filter(Boolean)
      : [],
    url: `https://arxiv.org/abs/${arxivId}`,
    // HF lists the paper it recommends; the arXiv id is where its body lives.
    extractVia: 'arxiv',
    publishedAt,
    published: publishedAt ? String(publishedAt).slice(0, 10) : null,
    direction,
    tags: [...new Set(aiKeywords)],
  }
}

function byUpvotesDesc(left, right) {
  if (left.upvotes !== right.upvotes) return right.upvotes - left.upvotes
  const a = Date.parse(left.publishedAt ?? '') || 0
  const b = Date.parse(right.publishedAt ?? '') || 0
  if (a !== b) return b - a
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/**
 * Parse a `?date=` response into candidates, hottest first.
 *
 * Throws `hf_invalid` when the payload is not the daily array, so a proxy that
 * answers with an HTML error page is reported as a source failure instead of
 * silently producing an empty day.
 */
export function parseDailyPapers(payload) {
  let parsed = payload
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload)
    } catch {
      throw sourceError('hf_invalid', 'the HF daily list did not return JSON')
    }
  }
  if (!Array.isArray(parsed)) {
    throw sourceError('hf_invalid', 'the HF daily list did not return a JSON array')
  }
  return parsed
    .map(toCandidate)
    .filter(Boolean)
    .sort(byUpvotesDesc)
}

/**
 * List the official daily board for one date.
 *
 * The caller supplies the transport: a proxied fetch for a normal run, or any
 * injected fetch in tests. This function never chooses a transport itself, so
 * it cannot quietly go direct.
 */
export async function listHf({ config, date, fetch: fetchImpl } = {}) {
  const settings = withDefaults(config)
  const url = buildDailyPapersUrl({ baseUrl: settings.baseUrl, date, limit: settings.maxItems })
  if (typeof fetchImpl !== 'function') {
    throw sourceError('hf_fetch_missing', 'no fetch implementation was provided')
  }

  let response
  let text
  try {
    ({ response, text } = await fetchText(fetchImpl, url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      accept: 'application/json, text/plain;q=0.9, */*;q=0.1',
    }))
  } catch (error) {
    if (error?.code === 'hf_date_required') throw error
    throw sourceError('hf_network', `the HF daily list request failed: ${error?.message ?? error}`, { cause: error })
  }
  if (!response.ok) {
    throw sourceError('hf_http', `the HF daily list answered HTTP ${response.status}`, { status: response.status })
  }

  return parseDailyPapers(text)
}

/** Validate the Hugging Face section of the user config. */
export function validateHfConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.hf must be an object`)
  assertUrl(config.baseUrl, 'sources.hf.baseUrl', path)
  if (!Number.isInteger(config.maxItems) || config.maxItems <= 0) {
    throw configError(`${path}: sources.hf.maxItems must be a positive integer`)
  }
  assertPositive(config.timeoutMs, 'sources.hf.timeoutMs', path)
}
