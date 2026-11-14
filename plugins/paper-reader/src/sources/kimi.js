/**
 * Kimi (Moonshot) research blog adapter.
 *
 * The blog list is server-rendered as cards (link + title + date). The article
 * pages are English-only, so the pipeline translates them into Chinese with the
 * shared translation service.
 *
 * The article body is `main.layout-content`. Kimi renders each image twice for
 * the light and dark themes; the extractor keeps one copy per image URL, so the
 * reader does not show the same figure twice. A per-article failure is skipped
 * by the pipeline (`onExtractFailure: "skip"`) without failing the source.
 */
import {
  articleMeta,
  dateOnly,
  extractBlogBlocks,
  fallbackTitle,
  fetchText,
  parseJsonLd,
  shiftDate,
  slugToTitle,
} from './blog.js'
import { classifyDirection } from '../shared/direction.js'
import { dropSeen } from '../shared/url.js'
import {
  assertPositive,
  assertUrl,
  configError,
  isPlainObject,
} from './validation.js'
import { attr, collapse, findAll, hasClass, isElement, localName, parseMarkup, textOf } from '../shared/markup.js'

export const SOURCE_ID = 'kimi'

export const DEFAULT_KIMI_CONFIG = {
  enabled: true,
  useProxy: false,
  listUrl: 'https://www.kimi.com/blog/',
  baseUrl: 'https://www.kimi.com',
  recentDays: 30,
  maxCandidates: 20,
  timeoutMs: 20_000,
  maxBlocks: 400,
  extractFullText: true,
  userAgent: 'dsh-paper-reader/0.1 (+https://www.kimi.com)',
}

function sourceError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID }, extra)
}

function withDefaults(config) {
  return { ...DEFAULT_KIMI_CONFIG, ...(config ?? {}) }
}

/** The slug of a blog link, or null for a non-article link. */
export function kimiSlugOf(href, baseUrl = DEFAULT_KIMI_CONFIG.baseUrl) {
  let url
  try {
    url = new URL(String(href), baseUrl)
  } catch {
    return null
  }
  const match = /\/(?:en\/)?blog\/([^/?#]+)\/?$/.exec(url.pathname)
  return match ? match[1] : null
}

/**
 * Parse the blog index into `{ slug, title, date }` cards.
 *
 * The cards are read in document order: a link starts a card and the following
 * `h4.card-title` / `p.card-date` fill it in. That keeps the parse working even
 * when one of the two fields is missing.
 */
export function parseKimiList(html, { baseUrl = DEFAULT_KIMI_CONFIG.baseUrl } = {}) {
  const tree = parseMarkup(html, { html: true })
  const cards = []
  let current = null

  const walk = (node) => {
    if (!isElement(node)) return
    const tag = localName(node.name)

    if (tag === 'a') {
      const href = attr(node, 'href')
      const slug = kimiSlugOf(href, baseUrl)
      if (slug) {
        const label = collapse(attr(node, 'aria-label') ?? '')
        current = { slug, title: label || null, date: null }
        cards.push(current)
      }
    } else if (hasClass(node, 'card-title')) {
      if (current && !current.title) current.title = collapse(textOf(node))
    } else if (hasClass(node, 'card-date')) {
      if (current && !current.date) current.date = dateOnly(textOf(node))
    } else if (tag === 'time' && attr(node, 'datetime') && current && !current.date) {
      current.date = dateOnly(attr(node, 'datetime'))
    }

    for (const child of node.children) walk(child)
  }

  walk(tree)

  const seen = new Set()
  return cards
    .filter((card) => {
      if (seen.has(card.slug)) return false
      seen.add(card.slug)
      return true
    })
    .map(card => ({
      ...card,
      title: card.title || slugToTitle(card.slug),
    }))
}

function toCandidate(card, settings) {
  return {
    id: `${SOURCE_ID}:${card.slug}`,
    sourceId: SOURCE_ID,
    kind: 'blog',
    sourceLanguage: 'en',
    title: card.title,
    summary: '',
    url: `${String(settings.baseUrl).replace(/\/+$/, '')}/en/blog/${card.slug}`,
    publishedAt: card.date,
    authors: [],
    direction: classifyDirection({ title: card.title }),
    tags: [],
  }
}

/** List recent Kimi blog posts, newest first. */
export async function listKimi({ config, date, fetch: fetchImpl, knownUrls = [] } = {}) {
  const settings = withDefaults(config)
  let response
  let html
  try {
    ({ response, text: html } = await fetchText(fetchImpl, settings.listUrl, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
    }))
  } catch (error) {
    throw sourceError('kimi_network', `Kimi blog request failed: ${error?.message ?? error}`, { cause: error })
  }
  if (!response.ok) {
    throw sourceError('kimi_http', `Kimi blog answered HTTP ${response.status}`, { status: response.status })
  }

  const cutoff = shiftDate(date, -settings.recentDays)
  const candidates = parseKimiList(html, { baseUrl: settings.baseUrl })
    .filter(card => !card.date || card.date >= cutoff)
    .sort((left, right) => {
      if (left.date !== right.date) return String(right.date ?? '').localeCompare(String(left.date ?? ''))
      return left.slug.localeCompare(right.slug)
    })
    .slice(0, Math.max(0, settings.maxCandidates))
    .map(card => toCandidate(card, settings))

  return {
    candidates: dropSeen(candidates, knownUrls),
    discovered: candidates.map(candidate => candidate.url),
  }
}

function findMain(tree) {
  return findAll(tree, node => localName(node.name) === 'main' && hasClass(node, 'layout-content'))[0] ?? null
}

/** Extract one Kimi article from `main.layout-content`. */
export async function extractKimiArticle({ candidate, config, fetch: fetchImpl } = {}) {
  const settings = withDefaults(config)
  if (settings.extractFullText === false) {
    throw sourceError('kimi_extract', 'Kimi full-text extraction is disabled')
  }
  const url = candidate?.url
  if (typeof url !== 'string' || url.length === 0) {
    throw sourceError('kimi_extract', 'the candidate has no article URL')
  }
  if (typeof fetchImpl !== 'function') {
    throw sourceError('kimi_network', 'no fetch implementation was provided')
  }

  let response
  let html
  try {
    ({ response, text: html } = await fetchText(fetchImpl, url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
    }))
  } catch (error) {
    throw sourceError('kimi_network', `Kimi article request failed: ${error?.message ?? error}`, { cause: error })
  }
  if (!response.ok) {
    throw sourceError('kimi_http', `Kimi article answered HTTP ${response.status}`, { status: response.status })
  }

  const tree = parseMarkup(html, { html: true })
  const meta = articleMeta(parseJsonLd(tree))
  const main = findMain(tree)
  if (!main) throw sourceError('kimi_extract', 'Kimi article has no main.layout-content')

  const title = meta.title ?? fallbackTitle(tree) ?? candidate.title
  const blocks = extractBlogBlocks(main, {
    maxBlocks: settings.maxBlocks,
    title,
    dedupeImages: true,
    baseUrl: url,
  })
  if (!blocks.some(block => block.type === 'paragraph')) {
    throw sourceError('kimi_extract', 'Kimi article has no readable paragraphs')
  }

  const summary = meta.description ?? candidate.summary ?? ''
  const published = meta.datePublished ?? dateOnly(candidate.publishedAt) ?? null
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

/** Validate the Kimi section of the user config. */
export function validateKimiConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.kimi must be an object`)
  assertUrl(config.listUrl, 'sources.kimi.listUrl', path)
  assertUrl(config.baseUrl, 'sources.kimi.baseUrl', path)
  if (!Number.isInteger(config.recentDays) || config.recentDays <= 0) {
    throw configError(`${path}: sources.kimi.recentDays must be a positive integer`)
  }
  if (!Number.isInteger(config.maxCandidates) || config.maxCandidates <= 0) {
    throw configError(`${path}: sources.kimi.maxCandidates must be a positive integer`)
  }
  assertPositive(config.timeoutMs, 'sources.kimi.timeoutMs', path)
  if (!Number.isInteger(config.maxBlocks) || config.maxBlocks <= 0) {
    throw configError(`${path}: sources.kimi.maxBlocks must be a positive integer`)
  }
  if (typeof config.extractFullText !== 'boolean') {
    throw configError(`${path}: sources.kimi.extractFullText must be true or false`)
  }
}

