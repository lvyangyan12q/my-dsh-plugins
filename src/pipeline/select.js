/**
 * Daily selection: filter → dedupe → rank → quota.
 *
 * Pure rules over candidate records, so the whole selection is testable
 * without network or disk. The output order is the reader's order: the most
 * relevant paper first, recency breaking ties.
 *
 * - **Dedupe** prefers the arXiv id, then the canonical URL, then a
 *   punctuation-insensitive title fingerprint. The first occurrence wins.
 * - **Filter** uses the configured categories (when the candidate declares
 *   any) plus include/exclude keywords over title and summary.
 * - **Quota** is a paper cap and a daily total cap; the list is never padded.
 */
export const DEFAULT_QUOTA = { total: 10, papers: 6, blogs: 4 }

function count(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}

function normalizeQuota(quota = {}) {
  return {
    total: count(quota.total, DEFAULT_QUOTA.total),
    papers: count(quota.papers, DEFAULT_QUOTA.papers),
    blogs: count(quota.blogs, DEFAULT_QUOTA.blogs),
  }
}

function normalizeKeywords(value) {
  return Array.isArray(value)
    ? value.map(keyword => String(keyword).trim().toLowerCase()).filter(Boolean)
    : []
}

function canonicalUrl(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    const path = url.pathname.replace(/\/+$/, '').replace(/\/v\d+$/, '')
    return `${url.hostname.replace(/^www\./i, '')}${path}${url.search}`.toLowerCase()
  } catch {
    return text.toLowerCase()
  }
}

function titleFingerprint(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function keysOf(candidate) {
  const arxivId = candidate.arxivId
    || (typeof candidate.id === 'string' && candidate.id.startsWith('arxiv:') ? candidate.id.slice(6) : '')
  return {
    arxivId: arxivId ? String(arxivId).replace(/v\d+$/, '') : '',
    url: canonicalUrl(candidate.url),
    title: titleFingerprint(candidate.title),
  }
}

/** Drop repeated papers, keeping the first occurrence. */
export function dedupeCandidates(candidates) {
  const kept = []
  const duplicates = []
  const seen = { arxivId: new Set(), url: new Set(), title: new Set() }
  for (const candidate of candidates) {
    const keys = keysOf(candidate)
    const duplicateOf = (keys.arxivId && seen.arxivId.has(keys.arxivId) && 'arxivId')
      || (keys.url && seen.url.has(keys.url) && 'url')
      || (keys.title && seen.title.has(keys.title) && 'title')
    if (duplicateOf) {
      duplicates.push({ id: candidate.id, reason: duplicateOf })
      continue
    }
    if (keys.arxivId) seen.arxivId.add(keys.arxivId)
    if (keys.url) seen.url.add(keys.url)
    if (keys.title) seen.title.add(keys.title)
    kept.push(candidate)
  }
  return { kept, duplicates }
}

function matchesCategory(candidate, categories) {
  if (categories.length === 0) return true
  const declared = Array.isArray(candidate.categories) ? candidate.categories : []
  // A source that does not describe categories (future blog adapters) is not
  // filtered by a category rule it can never satisfy.
  if (declared.length === 0) return true
  return declared.some(category => categories.includes(category))
}

function searchableText(candidate) {
  return `${candidate.title ?? ''}\n${candidate.summary ?? ''}\n${(candidate.tags ?? []).join(' ')}`.toLowerCase()
}

/** Apply category and keyword filters before ranking. */
export function filterCandidates(candidates, { categories = [], includeKeywords = [], excludeKeywords = [] } = {}) {
  const include = normalizeKeywords(includeKeywords)
  const exclude = normalizeKeywords(excludeKeywords)
  const kept = []
  const reasons = { category: 0, include: 0, exclude: 0 }

  for (const candidate of candidates) {
    if (!matchesCategory(candidate, categories)) {
      reasons.category += 1
      continue
    }
    const text = searchableText(candidate)
    if (exclude.some(keyword => text.includes(keyword))) {
      reasons.exclude += 1
      continue
    }
    if (include.length > 0 && !include.some(keyword => text.includes(keyword))) {
      reasons.include += 1
      continue
    }
    kept.push(candidate)
  }
  return { kept, filtered: reasons.category + reasons.exclude + reasons.include, reasons }
}

/** Relevance score: keyword hits weigh more in the title than in the summary. */
export function scoreCandidate(candidate, { includeKeywords = [] } = {}) {
  const title = String(candidate.title ?? '').toLowerCase()
  const summary = String(candidate.summary ?? '').toLowerCase()
  let score = 0
  for (const keyword of normalizeKeywords(includeKeywords)) {
    if (title.includes(keyword)) score += 3
    else if (summary.includes(keyword)) score += 1
  }
  return score
}

function compareByRank(options) {
  return (left, right) => {
    const scoreDelta = scoreCandidate(right, options) - scoreCandidate(left, options)
    if (scoreDelta !== 0) return scoreDelta
    const leftTime = Date.parse(left.publishedAt ?? '') || 0
    const rightTime = Date.parse(right.publishedAt ?? '') || 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0
  }
}

function kindOf(candidate) {
  return candidate.kind === 'blog' ? 'blog' : 'paper'
}

/**
 * Select the day's items from all sources' candidates.
 *
 * Returns the selected candidates in reading order plus counts the run record
 * reports (considered, filtered, duplicated, selected, dropped by quota).
 */
export function selectDaily(candidates, options = {}) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : []
  const quota = normalizeQuota(options.quota)
  const filterOptions = {
    categories: Array.isArray(options.categories) ? options.categories : [],
    includeKeywords: options.includeKeywords ?? options.keywords ?? [],
    excludeKeywords: options.excludeKeywords ?? [],
  }
  const rankOptions = {
    includeKeywords: filterOptions.includeKeywords,
  }

  const { kept: deduped, duplicates } = dedupeCandidates(list)
  const { kept: filtered, filtered: filteredCount, reasons } = filterCandidates(deduped, filterOptions)
  const ranked = [...filtered].sort(compareByRank(rankOptions))

  const papers = ranked.filter(candidate => kindOf(candidate) === 'paper')
  const blogs = ranked.filter(candidate => kindOf(candidate) === 'blog')
  const paperLimit = Math.min(quota.papers, quota.total)
  const selectedPapers = papers.slice(0, paperLimit)
  const blogLimit = Math.min(quota.blogs, Math.max(0, quota.total - selectedPapers.length))
  const selected = [...selectedPapers, ...blogs.slice(0, blogLimit)]

  return {
    selected,
    stats: {
      candidates: list.length,
      duplicates: duplicates.length,
      filtered: filteredCount,
      filterReasons: reasons,
      ranked: ranked.length,
      selected: selected.length,
      droppedByQuota: ranked.length - selected.length,
      quota,
      paperLimit: selectedPapers.length,
      blogLimit: Math.max(0, selected.length - selectedPapers.length),
    },
  }
}
