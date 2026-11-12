import { parseFrontmatter } from './lectures.ts'
import { parseWikilink, wikilinkDisplay } from './links.ts'

/**
 * A deliberately small Markdown reader: it produces a typed block model and the
 * panel renders that model with React elements. No HTML string ever crosses into
 * the DOM, and anything this reader does not understand stays literal text.
 */
interface BlockMeta {
  /** Real Obsidian block id (`^id`) attached to this block, never code samples. */
  blockId?: string
}

export type Block = (
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[]; itemBlockIds?: Array<string | undefined> }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'code'; lang: string; code: string }
  | { type: 'quote'; text: string }
  | { type: 'rule' }
) & BlockMeta

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'link'; text: string; href: string }
  /** Obsidian wikilink; `target` is the inner text and `text` the display label. */
  | { type: 'wikilink'; target: string; text: string }

const fencePattern = /^(`{3,}|~{3,})\s*([^`]*)$/
const headingPattern = /^(#{1,6})\s+(.*)$/
const rulePattern = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/
const listPattern = /^(\s*)(?:([-*+])|(\d{1,9})[.)])\s+(.+)$/
const quotePattern = /^\s*>\s?(.*)$/
const tableDelimiter = /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)*\|?\s*$/
const standaloneBlockIdPattern = /^\s*\^([A-Za-z0-9-]+)\s*$/
const trailingBlockIdPattern = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/

/** A line that is only `^id`: Obsidian attaches it to the preceding block. */
function standaloneBlockId(line: string): string | null {
  const match = standaloneBlockIdPattern.exec(line)
  return match === null ? null : match[1]
}

/** Split a real `... ^id` block boundary from the visible block text. */
function splitTrailingBlockId(line: string): { text: string; blockId: string } | null {
  const match = trailingBlockIdPattern.exec(line)
  if (match === null) return null
  return { text: line.slice(0, match.index).trimEnd(), blockId: match[1] }
}

function tableCells(line: string): string[] {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|')) text = text.slice(0, -1)
  return text.split('|').map(cell => cell.trim())
}

function wasTable(lines: string[], index: number): boolean {
  if (!lines[index].includes('|')) return false
  const next = lines[index + 1]
  return next !== undefined && next.includes('|') && tableDelimiter.test(next)
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index]
  return fencePattern.test(line)
    || headingPattern.test(line)
    || rulePattern.test(line)
    || quotePattern.test(line)
    || listPattern.test(line)
    || wasTable(lines, index)
}

/** Convert Markdown source into blocks; frontmatter is never part of the body. */
export function parseMarkdown(source: string): Block[] {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = parseFrontmatter(normalized).body.split('\n')
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '') {
      index += 1
      continue
    }

    const standalone = standaloneBlockId(line)
    if (standalone !== null) {
      const previous = blocks.at(-1)
      // A standalone id belongs to the preceding block; code samples never
      // become anchors, so an id after code is left as literal text.
      if (previous !== undefined && previous.type !== 'code' && previous.blockId === undefined) {
        previous.blockId = standalone
      } else {
        blocks.push({ type: 'paragraph', text: line.trim() })
      }
      index += 1
      continue
    }

    const fence = fencePattern.exec(line)
    if (fence !== null) {
      const marker = fence[1][0]
      const body: string[] = []
      index += 1
      while (index < lines.length && !new RegExp(`^${marker}{${fence[1].length},}\\s*$`).test(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      if (index < lines.length) {
        index += 1 // closing fence
      } else {
        // An unclosed fence is a degraded but readable code block, not a blank page.
        while (body.length > 0) {
          const last = body.at(-1)
          if (last === undefined || last.trim() !== '') break
          body.pop()
        }
      }
      blocks.push({ type: 'code', lang: fence[2].trim(), code: body.join('\n') })
      continue
    }

    const heading = headingPattern.exec(line)
    if (heading !== null) {
      const raw = heading[2].trim()
      const trailing = splitTrailingBlockId(raw)
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: trailing?.text ?? raw,
        ...(trailing === null ? {} : { blockId: trailing.blockId }),
      })
      index += 1
      continue
    }

    if (rulePattern.test(line)) {
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }

    if (quotePattern.test(line)) {
      const quoted: string[] = []
      while (index < lines.length) {
        const match = quotePattern.exec(lines[index])
        if (match === null) break
        quoted.push(match[1].trim())
        index += 1
      }
      let blockId: string | undefined
      const last = quoted.at(-1)
      if (last !== undefined) {
        const trailing = splitTrailingBlockId(last)
        if (trailing !== null) {
          quoted[quoted.length - 1] = trailing.text
          blockId = trailing.blockId
        }
      }
      blocks.push({
        type: 'quote',
        text: quoted.filter(Boolean).join(' '),
        ...(blockId === undefined ? {} : { blockId }),
      })
      continue
    }

    const list = listPattern.exec(line)
    if (list !== null) {
      const ordered = list[3] !== undefined
      const items: string[] = []
      const itemBlockIds: Array<string | undefined> = []
      while (index < lines.length) {
        const match = listPattern.exec(lines[index])
        if (match === null) break
        if ((match[3] !== undefined) !== ordered) break
        const raw = match[4].trim()
        const trailing = splitTrailingBlockId(raw)
        // The block id belongs to this list item, never to the whole list.
        items.push(trailing === null ? raw : trailing.text)
        itemBlockIds.push(trailing?.blockId)
        index += 1
      }
      blocks.push({
        type: 'list',
        ordered,
        items,
        ...(itemBlockIds.some(id => id !== undefined) ? { itemBlockIds } : {}),
      })
      continue
    }

    if (wasTable(lines, index)) {
      const header = tableCells(line)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].trim() !== '' && lines[index].includes('|')) {
        rows.push(tableCells(lines[index]))
        index += 1
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() !== ''
      && (paragraph.length === 0 || !startsBlock(lines, index))) {
      if (standaloneBlockId(lines[index]) !== null) break
      paragraph.push(lines[index].trim())
      index += 1
    }
    let paragraphBlockId: string | undefined
    const lastLine = paragraph.at(-1)
    if (lastLine !== undefined) {
      const trailing = splitTrailingBlockId(lastLine)
      if (trailing !== null) {
        paragraph[paragraph.length - 1] = trailing.text
        paragraphBlockId = trailing.blockId
      }
    }
    blocks.push({
      type: 'paragraph',
      text: paragraph.join(' ').trim(),
      ...(paragraphBlockId === undefined ? {} : { blockId: paragraphBlockId }),
    })
  }

  return blocks
}

function safeHref(href: string): boolean {
  if (href === '' || /[\u0000-\u0020]/.test(href)) return false
  if (href.startsWith('//')) return false
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(href)
  if (scheme === null) return true
  return ['http', 'https', 'mailto'].includes(scheme[1].toLowerCase())
}

function pushText(tokens: InlineToken[], text: string): void {
  if (text === '') return
  const last = tokens.at(-1)
  if (last !== undefined && last.type === 'text') last.text += text
  else tokens.push({ type: 'text', text })
}

const linkPattern = /^\[([^\]\n]*)\]\(([^()\s]*)\)/

/** Inline formatting; only http(s)/mailto/relative links become anchors. */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let index = 0
  while (index < text.length) {
    const rest = text.slice(index)

    if (text[index] === '`') {
      const end = text.indexOf('`', index + 1)
      if (end !== -1) {
        tokens.push({ type: 'code', text: text.slice(index + 1, end) })
        index = end + 1
        continue
      }
    }

    if (rest.startsWith('**')) {
      const end = text.indexOf('**', index + 2)
      if (end !== -1 && end > index + 2) {
        tokens.push({ type: 'strong', text: text.slice(index + 2, end) })
        index = end + 2
        continue
      }
    }

    if (text[index] === '*') {
      const end = text.indexOf('*', index + 1)
      if (end !== -1 && end > index + 1) {
        tokens.push({ type: 'em', text: text.slice(index + 1, end) })
        index = end + 1
        continue
      }
    }

    const link = linkPattern.exec(rest)
    if (link !== null && safeHref(link[2])) {
      tokens.push({ type: 'link', text: link[1], href: link[2] })
      index += link[0].length
      continue
    }

    // Obsidian wikilink: only a syntactically valid link becomes a token, so a
    // half-typed `[[未闭合` stays readable literal text.
    if (rest.startsWith('[[')) {
      const end = text.indexOf(']]', index + 2)
      if (end !== -1) {
        const parsed = parseWikilink(text.slice(index + 2, end))
        if (parsed.ok) {
          tokens.push({ type: 'wikilink', target: parsed.parts.raw, text: wikilinkDisplay(parsed.parts) })
          index = end + 2
          continue
        }
      }
    }

    pushText(tokens, text[index])
    index += 1
  }
  return tokens
}
