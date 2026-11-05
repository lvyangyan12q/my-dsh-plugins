/**
 * arXiv source adapter.
 *
 * `listArxiv` reads the official Atom API for one submitted-date window;
 * `extractArxivPaper` reads the LaTeXML HTML (`arxiv.org/html/<id>`) and turns
 * it into ordered reader blocks. The HTML is a convenience: when it is
 * missing, blocked or unparsable the paper still enters the digest as an
 * abstract-level excerpt, and the reason is reported in `warnings`.
 *
 * Both functions take an injected `fetch`, so fixture tests never touch the
 * network. Failures are tagged with `sourceId: 'arxiv'` and a stable `code`
 * so the run record can report the source without parsing messages.
 */
import {
  attr,
  childrenOf,
  collapse,
  findAll,
  findFirst,
  hasAnyClass,
  hasClass,
  isElement,
  localName,
  parseMarkup,
  textOf,
} from '../shared/markup.js'
import { classifyDirection, matchedWords } from './direction.js'
import { assertPositive, assertStringList, assertUrl, configError, isPlainObject } from './validation.js'

export { classifyDirection }

export const SOURCE_ID = 'arxiv'

export const DEFAULT_ARXIV_CONFIG = {
  enabled: true,
  categories: ['cs.AI', 'cs.CL', 'cs.LG'],
  keywords: [],
  excludeKeywords: [],
  maxResults: 100,
  timeoutMs: 20_000,
  baseUrl: 'https://export.arxiv.org/api/query',
  htmlBaseUrl: 'https://arxiv.org/html',
  extractFullText: true,
  maxBlocks: 400,
  userAgent: 'dsh-paper-reader/0.1 (+https://arxiv.org/help/api)',
}

const SKIP_TAGS = new Set(['script', 'style', 'nav', 'header', 'footer', 'aside', 'form', 'button', 'svg'])
const SKIP_CLASSES = [
  'ltx_page_header',
  'ltx_page_footer',
  'ltx_page_navbar',
  'ltx_bibliography',
  'ltx_biblist',
  'ltx_ERROR',
]

function sourceError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID }, extra)
}

function withDefaults(config) {
  return { ...DEFAULT_ARXIV_CONFIG, ...(config ?? {}) }
}

/** Fetch text with a timeout, without letting the timer keep the process alive. */
async function fetchText(fetchImpl, url, { timeoutMs = 20_000, userAgent } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw sourceError('arxiv_fetch_missing', 'no fetch implementation was provided')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  if (typeof timer.unref === 'function') timer.unref()
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/atom+xml, text/html;q=0.9, */*;q=0.1',
        ...(userAgent ? { 'user-agent': userAgent } : {}),
      },
    })
    const text = typeof response.text === 'function' ? await response.text() : ''
    return { response, text }
  } finally {
    clearTimeout(timer)
  }
}

/** The versionless arXiv id (`2611.05377v2` → `2611.05377`). */
export function normalizeArxivId(value) {
  const text = String(value ?? '').trim()
  const match = /(?:arxiv\.org\/(?:abs|pdf)\/)?([a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?/i.exec(text)
  if (match) return match[1].replace(/v\d+$/, '')
  return text.replace(/^https?:\/\/[^/]+\//, '').replace(/v\d+$/, '')
}

function firstText(node, local) {
  return collapse(textOf(childrenOf(node, local)[0] ?? null))
}

/** Parse the Atom feed into raw entry records. */
export function parseAtomFeed(xml) {
  const tree = parseMarkup(xml, { html: false })
  const feed = findFirst(tree, node => localName(node.name) === 'feed')
  if (!feed) return []

  return childrenOf(feed, 'entry').map((entry) => {
    const rawId = firstText(entry, 'id')
    const arxivId = normalizeArxivId(rawId)
    const published = firstText(entry, 'published') || firstText(entry, 'updated')
    const links = childrenOf(entry, 'link')
    const alternate = links.find(link => {
      const rel = attr(link, 'rel')
      return !rel || rel === 'alternate'
    })
    const href = alternate ? attr(alternate, 'href') : null
    return {
      arxivId,
      rawId,
      title: collapse(textOf(childrenOf(entry, 'title')[0] ?? null)),
      summary: collapse(textOf(childrenOf(entry, 'summary')[0] ?? null)),
      published,
      updated: firstText(entry, 'updated'),
      authors: childrenOf(entry, 'author').map(author => collapse(textOf(childrenOf(author, 'name')[0] ?? null))).filter(Boolean),
      categories: childrenOf(entry, 'category').map(category => attr(category, 'term')).filter(Boolean),
      primaryCategory: attr(childrenOf(entry, 'primary_category')[0] ?? null, 'term'),
      comment: firstText(entry, 'comment'),
      journalRef: firstText(entry, 'journal_ref'),
      doi: firstText(entry, 'doi'),
      url: arxivId ? `https://arxiv.org/abs/${arxivId}` : href || rawId,
    }
  })
}

/** Build the Atom query for one submitted-date window. */
export function buildArxivQueryUrl({ baseUrl, categories = [], date, maxResults = 100 }) {
  const compact = String(date).replace(/-/g, '')
  const categoryQuery = categories.length > 0 ? categories.map(category => `cat:${category}`).join(' OR ') : 'all'
  const url = new URL(baseUrl || DEFAULT_ARXIV_CONFIG.baseUrl)
  url.searchParams.set('search_query', `(${categoryQuery}) AND submittedDate:[${compact}0000 TO ${compact}2359]`)
  url.searchParams.set('start', '0')
  url.searchParams.set('max_results', String(maxResults))
  url.searchParams.set('sortBy', 'submittedDate')
  url.searchParams.set('sortOrder', 'descending')
  return url.toString()
}

function toCandidate(entry) {
  const direction = classifyDirection(entry)
  return {
    id: `${SOURCE_ID}:${entry.arxivId}`,
    sourceId: SOURCE_ID,
    arxivId: entry.arxivId,
    sourceLanguage: 'en',
    title: entry.title,
    summary: entry.summary,
    url: entry.url,
    publishedAt: entry.published || null,
    published: entry.published ? entry.published.slice(0, 10) : null,
    authors: entry.authors,
    categories: entry.categories,
    primaryCategory: entry.primaryCategory,
    direction,
    tags: [...new Set([...entry.categories, ...matchedWords(entry)])],
  }
}

function byPublishedDesc(left, right) {
  const a = Date.parse(left.publishedAt ?? '') || 0
  const b = Date.parse(right.publishedAt ?? '') || 0
  if (a !== b) return b - a
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/** List one day of arXiv submissions as source-tagged candidates. */
export async function listArxiv({ config, date, fetch: fetchImpl }) {
  const settings = withDefaults(config)
  const url = buildArxivQueryUrl({
    baseUrl: settings.baseUrl,
    categories: settings.categories,
    date,
    maxResults: settings.maxResults,
  })

  let response
  let text
  try {
    ({ response, text } = await fetchText(fetchImpl, url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
    }))
  } catch (error) {
    throw sourceError('arxiv_network', `arXiv API request failed: ${error?.message ?? error}`, { cause: error })
  }

  if (!response.ok) {
    throw sourceError('arxiv_http', `arXiv API answered HTTP ${response.status}`, { status: response.status })
  }
  if (!/<feed[\s>]/i.test(text)) {
    throw sourceError('arxiv_invalid', 'arXiv API did not return an Atom feed')
  }

  return parseAtomFeed(text).filter(entry => entry.arxivId).map(toCandidate).sort(byPublishedDesc)
}

/* ------------------------------------------------------------------ */
/* LaTeXML article HTML                                                */
/* ------------------------------------------------------------------ */

function inlineText(node) {
  if (typeof node === 'string') return node
  if (!isElement(node)) return ''
  const tag = localName(node.name)
  if (SKIP_TAGS.has(tag) || hasAnyClass(node, SKIP_CLASSES)) return ''
  if (tag === 'math') {
    const alttext = attr(node, 'alttext')
    return alttext ? ` $${alttext}$ ` : ` ${textOf(node)} `
  }
  if (tag === 'br') return ' '
  if (tag === 'img') {
    const alt = attr(node, 'alt')
    return alt ? ` ${alt} ` : ''
  }
  return node.children.map(inlineText).join('')
}

function textBlocksOf(blocks) {
  return blocks.filter(block => block.type === 'heading' || block.type === 'paragraph' || block.type === 'code')
}

function pushHeading(node, blocks) {
  const tag = localName(node.name)
  if (tag === 'h1' && hasClass(node, 'ltx_title_document')) return
  const level = tag === 'h6' && hasClass(node, 'ltx_title_abstract') ? 2 : Number(tag.slice(1)) || 2
  const text = collapse(inlineText(node))
  if (!text) return
  blocks.push({ type: 'heading', level, original: text })
}

function pushParagraph(node, blocks) {
  const text = collapse(inlineText(node))
  if (!text) return
  blocks.push({ type: 'paragraph', original: text })
}

function pushEquation(node, blocks) {
  const math = findFirst(node, child => localName(child.name) === 'math' && Boolean(attr(child, 'alttext')))
    ?? findFirst(node, child => localName(child.name) === 'math')
  const display = collapse(attr(math, 'alttext') || textOf(math))
  if (!display) return
  const labelNode = findFirst(node, child => hasClass(child, 'ltx_tag_equation') || hasClass(child, 'ltx_tag'))
  const label = labelNode ? collapse(textOf(labelNode)) : ''
  blocks.push({
    type: 'equation',
    display,
    detail: '',
    ...(label ? { label } : {}),
  })
}

function pushFigure(node, blocks) {
  const captionNode = findFirst(node, child => localName(child.name) === 'figcaption' || hasClass(child, 'ltx_caption'))
  const caption = captionNode
    ? collapse(textOf(captionNode)).replace(/^(?:Figure|Fig\.|Table)\s*\d+[:.]\s*/i, '')
    : ''
  const imageNode = findFirst(node, child => localName(child.name) === 'img' && Boolean(attr(child, 'src')))
  const image = imageNode ? attr(imageNode, 'src') : ''
  if (!caption && !image) return
  blocks.push({
    type: 'figure',
    image: image && !image.startsWith('data:') ? image : null,
    ...(caption ? { caption: { original: caption } } : {}),
  })
}

function pushCode(node, blocks) {
  // Git checkouts on Windows may hand CRLF to the parser; keep code blocks LF so
  // the reader and fixture assertions share one line-ending form.
  const raw = textOf(node).replace(/\r\n?/g, '\n').replace(/^\s*\n/, '').replace(/\s+$/, '')
  if (!raw.trim()) return
  let language = null
  for (const candidate of [node, ...findAll(node, child => Boolean(attr(child, 'class')))]) {
    const match = /(?:^|\s)language-([A-Za-z0-9_+#.-]+)/.exec(attr(candidate, 'class') || '')
    if (match) {
      language = match[1].toLowerCase()
      break
    }
  }
  blocks.push({ type: 'code', code: raw, ...(language ? { language } : {}) })
}

/** Turn a LaTeXML article into ordered reader blocks. */
export function extractArticleBlocks(html, { maxBlocks = DEFAULT_ARXIV_CONFIG.maxBlocks } = {}) {
  const tree = parseMarkup(html, { html: true })
  const article = findFirst(tree, node => localName(node.name) === 'article')
    ?? findFirst(tree, node => localName(node.name) === 'body')
    ?? tree
  const blocks = []

  const walk = (node) => {
    if (blocks.length >= maxBlocks) return
    if (typeof node === 'string') return
    if (!isElement(node)) return
    const tag = localName(node.name)
    if (SKIP_TAGS.has(tag) || hasAnyClass(node, SKIP_CLASSES)) return

    if (tag === 'pre' || hasClass(node, 'ltx_verbatim')) {
      pushCode(node, blocks)
      return
    }
    if (tag === 'figure' || hasClass(node, 'ltx_figure')) {
      pushFigure(node, blocks)
      return
    }
    if (hasClass(node, 'ltx_equation') || (tag === 'math' && attr(node, 'display') === 'block')) {
      pushEquation(node, blocks)
      return
    }
    if (/^h[1-6]$/.test(tag)) {
      pushHeading(node, blocks)
      return
    }
    if (tag === 'p' || hasClass(node, 'ltx_p')) {
      pushParagraph(node, blocks)
      return
    }

    for (const child of node.children) walk(child)
  }

  walk(article)
  return blocks
}

/** Abstract-level blocks used whenever full text is unavailable. */
export function excerptBlocks(candidate) {
  const blocks = [{ type: 'heading', level: 2, original: 'Abstract' }]
  const summary = collapse(candidate.summary ?? '')
  if (summary) blocks.push({ type: 'paragraph', original: summary })
  const abstract = collapse(candidate.abstract ?? '')
  if (!summary && abstract) blocks.push({ type: 'paragraph', original: abstract })
  return blocks
}

/**
 * Extract one selected paper.
 *
 * Returns `{ blocks, excerpt, warnings }`. Full text is always a best effort:
 * any failure degrades to `excerpt: true` with the abstract, never to a failed
 * item, so one broken HTML page cannot lose the day.
 */
export async function extractArxivPaper({ candidate, config, fetch: fetchImpl }) {
  const settings = withDefaults(config)
  const fallback = (warning) => ({
    blocks: excerptBlocks(candidate),
    excerpt: true,
    warnings: warning ? [warning] : [],
  })

  if (settings.extractFullText === false) return fallback()
  const arxivId = candidate.arxivId || normalizeArxivId(candidate.id)
  if (!arxivId) return fallback('the candidate has no arXiv id')

  const base = String(settings.htmlBaseUrl || DEFAULT_ARXIV_CONFIG.htmlBaseUrl).replace(/\/+$/, '')
  const url = `${base}/${encodeURIComponent(arxivId)}`

  let response
  let html
  try {
    ({ response, text: html } = await fetchText(fetchImpl, url, { timeoutMs: settings.timeoutMs }))
  } catch (error) {
    return fallback(`arXiv HTML unavailable: ${error?.message ?? error}`)
  }
  if (!response.ok) {
    return fallback(`arXiv HTML answered HTTP ${response.status}`)
  }

  let blocks = []
  try {
    blocks = extractArticleBlocks(html, { maxBlocks: settings.maxBlocks })
  } catch (error) {
    return fallback(`arXiv HTML could not be parsed: ${error?.message ?? error}`)
  }
  if (textBlocksOf(blocks).length < 2) {
    return fallback('arXiv HTML did not contain readable sections')
  }
  return { blocks, excerpt: false, warnings: [] }
}

/** Validate the arXiv section of the user config. */
export function validateArxivConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.arxiv must be an object`)
  if (typeof config.enabled !== 'boolean') {
    throw configError(`${path}: sources.arxiv.enabled must be true or false`)
  }
  assertStringList(config.categories, 'sources.arxiv.categories', path)
  assertStringList(config.keywords, 'sources.arxiv.keywords', path)
  assertStringList(config.excludeKeywords, 'sources.arxiv.excludeKeywords', path)
  if (!Number.isInteger(config.maxResults) || config.maxResults <= 0) {
    throw configError(`${path}: sources.arxiv.maxResults must be a positive integer`)
  }
  if (typeof config.extractFullText !== 'boolean') {
    throw configError(`${path}: sources.arxiv.extractFullText must be true or false`)
  }
  assertPositive(config.timeoutMs, 'sources.arxiv.timeoutMs', path)
  if (!Number.isInteger(config.maxBlocks) || config.maxBlocks <= 0) {
    throw configError(`${path}: sources.arxiv.maxBlocks must be a positive integer`)
  }
  assertUrl(config.baseUrl, 'sources.arxiv.baseUrl', path)
  assertUrl(config.htmlBaseUrl, 'sources.arxiv.htmlBaseUrl', path)
}

export const ARXIV_SOURCE = {
  id: SOURCE_ID,
  kind: 'paper',
  label: 'arXiv',
  short: 'A',
  defaults: DEFAULT_ARXIV_CONFIG,
  tracksSeen: false,
  onExtractFailure: 'excerpt',
  list: listArxiv,
  extract: extractArxivPaper,
  validateConfig: validateArxivConfig,
}
