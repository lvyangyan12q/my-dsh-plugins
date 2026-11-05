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

/** Upvotes are the HF heat signal; anything else has none. */
function votesOf(candidate) {
  const votes = Number(candidate?.upvotes)
  return Number.isFinite(votes) && votes > 0 ? votes : 0
}

/** 1 for a paper the HF board voted up, 0 for everything else. */
function heatTier(candidate) {
  return votesOf(candidate) > 0 ? 1 : 0
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
    const heatDelta = heatTier(right) - heatTier(left)
    if (heatDelta !== 0) return heatDelta
    const scoreDelta = scoreCandidate(right, options) - scoreCandidate(left, options)
    if (scoreDelta !== 0) return scoreDelta
    const votesDelta = votesOf(right) - votesOf(left)
    if (votesDelta !== 0) return votesDelta
    const leftTime = Date.parse(left.publishedAt ?? '') || 0
    const rightTime = Date.parse(right.publishedAt ?? '') || 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0
  }
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
  const selectedBlogs = selectBlogs(blogs, blogLimit)
  const selected = [...selectedPapers, ...selectedBlogs]

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
