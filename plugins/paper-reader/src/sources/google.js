/**
 * Google AI blog adapter.
 *
 * The public RSS feed is the list; the article page is server-rendered and
 * shares the generic blog extractor. Google publishes under one feed with
 * product/research categories, so the adapter keeps the feed categories as
 * tags and treats every entry as an English blog post.
 */
import { classifyDirection } from '../shared/direction.js'
import { fetchText } from '../shared/http.js'
import { findFirst, localName, parseMarkup } from '../shared/markup.js'
import {
  articleMeta,
  extractBlogBlocks,
  fallbackTitle,
  parseJsonLd,
  timeDate,
} from './blog.js'
import { dropSeen } from '../shared/url.js'
import { parseRssFeed } from './openai.js'
import { assertPositive, assertUrl, configError, isPlainObject } from './validation.js'

const SOURCE_ID = 'google'

export const DEFAULT_GOOGLE_CONFIG = {
  enabled: false,
  rssUrl: 'https://blog.google/technology/ai/rss/',
  timeoutMs: 30_000,
  maxItems: 20,
  extractFullText: true,
  maxBlocks: 400,
  userAgent: 'dsh-paper-reader/0.1 (+https://blog.google/technology/ai/)',
}

function sourceError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID }, extra)
}

function withDefaults(config) {
  return { ...DEFAULT_GOOGLE_CONFIG, ...(config && typeof config === 'object' ? config : {}) }
}

function slugFromUrl(url) {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '')
    return path.split('/').filter(Boolean).pop() ?? ''
  } catch {
    return ''
  }
}

function isoDate(value) {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

function toCandidate(entry) {
  const slug = slugFromUrl(entry.link) || entry.guid || entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const publishedAt = isoDate(entry.published)
  const summary = entry.dek
  return {
    id: `${SOURCE_ID}:${slug}`,
    sourceId: SOURCE_ID,
    kind: 'blog',
    sourceLanguage: 'en',
    title: entry.title,
    summary,
    url: entry.link || null,
    publishedAt,
    published: publishedAt ? publishedAt.slice(0, 10) : null,
    authors: [],
    categories: entry.categories,
    venue: 'Google',
    direction: classifyDirection({ title: entry.title, summary }),
    tags: [...new Set(entry.categories)].slice(0, 4),
  }
}

function byPublishedDesc(left, right) {
  const a = Date.parse(left.publishedAt ?? '') || 0
  const b = Date.parse(right.publishedAt ?? '') || 0
  if (a !== b) return b - a
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/** List the newest Google AI blog posts as blog candidates. */
export async function listGoogle({ config, fetch: fetchImpl, knownUrls = [] } = {}) {
  const settings = withDefaults(config)
  let response
  let text
  try {
    ({ response, text } = await fetchText(fetchImpl, settings.rssUrl, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.1',
    }))
  } catch (error) {
    throw sourceError('google_network', `Google RSS request failed: ${error?.message ?? error}`, { cause: error })
  }
  if (!response.ok) throw sourceError('google_http', `Google RSS answered HTTP ${response.status}`, { status: response.status })
  if (!/<rss[\s>]/i.test(text)) throw sourceError('google_invalid', 'Google RSS did not return an RSS feed')

  const limit = Number.isInteger(settings.maxItems) && settings.maxItems > 0 ? settings.maxItems : DEFAULT_GOOGLE_CONFIG.maxItems
  return dropSeen(
    parseRssFeed(text).map(toCandidate).filter(candidate => candidate.title).sort(byPublishedDesc),
    knownUrls,
  ).slice(0, limit)
}

/** Extract one Google AI blog article. */
export async function extractGoogleArticle({ candidate, config, fetch: fetchImpl } = {}) {
  const settings = withDefaults(config)
  if (settings.extractFullText === false) throw sourceError('google_extract', 'Google full-text extraction is disabled')
  const url = candidate?.url
  if (typeof url !== 'string' || !url) throw sourceError('google_extract', 'the candidate has no article URL')
  if (typeof fetchImpl !== 'function') throw sourceError('google_network', 'no fetch implementation was provided')

  let response
  let html
  try {
    ({ response, text: html } = await fetchText(fetchImpl, url, { timeoutMs: settings.timeoutMs, userAgent: settings.userAgent }))
  } catch (error) {
    throw sourceError('google_network', `Google article request failed: ${error?.message ?? error}`, { cause: error })
  }
  if (!response.ok) throw sourceError('google_http', `Google article answered HTTP ${response.status}`, { status: response.status })

  const tree = parseMarkup(html, { html: true })
  const meta = articleMeta(parseJsonLd(tree))
  const root = findFirst(tree, node => localName(node.name) === 'main')
    ?? findFirst(tree, node => localName(node.name) === 'article')
    ?? tree
  const title = meta.title ?? fallbackTitle(tree) ?? candidate.title
  const blocks = extractBlogBlocks(root, { maxBlocks: settings.maxBlocks, title, dedupeImages: true, baseUrl: url })
  if (!blocks.some(block => block.type === 'paragraph')) throw sourceError('google_extract', 'Google article has no readable paragraphs')

  const summary = meta.description ?? candidate.summary ?? ''
  const published = meta.datePublished ?? timeDate(tree) ?? (candidate.publishedAt ?? '').slice(0, 10) ?? null
  return {
    blocks,
    excerpt: false,
    warnings: [],
    meta: {
      title,
      summary,
      authors: meta.authors.length > 0 ? meta.authors : [],
      publishedAt: published ? `${published.slice(0, 10)}T00:00:00.000Z` : null,
      direction: classifyDirection({ title, summary }),
      tags: [],
      url: meta.url ?? url,
      sourceLanguage: 'en',
    },
  }
}

export function validateGoogleConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.google must be an object`)
  if (typeof config.enabled !== 'boolean') throw configError(`${path}: sources.google.enabled must be true or false`)
  assertUrl(config.rssUrl, 'sources.google.rssUrl', path)
  if (config.extractFullText !== undefined && typeof config.extractFullText !== 'boolean') {
    throw configError(`${path}: sources.google.extractFullText must be true or false`)
  }
  assertPositive(config.timeoutMs, 'sources.google.timeoutMs', path)
  if (!Number.isInteger(config.maxItems) || config.maxItems <= 0) throw configError(`${path}: sources.google.maxItems must be a positive integer`)
  if (!Number.isInteger(config.maxBlocks) || config.maxBlocks <= 0) throw configError(`${path}: sources.google.maxBlocks must be a positive integer`)
  return config
}
