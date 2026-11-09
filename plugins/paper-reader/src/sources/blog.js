/**
 * Shared extraction for the server-rendered blog sources (Anthropic, Kimi).
 *
 * The two sites differ in where the article lives and in their metadata
 * (`ld+json` shapes), but the prose itself is the same HTML: headings,
 * paragraphs, lists, code and figures. This module owns the tolerant parts:
 *
 * - `ld+json` scripts are decoded and flattened (`@graph`), never treated as
 *   prose, so a JSON block embedded in `<main>` cannot leak into the article;
 * - `script`, `style` and page chrome are skipped by tag and class;
 * - figures with the same image are emitted once, which is what the light/dark
 *   duplicate markup on Kimi needs;
 * - relative image URLs resolve against the article URL.
 */
import {
  attr,
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
import { dateOnly, shiftDate } from '../shared/date.js'
import { fetchText } from '../shared/http.js'
import { normalizeUrl } from '../shared/url.js'

// Re-exported: the adapters import the shared helpers through this module so a
// blog extraction has one obvious home for its transport and date rules.
export { dateOnly, fetchText, normalizeUrl, shiftDate }

const SKIP_TAGS = new Set([
  'script', 'style', 'nav', 'header', 'footer', 'aside', 'form', 'button',
  'svg', 'noscript', 'template', 'iframe',
])

const SKIP_CLASSES = ['sr-only', 'visually-hidden', 'screen-reader-text']

const ARTICLE_TYPES = new Set(['article', 'newsarticle', 'blogposting', 'techarticle', 'report', 'scholarlyarticle'])

/** A human title from a URL slug: `claude-code-best-practices` → `Claude Code Best Practices`. */
export function slugToTitle(value) {
  const slug = String(value ?? '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .split('/')
    .pop() ?? ''
  return slug
    .replace(/\.[a-z0-9]+$/i, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map(word => (word.length <= 2 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
    .join(' ')
}

/** Flatten every `ld+json` payload on the page into a list of objects. */
export function parseJsonLd(tree) {
  const entries = []
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value['@graph'])) {
      for (const item of value['@graph']) visit(item)
      return
    }
    entries.push(value)
  }

  for (const script of findAll(tree, node => localName(node.name) === 'script'
    && /ld\+json/i.test(attr(node, 'type') ?? ''))) {
    const raw = textOf(script).trim()
    if (!raw) continue
    try {
      visit(JSON.parse(raw))
    } catch {
      // A malformed metadata block must not cost the article.
    }
  }
  return entries
}

function typesOf(value) {
  const raw = value?.['@type']
  const list = Array.isArray(raw) ? raw : [raw]
  return list.filter(type => typeof type === 'string').map(type => type.toLowerCase())
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function nameOf(value) {
  if (typeof value === 'string') return stringOrNull(value)
  if (value && typeof value === 'object') return stringOrNull(value.name)
  return null
}

function namesOf(value) {
  const list = Array.isArray(value) ? value : [value]
  return list.map(nameOf).filter(Boolean)
}

function urlOf(value) {
  if (typeof value === 'string') return stringOrNull(value)
  if (value && typeof value === 'object') return stringOrNull(value['@id']) ?? stringOrNull(value.url)
  return null
}

/** Metadata from the page's structured data. Missing fields stay null. */
export function articleMeta(entries) {
  const article = entries.find(entry => typesOf(entry).some(type => ARTICLE_TYPES.has(type)))
    ?? entries.find(entry => stringOrNull(entry?.headline))
    ?? {}
  return {
    title: stringOrNull(article.headline) ?? stringOrNull(article.name),
    description: stringOrNull(article.description),
    datePublished: dateOnly(article.datePublished),
    dateModified: dateOnly(article.dateModified),
    authors: namesOf(article.author),
    publisher: nameOf(article.publisher),
    url: urlOf(article.mainEntityOfPage) ?? stringOrNull(article.url),
  }
}

/** A title fallback for a page without usable structured data. */
export function fallbackTitle(tree) {
  const heading = findFirst(tree, node => localName(node.name) === 'h1')
  const headingText = heading ? collapse(textOf(heading)) : ''
  if (headingText) return headingText
  const title = findFirst(tree, node => localName(node.name) === 'title')
  const titleText = title ? collapse(textOf(title)) : ''
  return titleText.split(/\s+[\\|—–-]\s+/)[0].trim()
}

/** `<time datetime>` as a date, used when `ld+json` has no publication date. */
export function timeDate(tree) {
  const time = findFirst(tree, node => localName(node.name) === 'time' && Boolean(attr(node, 'datetime')))
  return time ? dateOnly(attr(time, 'datetime')) : null
}

function inlineText(node) {
  if (typeof node === 'string') return node
  if (!isElement(node)) return ''
  const tag = localName(node.name)
  if (SKIP_TAGS.has(tag) || hasAnyClass(node, SKIP_CLASSES)) return ''
  if (tag === 'br') return ' '
  if (tag === 'img') {
    const alt = attr(node, 'alt')
    return alt ? ` ${alt} ` : ''
  }
  if (tag === 'math') {
    const alttext = attr(node, 'alttext')
    return alttext ? ` $${alttext}$ ` : ` ${textOf(node)} `
  }
  return node.children.map(inlineText).join('')
}

function cleanCaption(value) {
  return collapse(value).replace(/^(?:Figure|Fig\.|Table)\s*\d+[:.]\s*/i, '')
}

function resolveImage(src, baseUrl) {
  const raw = stringOrNull(src)
  if (!raw || raw.startsWith('data:')) return null
  try {
    return new URL(raw, baseUrl || undefined).toString()
  } catch {
    return raw
  }
}

function pushCode(node, blocks) {
  const code = textOf(node).replace(/\r\n?/g, '\n').replace(/\s+$/, '')
  if (!code.trim()) return
  let language = null
  for (const candidate of [node, ...findAll(node, child => Boolean(attr(child, 'class')))]) {
    const match = /(?:^|\s)language-([A-Za-z0-9_+#.-]+)/.exec(attr(candidate, 'class') ?? '')
    if (match) {
      language = match[1].toLowerCase()
      break
    }
  }
  blocks.push({ type: 'code', code, ...(language ? { language } : {}) })
}

/**
 * Turn an article container into ordered reader blocks.
 *
 * The page's own `<h1>` is skipped when it repeats the metadata title, so the
 * reader's header is not followed by the same words again.
 */
export function extractBlogBlocks(root, {
  maxBlocks = 400,
  title = '',
  dedupeImages = false,
  baseUrl = null,
  // OpenAI's page is the same shape but keeps its own rules: the h1 is item
  // metadata (never a body block), headings go to h6 and only `<p>` is prose.
  skipH1 = false,
  headingLevels = 4,
  paragraphTags = ['p', 'blockquote', 'li'],
  codeBlockClass = true,
} = {}) {
  const blocks = []
  const seenImages = new Set()
  const titleKey = collapse(title).toLowerCase()
  const headingPattern = new RegExp(`^h[1-${headingLevels}]$`)

  const pushHeading = (node) => {
    const text = collapse(inlineText(node))
    if (!text) return
    const level = Number(localName(node.name).slice(1)) || 2
    if (level === 1 && (skipH1 || text.toLowerCase() === titleKey)) return
    blocks.push({ type: 'heading', level, original: text })
  }

  const pushParagraph = (node) => {
    const text = collapse(inlineText(node))
    if (text.length < 2) return
    blocks.push({ type: 'paragraph', original: text })
  }

  const pushFigure = (node) => {
    const captionNode = findFirst(node, child => localName(child.name) === 'figcaption'
      || hasClass(child, 'caption') || hasClass(child, 'figure-caption'))
    const caption = captionNode ? cleanCaption(textOf(captionNode)) : ''
    const imageNode = findFirst(node, child => localName(child.name) === 'img' && Boolean(attr(child, 'src')))
    const image = imageNode ? resolveImage(attr(imageNode, 'src'), baseUrl) : null
    if (dedupeImages && image) {
      if (seenImages.has(image)) return
      seenImages.add(image)
    }
    if (!caption && !image) return
    blocks.push({
      type: 'figure',
      image,
      ...(caption ? { caption: { original: caption } } : {}),
    })
  }

  const walk = (node) => {
    if (blocks.length >= maxBlocks) return
    if (!isElement(node)) return
    const tag = localName(node.name)
    if (SKIP_TAGS.has(tag) || hasAnyClass(node, SKIP_CLASSES)) return

    if (tag === 'pre' || (codeBlockClass && hasClass(node, 'code-block'))) {
      pushCode(node, blocks)
      return
    }
    if (tag === 'figure') {
      pushFigure(node, blocks)
      return
    }
    if (headingPattern.test(tag)) {
      pushHeading(node)
      return
    }
    if (paragraphTags.includes(tag)) {
      pushParagraph(node)
      return
    }

    for (const child of node.children) walk(child)
  }

  walk(root)
  return blocks
}

/** Number of blocks that carry prose, used to reject an empty extraction. */
export function countTextBlocks(blocks) {
  return blocks.filter(block => block.type === 'paragraph' || block.type === 'heading').length
}
