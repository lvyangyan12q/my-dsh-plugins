/**
 * Daily selection: filter → dedupe → rank → quota.
 *
 * Pure rules over candidate records, so the whole selection is testable
 * without network or disk. The output order is the reader's order: the papers
 * the HF board voted first, then the most relevant, recency breaking ties.
 *
 * - **Dedupe** prefers the arXiv id, then the canonical URL, then a
 *   punctuation-insensitive title fingerprint. The first occurrence wins,
 *   unless a later duplicate carries a heat signal (`upvotes`): the HF daily
 *   board copy then replaces the plain arXiv one, because it is the copy that
 *   carries the reason the paper is being considered at all.
 * - **Filter** uses the configured categories (when the candidate declares
 *   any) plus include/exclude keywords over title and summary.
 * - **Rank** puts a voted paper above an unvoted one — the HF board is the heat
 *   signal — then keyword relevance, then votes, then recency.
 * - **Quota** is a paper cap and a daily total cap; the list is never padded.
 */
import { canonicalUrl } from '../shared/url.js'

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

/** Upvotes are the HF heat signal; anything else has none. */
function votesOf(candidate) {
  const votes = Number(candidate?.upvotes)
  return Number.isFinite(votes) && votes > 0 ? votes : 0
}

/** The configured relevance bonus for a source, 0 when unset. */
function weightOf(candidate, sourceWeights) {
  const weight = Number(sourceWeights?.[candidate?.sourceId])
  return Number.isFinite(weight) ? weight : 0
}

/** Drop repeated papers, keeping the heat-carrying copy when there is one. */
export function dedupeCandidates(candidates) {
  const kept = []
  const duplicates = []
  const seen = { arxivId: new Map(), url: new Map(), title: new Map() }
  const keyMaps = [['arxivId', seen.arxivId], ['url', seen.url], ['title', seen.title]]

  for (const candidate of candidates) {
    const keys = keysOf(candidate)
    let duplicate = null
    for (const [name, map] of keyMaps) {
      if (keys[name] && map.has(keys[name])) {
        duplicate = { reason: name, index: map.get(keys[name]) }
        break
      }
    }
    if (duplicate) {
      duplicates.push({ id: candidate.id, reason: duplicate.reason })
      // A voted duplicate replaces the unvoted copy in place, so the result
      // keeps the first-seen position but gains the HF heat signal.
      if (votesOf(candidate) > votesOf(kept[duplicate.index])) {
        kept[duplicate.index] = candidate
        for (const [name, map] of keyMaps) {
          if (keys[name]) map.set(keys[name], duplicate.index)
        }
      }
      continue
    }
    for (const [name, map] of keyMaps) {
      if (keys[name]) map.set(keys[name], kept.length)
    }
    kept.push(candidate)
  }
  return { kept, duplicates }
}

function matchesCategory(candidate, categories, categoriesBySource) {
  // A per-source map is authoritative: an arXiv category list must not filter
  // an OpenAI post whose own RSS categories are "Product" or "Research".
  const rules = categoriesBySource
    ? (categoriesBySource[candidate.sourceId] ?? [])
    : categories
  if (rules.length === 0) return true
  const declared = Array.isArray(candidate.categories) ? candidate.categories : []
  // A source that does not describe categories is not filtered by a rule it can
  // never satisfy.
  if (declared.length === 0) return true
  return declared.some(category => rules.includes(category))
}

function searchableText(candidate) {
  return `${candidate.title ?? ''}\n${candidate.summary ?? ''}\n${(candidate.tags ?? []).join(' ')}`.toLowerCase()
}

/** Normalized institution names declared by a candidate. */
function institutionsOf(candidate) {
  const declared = candidate.institutions ?? candidate.affiliations
  if (!Array.isArray(declared)) return []
  return declared
    .filter(value => typeof value === 'string')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * The institution allowlist. A paper that declares affiliations and matches
 * none is dropped; a paper that declares none is kept, because arXiv does not
 * publish an affiliation for every submission and a missing declaration must
 * not silently erase a whole day.
 */
function matchesInstitution(candidate, institutions) {
  if (institutions.length === 0) return true
  const declared = institutionsOf(candidate)
  if (declared.length === 0) return true
  const wanted = institutions.map(value => value.trim().toLowerCase())
  return declared.some(institution => wanted.some(rule => institution.includes(rule)))
}

/** Apply institution, category and keyword filters before ranking. */
export function filterCandidates(candidates, {
  categories = [],
  categoriesBySource = null,
  includeKeywords = [],
  excludeKeywords = [],
  institutions = [],
} = {}) {
  const include = normalizeKeywords(includeKeywords)
  const exclude = normalizeKeywords(excludeKeywords)
  const kept = []
  const reasons = { institution: 0, category: 0, include: 0, exclude: 0 }

  for (const candidate of candidates) {
    if (!matchesInstitution(candidate, institutions)) {
      reasons.institution += 1
      continue
    }
    if (!matchesCategory(candidate, categories, categoriesBySource)) {
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
  return {
    kept,
    filtered: reasons.institution + reasons.category + reasons.exclude + reasons.include,
    reasons,
  }
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

/**
 * Rank papers.
 *
 * The HF daily board is a heat signal, not a tie-breaker: a paper with votes
 * always ranks above one without, and among voted papers the vote count comes
 * before keywords and source weights. A high-vote paper must never be pushed
 * below a low-vote paper that happens to match a keyword. Without votes, the
 * configured per-source weight plus the keyword score decide, then recency.
 */
function compareByRank(options) {
  return (left, right) => {
    const leftVotes = votesOf(left)
    const rightVotes = votesOf(right)
    if ((leftVotes > 0) !== (rightVotes > 0)) return leftVotes > 0 ? -1 : 1
    if (leftVotes > 0 && leftVotes !== rightVotes) return rightVotes - leftVotes
    const leftScore = scoreCandidate(left, options) + weightOf(left, options.sourceWeights)
    const rightScore = scoreCandidate(right, options) + weightOf(right, options.sourceWeights)
    if (leftScore !== rightScore) return rightScore - leftScore
    if (leftVotes !== rightVotes) return rightVotes - leftVotes
    const leftTime = Date.parse(left.publishedAt ?? '') || 0
    const rightTime = Date.parse(right.publishedAt ?? '') || 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function kindOf(candidate) {
  return candidate.kind === 'blog' ? 'blog' : 'paper'
}

function compareBlogRecency(left, right) {
  const leftTime = Date.parse(left.publishedAt ?? '') || 0
  const rightTime = Date.parse(right.publishedAt ?? '') || 0
  if (leftTime !== rightTime) return rightTime - leftTime
  return String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0
}

/**
 * Fill the blog quota newest-first while giving every source a turn.
 *
 * Blog posts are picked by publication date, not by keyword score: the spec
 * asks for the latest post of each source. Round-robin over the sources keeps
 * one prolific feed from taking all four slots, which is what "share the daily
 * quota" means for Anthropic + Kimi + DeepSeek + OpenAI.
 */
export function selectBlogs(blogs, limit) {
  if (!Number.isInteger(limit) || limit <= 0) return []
  const groups = new Map()
  for (const blog of blogs) {
    const sourceId = String(blog.sourceId ?? blog.source ?? '')
    if (!groups.has(sourceId)) groups.set(sourceId, [])
    groups.get(sourceId).push(blog)
  }
  const queues = [...groups.values()]
    .map(group => [...group].sort(compareBlogRecency))
    .sort((left, right) => compareBlogRecency(left[0], right[0]))

  const picked = []
  while (picked.length < limit) {
    let added = false
    for (const queue of queues) {
      if (picked.length >= limit) break
      const next = queue.shift()
      if (next) {
        picked.push(next)
        added = true
      }
    }
    if (!added) break
  }
  return picked.sort(compareBlogRecency)
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
    categoriesBySource: options.categoriesBySource && typeof options.categoriesBySource === 'object'
      ? options.categoriesBySource
      : null,
    includeKeywords: options.includeKeywords ?? options.keywords ?? [],
    excludeKeywords: options.excludeKeywords ?? [],
    institutions: Array.isArray(options.institutions) ? options.institutions : [],
  }
  const rankOptions = {
    includeKeywords: filterOptions.includeKeywords,
    sourceWeights: isObject(options.sourceWeights) ? options.sourceWeights : {},
  }

  const { kept: deduped, duplicates } = dedupeCandidates(list)
  const { kept: filtered, filtered: filteredCount, reasons } = filterCandidates(deduped, filterOptions)
  const ranked = [...filtered].sort(compareByRank(rankOptions))

  const papers = ranked.filter(candidate => kindOf(candidate) === 'paper')
  const blogs = ranked.filter(candidate => kindOf(candidate) === 'blog')
  const paperLimit = Math.min(quota.papers, quota.total)
  const selectedPapers = papers.slice(0, paperLimit)
  const blogLimit = Math.min(quota.blogs, Math.max(0, quota.total - selectedPapers.length))
  const selectedBlogs = selectBlogs(blogs, blogLimit)
  const selected = [...selectedPapers, ...selectedBlogs]

  return {
    selected,
    stats: {
      candidates: list.length,
      duplicates: duplicates.length,
      filtered: filteredCount,
      filterReasons: reasons,
      sourceWeights: rankOptions.sourceWeights,
      institutions: filterOptions.institutions,
      ranked: ranked.length,
      selected: selected.length,
      droppedByQuota: ranked.length - selected.length,
      quota,
      paperLimit: selectedPapers.length,
      blogLimit: Math.max(0, selected.length - selectedPapers.length),
    },
  }
}
