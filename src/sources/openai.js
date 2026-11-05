/**
 * OpenAI source adapter.
 *
 * OpenAI is a two-tier source:
 *
 * - `listOpenAi` reads `openai.com/news/rss.xml`. The feed is reachable
 *   directly and is the only reliable list: `title`, `description` (the
 *   official dek), `pubDate`, `category` and `link`.
 * - `extractOpenAiArticle` reads the server-rendered article page — through the
 *   user's proxy, because that page answers 403 to direct requests. The proxy is
 *   an explicit switch (`sources.openai.extractViaProxy`), never a built-in
 *   address, and an unavailable proxy is reported rather than bypassed.
 *
 * Degradation is the ticket's core rule: a missing proxy, a 403, a network
 * error or an unparsable page keeps the item as the RSS excerpt (title, dek,
 * date, link) with `excerpt: true` and a readable `excerptReason`. Nothing is
 * retried in a loop; one request per article is the budget.
 */
import { classifyDirection } from './arxiv.js'
import { extractBlogBlocks } from './blog.js'
import {
  attr,
  childrenOf,
  collapse,
  decodeEntities,
  findAll,
  findFirst,
  hasClass,
  isElement,
  localName,
  parseMarkup,
  textOf,
} from '../shared/markup.js'
import { fetchText } from '../shared/http.js'
import { slugFromUrl } from '../shared/url.js'
import {
  assertPositive,
  assertUrl,
  configError,
  isPlainObject,
} from './validation.js'

export const SOURCE_ID = 'openai'

export const DEFAULT_OPENAI_CONFIG = {
  // OpenAI ships opt-in: its RSS list is direct, but the article page is only
  // reachable through the user's proxy and the site terms for that fetch are
  // still being reviewed. Enable it with `sources.openai.enabled`.
  enabled: false,
  // `useProxy` marks the source as proxied (as ticket 05 records for OpenAI).
  // `extractViaProxy` narrows that to the article page: the RSS list stays
  // direct, and a missing proxy degrades to the RSS excerpt instead of
  // skipping the source.
  useProxy: true,
  extractViaProxy: true,
  rssUrl: 'https://openai.com/news/rss.xml',
  timeoutMs: 20_000,
  maxItems: 40,
  extractFullText: true,
  maxBlocks: 300,
  userAgent: 'dsh-paper-reader/0.1 (+https://openai.com/news/rss.xml)',
}

/** Excerpt reason codes the digest, run record and page share. */
export const EXCERPT_REASONS = {
  proxy_unavailable: '代理不可用，仅显示 RSS 节选',
  full_text_disabled: '已关闭全文抽取，仅显示 RSS 节选',
  http_403: '文章页返回 403，仅显示 RSS 节选',
  http_error: '文章页返回错误，仅显示 RSS 节选',
  network: '文章页请求失败，仅显示 RSS 节选',
  extract_failed: '正文抽取失败，仅显示 RSS 节选',
}

function sourceError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID }, extra)
}

function withDefaults(config) {
  return { ...DEFAULT_OPENAI_CONFIG, ...(config ?? {}) }
}

/** Plain text from an RSS field that may carry escaped HTML. */
function plainText(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/<[a-z!/]/i.test(raw)) return collapse(textOf(parseMarkup(raw, { html: true })))
  return collapse(decodeEntities(raw))
}

function firstText(node, name) {
  return collapse(textOf(childrenOf(node, name)[0] ?? null))
}

/** Parse the news RSS feed into raw item records. */
export function parseRssFeed(xml) {
  const tree = parseMarkup(xml, { html: false })
  const channel = findFirst(tree, node => localName(node.name) === 'channel') ?? tree

  return childrenOf(channel, 'item').map((item) => {
    const rawTitle = firstText(item, 'title')
    const linkNode = childrenOf(item, 'link')[0] ?? null
    const link = collapse(attr(linkNode, 'href') ?? textOf(linkNode))
    const guid = firstText(item, 'guid')
    const published = firstText(item, 'pubDate') || firstText(item, 'dc:date')
    return {
      title: plainText(rawTitle),
      dek: plainText(firstText(item, 'description')),
      link: link || (/^https?:\/\//i.test(guid) ? guid : ''),
      guid,
      categories: childrenOf(item, 'category').map(category => collapse(textOf(category))).filter(Boolean),
      published,
    }
  }).filter(entry => entry.title.length > 0)
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
    venue: entry.categories[0] ? `OpenAI ${entry.categories[0]}` : 'OpenAI',
    direction: classifyDirection({ title: entry.title, summary }),
    tags: [...new Set(entry.categories)],
  }
}

function byPublishedDesc(left, right) {
  const a = Date.parse(left.publishedAt ?? '') || 0
  const b = Date.parse(right.publishedAt ?? '') || 0
  if (a !== b) return b - a
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/** List the newest OpenAI news items as blog candidates. */
export async function listOpenAi({ config, fetch: fetchImpl } = {}) {
  const settings = withDefaults(config)
  const url = settings.rssUrl || DEFAULT_OPENAI_CONFIG.rssUrl

  let response
  let text
  try {
    ({ response, text } = await fetchText(fetchImpl, url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      accept: 'application/rss+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.1',
    }))
  } catch (error) {
    throw sourceError('openai_network', `OpenAI RSS request failed: ${error?.message ?? error}`, { cause: error })
  }

  if (!response.ok) {
    throw sourceError('openai_http', `OpenAI RSS answered HTTP ${response.status}`, { status: response.status })
  }
  if (!/<rss[\s>]/i.test(text) && !/<channel[\s>]/i.test(text)) {
    throw sourceError('openai_invalid', 'OpenAI RSS did not return an RSS feed')
  }

  const limit = Number.isInteger(settings.maxItems) && settings.maxItems > 0 ? settings.maxItems : DEFAULT_OPENAI_CONFIG.maxItems
  return parseRssFeed(text)
    .map(toCandidate)
    .filter(candidate => candidate.title)
    .sort(byPublishedDesc)
    .slice(0, limit)
}

/* ------------------------------------------------------------------ */
/* Article page (server-rendered HTML)                                 */
/* ------------------------------------------------------------------ */

function textBlocksOf(blocks) {
  return blocks.filter(block => block.type === 'heading' || block.type === 'paragraph')
}

/** The article container: `<main>` first, then `<article>`, then `<body>`. */
function articleRoot(tree) {
  return findFirst(tree, node => localName(node.name) === 'main')
    ?? findFirst(tree, node => localName(node.name) === 'article')
    ?? findFirst(tree, node => localName(node.name) === 'body')
    ?? tree
}

/** Text of an author node, ignoring the date element a byline may contain. */
function authorText(node) {
  const collect = (current) => {
    if (typeof current === 'string') return current
    if (!isElement(current)) return ''
    const tag = localName(current.name)
    if (tag === 'time' || hasClass(current, 'date') || hasClass(current, 'timestamp')) return ''
    return current.children.map(collect).join('')
  }
  return collapse(collect(node))
}

/** Author names declared in the page (rel=author, byline classes, meta). */
function authorsOf(tree, main) {
  const names = []
  const specific = findAll(main, node => attr(node, 'rel') === 'author' || hasClass(node, 'author'))
  const bylines = specific.length > 0 ? [] : findAll(main, node => hasClass(node, 'byline'))
  const metas = findAll(tree, node => localName(node.name) === 'meta'
    && ['author', 'article:author'].includes(attr(node, 'name') ?? attr(node, 'property')))

  for (const node of [...specific, ...bylines, ...metas]) {
    const value = localName(node.name) === 'meta' ? collapse(attr(node, 'content')) : authorText(node)
    if (value && !names.includes(value)) names.push(value)
  }
  return names
}

/** Published date from `<time datetime>` or a `datePublished` meta tag. */
function publishedAtOf(tree, main) {
  const timeNode = findFirst(main, node => localName(node.name) === 'time')
  const declared = attr(timeNode, 'datetime') || (timeNode ? textOf(timeNode) : '')
  const fromTime = isoDate(collapse(declared))
  if (fromTime) return fromTime
  const meta = findFirst(tree, node => localName(node.name) === 'meta'
    && ['article:published_time', 'datePublished'].includes(attr(node, 'property') ?? attr(node, 'name')))
  return meta ? isoDate(attr(meta, 'content')) : null
}

/**
 * Turn an OpenAI article page into ordered reader blocks plus the metadata the
 * header shows (title, date, authors).
 */
export function extractOpenAiPage(html, { maxBlocks = DEFAULT_OPENAI_CONFIG.maxBlocks } = {}) {
  const tree = parseMarkup(html, { html: true })
  const main = articleRoot(tree)
  const titleNode = findFirst(main, node => localName(node.name) === 'h1')
  // The shared blog walker with OpenAI's rules: h1 is metadata, headings reach
  // h6 and only `<p>` is prose (no lists/blockquotes on the news pages).
  const blocks = extractBlogBlocks(main, {
    maxBlocks,
    skipH1: true,
    headingLevels: 6,
    paragraphTags: ['p'],
    codeBlockClass: false,
  })

  return {
    title: titleNode ? collapse(textOf(titleNode)) : null,
    publishedAt: publishedAtOf(tree, main),
    authors: authorsOf(tree, main),
    blocks,
  }
}

/** RSS-only blocks: the official dek, nothing that looks like full text. */
export function openAiExcerptBlocks(candidate) {
  const dek = collapse(candidate?.summary ?? '')
  return dek ? [{ type: 'paragraph', original: dek }] : []
}

function degraded(candidate, code, detail = null) {
  const message = EXCERPT_REASONS[code] ?? EXCERPT_REASONS.extract_failed
  return {
    blocks: openAiExcerptBlocks(candidate),
    excerpt: true,
    warnings: [detail ? `${message}（${detail}）` : message],
    excerptReason: { code, message, ...(detail ? { detail: String(detail) } : {}) },
  }
}

/**
 * Extract one selected OpenAI item.
 *
 * `proxy` is the run's proxy state (`{ available, reason, code }`). When the
 * proxy is not available the article page is never requested: the item is the
 * RSS excerpt with `proxy_unavailable`, which is exactly what the digest and
 * the page report.
 */
export async function extractOpenAiArticle({ candidate, config, fetch: fetchImpl, proxy = null } = {}) {
  const settings = withDefaults(config)

  if (settings.extractFullText === false) return degraded(candidate, 'full_text_disabled')
  if (proxy && proxy.available === false) {
    return degraded(candidate, 'proxy_unavailable', proxy.reason ?? proxy.error ?? proxy.code ?? null)
  }
  if (typeof candidate?.url !== 'string' || candidate.url.length === 0) {
    return degraded(candidate, 'extract_failed', 'the candidate has no article URL')
  }

  let response
  let html
  try {
    ({ response, text: html } = await fetchText(fetchImpl, candidate.url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
    }))
  } catch (error) {
    return degraded(candidate, 'network', error?.message ?? error)
  }
  if (!response.ok) {
    if (response.status === 403) return degraded(candidate, 'http_403')
    return degraded(candidate, 'http_error', `HTTP ${response.status}`)
  }

  let page
  try {
    page = extractOpenAiPage(html, { maxBlocks: settings.maxBlocks })
  } catch (error) {
    return degraded(candidate, 'extract_failed', error?.message ?? error)
  }

  const paragraphs = page.blocks.filter(block => block.type === 'paragraph').length
  if (textBlocksOf(page.blocks).length < 2 || paragraphs === 0) {
    return degraded(candidate, 'extract_failed', 'the page did not contain readable sections')
  }

  return {
    blocks: page.blocks,
    excerpt: false,
    warnings: [],
    title: page.title || candidate.title,
    publishedAt: page.publishedAt || candidate.publishedAt || null,
    authors: page.authors,
  }
}

/** Validate the OpenAI section of the user config. */
export function validateOpenAiConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.openai must be an object`)
  if (typeof config.enabled !== 'boolean') throw configError(`${path}: sources.openai.enabled must be true or false`)
  if (typeof config.extractViaProxy !== 'boolean') {
    throw configError(`${path}: sources.openai.extractViaProxy must be true or false`)
  }
  if (typeof config.extractFullText !== 'boolean') {
    throw configError(`${path}: sources.openai.extractFullText must be true or false`)
  }
  assertUrl(config.rssUrl, 'sources.openai.rssUrl', path)
  assertPositive(config.timeoutMs, 'sources.openai.timeoutMs', path)
  if (!Number.isInteger(config.maxItems) || config.maxItems <= 0) {
    throw configError(`${path}: sources.openai.maxItems must be a positive integer`)
  }
  if (!Number.isInteger(config.maxBlocks) || config.maxBlocks <= 0) {
    throw configError(`${path}: sources.openai.maxBlocks must be a positive integer`)
  }
}
