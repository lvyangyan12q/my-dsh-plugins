/**
 * Anthropic Engineering / News adapter.
 *
 * Discovery uses `sitemap.xml`, because `/news` only server-renders the first
 * few cards and would silently hide most of the archive. Articles are filtered
 * to `/research/` and `/news/`, compared against the URLs seen on earlier days
 * (the "difference"), and then fetched only for the selected few.
 *
 * Extraction reads the `ld+json` metadata for title, date and author, and the
 * server-rendered `main#main-content` for the prose. A single article that
 * cannot be read is a per-article error: the pipeline skips it and keeps the
 * rest of the day, which is why `onExtractFailure` is `skip` for this source.
 */
import {
  articleMeta,
  dateOnly,
  extractBlogBlocks,
  fallbackTitle,
  fetchText,
  normalizeUrl,
  parseJsonLd,
  shiftDate,
  slugToTitle,
  timeDate,
} from './blog.js'
import { classifyDirection } from '../shared/direction.js'
import {
  assertPositive,
  assertStringList,
  assertUrl,
  configError,
  isPlainObject,
} from './validation.js'
import { attr, findAll, localName, parseMarkup, textOf } from '../shared/markup.js'

export const SOURCE_ID = 'anthropic'

export const DEFAULT_ANTHROPIC_CONFIG = {
  enabled: true,
  useProxy: false,
  sitemapUrl: 'https://www.anthropic.com/sitemap.xml',
  prefixes: ['/news/', '/research/'],
  excludePaths: ['/page/'],
  recentDays: 30,
  maxCandidates: 12,
  maxSeenUrls: 1000,
  timeoutMs: 20_000,
  maxBlocks: 400,
  extractFullText: true,
  userAgent: 'dsh-paper-reader/0.1 (+https://www.anthropic.com)',
}

function sourceError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID }, extra)
}

function withDefaults(config) {
  return { ...DEFAULT_ANTHROPIC_CONFIG, ...(config ?? {}) }
}

/** Parse a sitemap into `{ loc, lastmod }` records. */
export function parseSitemap(xml) {
  const tree = parseMarkup(xml, { html: false })
  const entries = []
  for (const node of findAll(tree, item => localName(item.name) === 'url')) {
    const locNode = findAll(node, item => localName(item.name) === 'loc')[0]
    const lastmodNode = findAll(node, item => localName(item.name) === 'lastmod')[0]
    const loc = locNode ? textOf(locNode).trim() : ''
    if (!loc) continue
    entries.push({ loc, lastmod: lastmodNode ? dateOnly(textOf(lastmodNode)) : null })
  }
  return entries
}

/** Is the URL one of the article spaces this adapter reads? */
function isArticleUrl(loc, settings) {
  let url
  try {
    url = new URL(loc)
  } catch {
    return false
  }
  const path = url.pathname.replace(/\/+$/, '')
  const roots = settings.prefixes.map(prefix => prefix.replace(/\/+$/, ''))
  if (!roots.some(root => path === root || path.startsWith(`${root}/`))) return false
  if (settings.excludePaths.some(fragment => path.includes(fragment))) return false
  // `/news` and `/research` themselves are index pages, not articles.
  return !roots.includes(path)
}

function toCandidate(entry) {
  const path = new URL(entry.loc).pathname.replace(/^\/+|\/+$/g, '')
  const title = slugToTitle(path)
  return {
    id: `${SOURCE_ID}:${path}`,
    sourceId: SOURCE_ID,
    kind: 'blog',
    sourceLanguage: 'en',
    title,
    summary: '',
    url: entry.loc,
    publishedAt: entry.lastmod ?? null,
    authors: [],
    direction: classifyDirection({ title }),
    tags: [],
  }
}

/**
 * List fresh articles.
 *
 * `knownUrls` are the URLs seen on earlier days; they are removed before the
 * recency window and the candidate cap are applied. The returned `discovered`
 * list contains every article URL in the sitemap (not only the ones returned),
 * so the caller can remember the archive and not re-offer it tomorrow.
 */
export async function listAnthropic({ config, date, fetch: fetchImpl, knownUrls = [] } = {}) {
  const settings = withDefaults(config)
  let response
  let text
  try {
    ({ response, text } = await fetchText(fetchImpl, settings.sitemapUrl, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      accept: 'application/xml, text/xml;q=0.9, */*;q=0.1',
    }))
  } catch (error) {
    throw sourceError('anthropic_network', `Anthropic sitemap request failed: ${error?.message ?? error}`, { cause: error })
  }
  if (!response.ok) {
    throw sourceError('anthropic_http', `Anthropic sitemap answered HTTP ${response.status}`, { status: response.status })
  }
  if (!/<(?:urlset|sitemapindex)[\s>]/i.test(text)) {
    throw sourceError('anthropic_invalid', 'Anthropic sitemap did not return XML')
  }

  const matched = parseSitemap(text).filter(entry => isArticleUrl(entry.loc, settings))
  const discovered = matched.map(entry => normalizeUrl(entry.loc))
  const known = new Set(Array.from(knownUrls ?? [], normalizeUrl))
  const fresh = matched.filter(entry => !known.has(normalizeUrl(entry.loc)))

  const cutoff = shiftDate(date, -settings.recentDays)
  const recent = fresh
    .filter(entry => !entry.lastmod || entry.lastmod >= cutoff)
    .sort((left, right) => {
      if (left.lastmod !== right.lastmod) return String(right.lastmod ?? '').localeCompare(String(left.lastmod ?? ''))
      return left.loc.localeCompare(right.loc)
    })
    .slice(0, Math.max(0, settings.maxCandidates))

  return { candidates: recent.map(toCandidate), discovered }
}

/** Find the server-rendered article container. */
function findMain(tree) {
  return findAll(tree, node => localName(node.name) === 'main'
    && (attr(node, 'id') === 'main-content' || (attr(node, 'class') ?? '').split(/\s+/).includes('main-content')))[0]
    ?? null
}

/**
 * Extract one Anthropic article.
 *
 * Throws `anthropic_extract` when the page has no `main#main-content` or no
 * readable prose; the pipeline turns that into a skipped item and a warning.
 */
export async function extractAnthropicArticle({ candidate, config, fetch: fetchImpl } = {}) {
  const settings = withDefaults(config)
  if (settings.extractFullText === false) {
    throw sourceError('anthropic_extract', 'Anthropic full-text extraction is disabled')
  }
  const url = candidate?.url
  if (typeof url !== 'string' || url.length === 0) {
    throw sourceError('anthropic_extract', 'the candidate has no article URL')
  }
  if (typeof fetchImpl !== 'function') {
    throw sourceError('anthropic_network', 'no fetch implementation was provided')
  }

  let response
  let html
  try {
    ({ response, text: html } = await fetchText(fetchImpl, url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
    }))
  } catch (error) {
    throw sourceError('anthropic_network', `Anthropic article request failed: ${error?.message ?? error}`, { cause: error })
  }
  if (!response.ok) {
    throw sourceError('anthropic_http', `Anthropic article answered HTTP ${response.status}`, { status: response.status })
  }

  const tree = parseMarkup(html, { html: true })
  const meta = articleMeta(parseJsonLd(tree))
  const main = findMain(tree)
  if (!main) throw sourceError('anthropic_extract', 'Anthropic article has no main#main-content')

  const title = meta.title ?? fallbackTitle(tree) ?? candidate.title
  const blocks = extractBlogBlocks(main, {
    maxBlocks: settings.maxBlocks,
    title,
    dedupeImages: true,
    baseUrl: url,
  })
  if (!blocks.some(block => block.type === 'paragraph')) {
    throw sourceError('anthropic_extract', 'Anthropic article has no readable paragraphs')
  }

  const summary = meta.description ?? candidate.summary ?? ''
  const published = meta.datePublished ?? timeDate(tree) ?? dateOnly(candidate.publishedAt) ?? null
  return {
    blocks,
    excerpt: false,
    warnings: [],
    meta: {
      title,
      summary,
      authors: meta.authors.length > 0 ? meta.authors : (candidate.authors ?? []),
      publishedAt: published ? `${published}T00:00:00.000Z` : (candidate.publishedAt ?? null),
      direction: classifyDirection({ title, summary }),
      tags: [],
      url: meta.url ?? url,
      sourceLanguage: 'en',
    },
  }
}

/** Validate the Anthropic section of the user config. */
export function validateAnthropicConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.anthropic must be an object`)
  assertUrl(config.sitemapUrl, 'sources.anthropic.sitemapUrl', path)
  assertStringList(config.prefixes, 'sources.anthropic.prefixes', path, { allowEmpty: false })
  assertStringList(config.excludePaths, 'sources.anthropic.excludePaths', path)
  if (!Number.isInteger(config.recentDays) || config.recentDays <= 0) {
    throw configError(`${path}: sources.anthropic.recentDays must be a positive integer`)
  }
  if (!Number.isInteger(config.maxCandidates) || config.maxCandidates <= 0) {
    throw configError(`${path}: sources.anthropic.maxCandidates must be a positive integer`)
  }
  if (!Number.isInteger(config.maxSeenUrls) || config.maxSeenUrls <= 0) {
    throw configError(`${path}: sources.anthropic.maxSeenUrls must be a positive integer`)
  }
  assertPositive(config.timeoutMs, 'sources.anthropic.timeoutMs', path)
  if (!Number.isInteger(config.maxBlocks) || config.maxBlocks <= 0) {
    throw configError(`${path}: sources.anthropic.maxBlocks must be a positive integer`)
  }
  if (typeof config.extractFullText !== 'boolean') {
    throw configError(`${path}: sources.anthropic.extractFullText must be true or false`)
  }
}

