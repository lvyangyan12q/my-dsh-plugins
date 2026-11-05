/**
 * DeepSeek source adapter.
 *
 * DeepSeek is the only officially bilingual source: the docs site publishes
 * every news item as English Markdown (`/news/<slug>.md`) *and* Chinese
 * Markdown (`/zh-cn/news/<slug>.md`). The adapter therefore writes the pairs
 * straight into `original` (Chinese) + `translation` (English) and never calls
 * a translation model.
 *
 * Discovery must not use `/news`: that URL answers 200 with the "Your First API
 * Call" documentation page (a soft 404). The sitemap is the real list, and each
 * slug carries its own publication date (`news261017` → 2026-10-17), so no
 * `lastmod` heuristics are needed.
 *
 * `listDeepSeek` and `extractDeepSeekArticle` take an injected `fetch`, so
 * fixture tests never touch the network. Failures carry `sourceId: 'deepseek'`
 * and a stable `code`, the same contract the arXiv adapter uses.
 */
import {
  collapse,
  decodeEntities,
  findAll,
  localName,
  parseMarkup,
  textOf,
} from '../shared/markup.js'
import { classifyDirection } from '../shared/direction.js'
import { fetchText } from '../shared/http.js'
import {
  assertPositive,
  assertUrl,
  configError,
  isPlainObject,
} from './validation.js'

export const SOURCE_ID = 'deepseek'

export const DEFAULT_DEEPSEEK_CONFIG = {
  enabled: true,
  useProxy: false,
  sitemapUrl: 'https://api-docs.deepseek.com/sitemap.xml',
  baseUrl: 'https://api-docs.deepseek.com',
  timeoutMs: 20_000,
  // A 09:00 run must still pick up what was published the previous evening.
  lookbackDays: 1,
  maxItems: 10,
  maxBlocks: 400,
  // Four-digit slugs (`news0725`) predate the `newsYYMMDD` form and belong to
  // the year the docs site launched. They only matter for backfills.
  legacyYear: 2024,
  userAgent: 'dsh-paper-reader/0.1 (+https://api-docs.deepseek.com)',
}

const NEWS_PATH = /^\/news\/(news\d{4}|news\d{6})$/

function sourceError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, sourceId: SOURCE_ID }, extra)
}

function withDefaults(config) {
  return { ...DEFAULT_DEEPSEEK_CONFIG, ...(config ?? {}) }
}

/** `YYYY-MM-DD` shifted by whole days, without pulling in the storage layer. */
function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** The publication date encoded in a news slug (`news261017` → 2026-10-17). */
export function dateFromSlug(slug, legacyYear = DEFAULT_DEEPSEEK_CONFIG.legacyYear) {
  const digits = String(slug ?? '').replace(/^news/, '')
  let year
  let month
  let day
  if (/^\d{6}$/.test(digits)) {
    year = 2000 + Number(digits.slice(0, 2))
    month = Number(digits.slice(2, 4))
    day = Number(digits.slice(4, 6))
  } else if (/^\d{4}$/.test(digits)) {
    year = Number(legacyYear)
    month = Number(digits.slice(0, 2))
    day = Number(digits.slice(2, 4))
  } else {
    return null
  }
  const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return isRealDate(value) ? value : null
}

/**
 * Parse `sitemap.xml` into news entries, in document order.
 *
 * Only `https://api-docs.deepseek.com/news/<slug>` URLs count: documentation
 * pages, `/updates` and the `/zh-cn/` duplicate of the same slug are dropped,
 * so one article is discovered exactly once.
 */
export function parseDeepSeekSitemap(xml, { baseUrl, legacyYear } = {}) {
  const base = String(baseUrl || DEFAULT_DEEPSEEK_CONFIG.baseUrl).replace(/\/+$/, '')
  const year = legacyYear ?? DEFAULT_DEEPSEEK_CONFIG.legacyYear
  const tree = parseMarkup(xml, { html: false })
  const entries = []
  const seen = new Set()

  for (const loc of findAll(tree, node => localName(node.name) === 'loc')) {
    const raw = collapse(textOf(loc))
    if (!raw) continue
    let url
    try {
      url = new URL(raw)
    } catch {
      continue
    }
    const match = NEWS_PATH.exec(url.pathname)
    if (!match) continue
    const slug = match[1]
    if (seen.has(slug)) continue
    const published = dateFromSlug(slug, year)
    if (!published) continue
    seen.add(slug)
    entries.push({
      slug,
      published,
      url: `${base}/news/${slug}`,
    })
  }

  return entries
}

/** One discovered article as a selection candidate (`kind: 'blog'`). */
function toCandidate(entry) {
  return {
    id: `${SOURCE_ID}:${entry.slug}`,
    sourceId: SOURCE_ID,
    kind: 'blog',
    sourceLanguage: 'zh',
    slug: entry.slug,
    // The real title is only in the Markdown, which extraction reads; this is
    // the fallback a failure would show, never the normal digest title.
    title: `DeepSeek ${entry.published}`,
    summary: '',
    url: entry.url,
    // The slug carries a calendar day, not an instant: keep the date-only form
    // so the digest writes that day at midnight UTC instead of shifting it.
    publishedAt: entry.published,
    direction: 'architecture',
    tags: [SOURCE_ID, 'news'],
  }
}

/**
 * List the news published in the digest window `[date - lookbackDays, date]`.
 *
 * The window (rather than the whole sitemap) is what keeps the blog quota
 * meaningful: only genuinely new posts compete for the four blog slots, so an
 * old DeepSeek announcement cannot starve Anthropic/Kimi/OpenAI every day.
 */
export async function listDeepSeek({ config, date, fetch: fetchImpl }) {
  const settings = withDefaults(config)
  const url = settings.sitemapUrl
  if (typeof fetchImpl !== 'function') {
    throw sourceError('deepseek_fetch_missing', 'no fetch implementation was provided')
  }

  let response
  let text
  try {
    ({ response, text } = await fetchText(fetchImpl, url, {
      timeoutMs: settings.timeoutMs,
      userAgent: settings.userAgent,
      accept: 'application/xml, text/xml;q=0.9, */*;q=0.1',
    }))
  } catch (error) {
    throw sourceError('deepseek_network', `DeepSeek sitemap request failed: ${error?.message ?? error}`, { cause: error })
  }

  if (!response.ok) {
    throw sourceError('deepseek_http', `DeepSeek sitemap answered HTTP ${response.status}`, { status: response.status })
  }
  if (!/<urlset[\s>]/i.test(text)) {
    throw sourceError('deepseek_invalid', 'DeepSeek sitemap did not return a urlset')
  }

  const from = shiftDate(date, -Math.max(0, Number(settings.lookbackDays) || 0))
  return parseDeepSeekSitemap(text, settings)
    .filter(entry => entry.published >= from && entry.published <= date)
    .sort((left, right) => (left.published === right.published
      ? (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0)
      : (left.published < right.published ? 1 : -1)))
    .slice(0, Math.max(0, Number(settings.maxItems) || 0))
    .map(toCandidate)
}

/* ------------------------------------------------------------------ */
/* Official Markdown → reader blocks                                   */
/* ------------------------------------------------------------------ */

const CJK = /[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/

/** Resolve a Markdown image path against the docs site. */
function resolveImage(src, baseUrl = DEFAULT_DEEPSEEK_CONFIG.baseUrl) {
  const value = String(src ?? '').trim()
  if (!value) return null
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return value
  }
}

/**
 * Strip the inline Markdown the reader does not render (bold, italic, links,
 * inline code, autolinks, raw HTML, escapes) and collapse whitespace. The
 * result is plain text for `original` / `translation`.
 */
function stripInline(text) {
  let value = String(text ?? '')
  value = value.replace(/\\([\\`*_{}\[\]()#+\-.!>~@|])/g, '$1')
  value = value.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  value = value.replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1')
  value = value.replace(/<\/?[a-zA-Z][^>]*>/g, '')
  value = value.replace(/`([^`]*)`/g, '$1')
  value = value.replace(/\*\*([^*]+)\*\*/g, '$1')
  value = value.replace(/__([^_]+)__/g, '$1')
  value = value.replace(/~~([^~]+)~~/g, '$1')
  value = value.replace(/(^|[\s(（【])[*_]([^*_\n]+)[*_](?=$|[\s)）】.,，。:：;；!！?？])/g, '$1$2')
  value = decodeEntities(value)
  return collapse(value)
}

/** Join hard-wrapped Markdown lines: no space between two CJK characters. */
function joinLines(lines) {
  let value = ''
  for (const line of lines) {
    const piece = String(line).trim()
    if (!piece) continue
    if (!value) {
      value = piece
      continue
    }
    const left = value.slice(-1)
    const right = piece[0]
    value += (CJK.test(left) || CJK.test(right) ? '' : ' ') + piece
  }
  return value
}

const HEADING_LINE = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const RULE_LINE = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/
const IMAGE_LINE = /^\s*!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)\s*$/
const LIST_LINE = /^\s{0,3}(?:[-*+]|\d+[.)])\s+(.*)$/
const QUOTE_LINE = /^\s{0,3}>\s?(.*)$/
const FENCE_LINE = /^\s{0,3}(```+|~~~+)\s*([^\s`]*)/

/**
 * Parse the official DeepSeek Markdown into ordered reader blocks.
 *
 * Supported: ATX headings, paragraphs (hard wraps joined), fenced code,
 * standalone images (as figures) and horizontal rules (ignored). Every block
 * carries its text in `original`, which is the English page or the Chinese
 * page depending on the document; pairing happens in `alignBlocks`.
 */
export function parseMarkdownBlocks(source, { maxBlocks = DEFAULT_DEEPSEEK_CONFIG.maxBlocks, baseUrl } = {}) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let paragraph = []

  const flush = () => {
    if (paragraph.length === 0) return
    const text = stripInline(joinLines(paragraph))
    paragraph = []
    if (text && blocks.length < maxBlocks) blocks.push({ type: 'paragraph', original: text })
  }

  let index = 0
  while (index < lines.length && blocks.length < maxBlocks) {
    const line = lines[index]

    const fence = FENCE_LINE.exec(line)
    if (fence) {
      flush()
      const language = fence[2] ? fence[2].toLowerCase() : null
      const code = []
      index += 1
      while (index < lines.length) {
        if (/^\s{0,3}(```+|~~~+)\s*$/.test(lines[index])) {
          index += 1
          break
        }
        code.push(lines[index])
        index += 1
      }
      const text = code.join('\n').replace(/\s+$/, '')
      if (text.trim() && blocks.length < maxBlocks) {
        blocks.push({ type: 'code', code: text, ...(language ? { language } : {}) })
      }
      continue
    }

    const heading = HEADING_LINE.exec(line)
    if (heading) {
      flush()
      const text = stripInline(heading[2])
      if (text && blocks.length < maxBlocks) {
        blocks.push({ type: 'heading', level: heading[1].length, original: text })
      }
      index += 1
      continue
    }

    if (RULE_LINE.test(line)) {
      flush()
      index += 1
      continue
    }

    const image = IMAGE_LINE.exec(line)
    if (image) {
      flush()
      const src = resolveImage(image[2], baseUrl)
      const alt = stripInline(image[1])
      if (src && blocks.length < maxBlocks) {
        blocks.push({ type: 'figure', image: src, ...(alt ? { caption: { original: alt } } : {}) })
      }
      index += 1
      continue
    }

    if (/^\s*$/.test(line)) {
      flush()
      index += 1
      continue
    }

    const item = LIST_LINE.exec(line)
    if (item) {
      flush()
      const text = stripInline(item[1])
      if (text && blocks.length < maxBlocks) blocks.push({ type: 'paragraph', original: text })
      index += 1
      continue
    }

    const quote = QUOTE_LINE.exec(line)
    paragraph.push(quote ? quote[1] : line)
    index += 1
  }

  flush()
  return blocks.slice(0, maxBlocks)
}

/* ------------------------------------------------------------------ */
/* Block alignment                                                     */
/* ------------------------------------------------------------------ */

const GAP_SCORE = -1
const MISMATCH_SCORE = -4
const HEADING_MISMATCH_SCORE = -6

function pairScore(chinese, english) {
  if (chinese.type === 'heading' && english.type === 'heading') return 3
  if (chinese.type === english.type) return 3
  if (chinese.type === 'heading' || english.type === 'heading') return HEADING_MISMATCH_SCORE
  return MISMATCH_SCORE
}

/**
 * Align the Chinese and English block sequences.
 *
 * The two official versions are translations of each other but their paragraph
 * splits are not guaranteed to match, and there is no lexical overlap to score:
 * alignment is therefore structural. A same-type pair scores higher than two
 * gaps, and a heading never pairs with prose, so headings anchor the sequence.
 * The result is an ordered list of `{ chinese, english }` where either side may
 * be null.
 */
export function alignBlocks(chinese, english) {
  const rows = chinese.length
  const cols = english.length
  const scores = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0))
  const choices = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(''))

  for (let i = 1; i <= rows; i += 1) scores[i][0] = scores[i - 1][0] + GAP_SCORE
  for (let j = 1; j <= cols; j += 1) scores[0][j] = scores[0][j - 1] + GAP_SCORE

  for (let i = 1; i <= rows; i += 1) {
    for (let j = 1; j <= cols; j += 1) {
      let best = scores[i - 1][j - 1] + pairScore(chinese[i - 1], english[j - 1])
      let choice = 'pair'
      const up = scores[i - 1][j] + GAP_SCORE
      if (up > best) {
        best = up
        choice = 'chinese'
      }
      const left = scores[i][j - 1] + GAP_SCORE
      if (left > best) {
        best = left
        choice = 'english'
      }
      scores[i][j] = best
      choices[i][j] = choice
    }
  }

  const alignment = []
  let i = rows
  let j = cols
  while (i > 0 || j > 0) {
    const choice = i > 0 && j > 0 ? choices[i][j] : i > 0 ? 'chinese' : 'english'
    if (choice === 'pair') {
      alignment.push({ chinese: chinese[i - 1], english: english[j - 1] })
      i -= 1
      j -= 1
    } else if (choice === 'chinese') {
      alignment.push({ chinese: chinese[i - 1], english: null })
      i -= 1
    } else {
      alignment.push({ chinese: null, english: english[j - 1] })
      j -= 1
    }
  }
  return alignment.reverse()
}

function figureBlock(chinese, english) {
  const image = chinese?.image ?? english?.image ?? null
  const block = { type: 'figure', image }
  const original = chinese?.caption?.original
  // A caption must be written in the item's language; an English-only alt text
  // cannot become the original of a Chinese-source figure, so it is dropped.
  if (original) {
    block.caption = { original, translation: english?.caption?.original ?? null }
  }
  return block
}

/**
 * Merge one aligned pair into a reader block.
 *
 * Chinese is the original. An English-only prose block is not representable:
 * the contract requires `original` to be written in the item's language, so it
 * is dropped and reported as a warning. Code is language-neutral and survives
 * once; a figure survives via its Chinese image.
 */
function combineBlocks(chinese, english) {
  if (!chinese) {
    return english.type === 'code' ? { ...english } : null
  }
  if (!english) {
    if (chinese.type === 'heading' || chinese.type === 'paragraph') {
      return { ...chinese, translation: null }
    }
    if (chinese.type === 'figure') return figureBlock(chinese, null)
    return { ...chinese }
  }
  if (chinese.type === 'heading' || chinese.type === 'paragraph') {
    if (english.type !== chinese.type) return { ...chinese, translation: null }
    return {
      type: chinese.type,
      ...(chinese.type === 'heading' ? { level: chinese.level } : {}),
      original: chinese.original,
      translation: english.original,
    }
  }
  if (chinese.type === 'code') {
    return {
      type: 'code',
      code: chinese.code ?? english.code,
      ...(chinese.language || english.language ? { language: chinese.language ?? english.language } : {}),
    }
  }
  if (chinese.type === 'figure') return figureBlock(chinese, english)
  return null
}

function splitTitle(blocks) {
  const index = blocks.findIndex(block => block.type === 'heading' && block.level === 1)
  if (index === -1) return { title: null, body: blocks }
  return { title: blocks[index].original, body: [...blocks.slice(0, index), ...blocks.slice(index + 1)] }
}

function textBlocksOf(blocks) {
  return blocks.filter(block => block.type === 'heading' || block.type === 'paragraph')
}

/**
 * Extract one DeepSeek news item from its official English and Chinese pages.
 *
 * The Chinese page is the original; the English page is the translation. No
 * translation request is ever made. When the Chinese page is missing the item
 * degrades to the English page with `translation: null` and
 * `translationState: "pending"`, so it still shows up in the reader instead of
 * disappearing. When neither page exists the item is skipped with a warning.
 */
export async function extractDeepSeekArticle({ candidate, config, fetch: fetchImpl }) {
  const settings = withDefaults(config)
  const slug = slugOf(candidate)
  if (!slug) {
    return { skip: true, finalized: true, warnings: ['the candidate carries no DeepSeek news slug'] }
  }

  const base = String(settings.baseUrl || DEFAULT_DEEPSEEK_CONFIG.baseUrl).replace(/\/+$/, '')
  const urls = {
    en: `${base}/news/${slug}.md`,
    zh: `${base}/zh-cn/news/${slug}.md`,
  }

  const read = async (url) => {
    try {
      const { response, text } = await fetchText(fetchImpl, url, {
        timeoutMs: settings.timeoutMs,
        userAgent: settings.userAgent,
        accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1',
      })
      if (!response.ok) return { ok: false, status: response.status }
      if (typeof text !== 'string' || text.trim().length === 0) return { ok: false, status: response.status, empty: true }
      return { ok: true, text }
    } catch (error) {
      return { ok: false, error: error?.message ?? String(error) }
    }
  }

  const [englishPage, chinesePage] = await Promise.all([read(urls.en), read(urls.zh)])

  const englishDoc = englishPage.ok
    ? splitTitle(parseMarkdownBlocks(englishPage.text, { maxBlocks: settings.maxBlocks, baseUrl: base }))
    : { title: null, body: [] }
  const chineseDoc = chinesePage.ok
    ? splitTitle(parseMarkdownBlocks(chinesePage.text, { maxBlocks: settings.maxBlocks, baseUrl: base }))
    : { title: null, body: [] }

  if (!englishPage.ok && !chinesePage.ok) {
    return {
      skip: true,
      finalized: true,
      warnings: [
        `DeepSeek pages are unavailable for ${slug}`
        + ` (English: ${describeFailure(englishPage)}, Chinese: ${describeFailure(chinesePage)})`,
      ],
    }
  }

  const warnings = []
  const chineseUsable = chinesePage.ok && Boolean(chineseDoc.title)

  if (!chineseUsable) {
    // No Chinese page (or no usable title): keep the English item as a normal
    // untranslated article so the news is still readable and visible.
    if (!englishPage.ok || !englishDoc.title) {
      return {
        skip: true,
        finalized: true,
        warnings: [`DeepSeek item ${slug} has neither a Chinese nor a usable English version`],
      }
    }
    if (!chinesePage.ok) {
      warnings.push(`Chinese Markdown is missing for ${slug}; kept the English page and marked it pending`)
    } else {
      warnings.push(`Chinese Markdown has no title for ${slug}; kept the English page and marked it pending`)
    }
    const blocks = englishDoc.body.map(block => (block.type === 'heading' || block.type === 'paragraph'
      ? { ...block, translation: null }
      : { ...block }))
    const firstParagraph = blocks.find(block => block.type === 'paragraph')
    return {
      finalized: true,
      excerpt: false,
      sourceLanguage: 'en',
      title: { original: englishDoc.title, translation: null },
      summary: firstParagraph ? { original: firstParagraph.original, translation: null } : null,
      blocks: blocks.slice(0, settings.maxBlocks),
      translationState: 'pending',
      direction: classifyDirectionFor(englishDoc.title, firstParagraph?.original),
      warnings,
    }
  }

  if (!englishPage.ok) {
    warnings.push(`English Markdown is missing for ${slug}; the Chinese original is kept without a translation`)
  }

  const alignment = alignBlocks(chineseDoc.body, englishDoc.body)
  const blocks = alignment.map(pair => combineBlocks(pair.chinese, pair.english)).filter(Boolean)
  const droppedEnglish = alignment
    .filter(pair => !pair.chinese && pair.english && pair.english.type !== 'code')
    .length
  const chineseOnly = alignment.filter(pair => pair.chinese && !pair.english).length
  if (droppedEnglish > 0) {
    warnings.push(`${droppedEnglish} English block${droppedEnglish === 1 ? '' : 's'} have no Chinese counterpart in ${slug}; dropped`)
  }
  if (chineseOnly > 0) {
    warnings.push(`${chineseOnly} Chinese block${chineseOnly === 1 ? '' : 's'} have no English counterpart in ${slug}; left untranslated`)
  }

  const textBlocks = textBlocksOf(blocks)
  const translated = textBlocks.filter(block => Boolean(block.translation)).length
  const translationState = textBlocks.length === 0 || translated === textBlocks.length
    ? 'complete'
    : translated === 0
      ? 'pending'
      : 'partial'

  const firstParagraph = blocks.find(block => block.type === 'paragraph')
  const summary = firstParagraph
    ? { original: firstParagraph.original, translation: firstParagraph.translation ?? null }
    : null

  return {
    finalized: true,
    excerpt: false,
    sourceLanguage: 'zh',
    title: {
      original: chineseDoc.title,
      translation: englishDoc.title ?? null,
    },
    summary,
    blocks: blocks.slice(0, settings.maxBlocks),
    translationState,
    direction: classifyDirectionFor(chineseDoc.title, firstParagraph?.original),
    warnings,
  }
}

function slugOf(candidate) {
  if (typeof candidate?.slug === 'string' && candidate.slug.length > 0) return candidate.slug
  const match = /\/(?:zh-cn\/)?news\/(news\d{4}|news\d{6})(?:\.md)?\/?$/.exec(String(candidate?.url ?? ''))
  return match ? match[1] : null
}

function describeFailure(page) {
  if (page?.status) return `HTTP ${page.status}`
  return page?.error ? String(page.error) : 'unavailable'
}

function classifyDirectionFor(title, summary) {
  return classifyDirection({ title: title ?? '', summary: summary ?? '' })
}

/** Validate the DeepSeek section of the user config. */
export function validateDeepSeekConfig(config, path) {
  if (!isPlainObject(config)) throw configError(`${path}: sources.deepseek must be an object`)
  if (typeof config.enabled !== 'boolean') {
    throw configError(`${path}: sources.deepseek.enabled must be true or false`)
  }
  assertUrl(config.sitemapUrl, 'sources.deepseek.sitemapUrl', path)
  assertUrl(config.baseUrl, 'sources.deepseek.baseUrl', path)
  assertPositive(config.timeoutMs, 'sources.deepseek.timeoutMs', path)
  if (!Number.isInteger(config.lookbackDays) || config.lookbackDays < 0) {
    throw configError(`${path}: sources.deepseek.lookbackDays must be a non-negative integer`)
  }
  if (!Number.isInteger(config.maxItems) || config.maxItems <= 0) {
    throw configError(`${path}: sources.deepseek.maxItems must be a positive integer`)
  }
  if (!Number.isInteger(config.maxBlocks) || config.maxBlocks <= 0) {
    throw configError(`${path}: sources.deepseek.maxBlocks must be a positive integer`)
  }
  if (!Number.isInteger(config.legacyYear) || config.legacyYear < 1990 || config.legacyYear > 2100) {
    throw configError(`${path}: sources.deepseek.legacyYear must be a four-digit year`)
  }
}
