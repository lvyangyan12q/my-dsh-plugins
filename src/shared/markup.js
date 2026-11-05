/**
 * Dependency-free markup parsing for the pipeline adapters.
 *
 * The pipeline reads two kinds of markup: Atom feeds (XML) and arXiv's
 * LaTeXML article HTML. Both are small, machine-generated documents, so this
 * module implements just enough of a tolerant tree parser to walk them:
 *
 * - elements, attributes (quoted or bare), self-closing and void tags;
 * - comments, doctype, processing instructions and CDATA;
 * - raw-text elements (`script`, `style`) so their contents never leak into
 *   extracted prose;
 * - entity decoding (`&amp;`, `&#x2014;`, …);
 * - a mismatched close tag closes the nearest matching ancestor instead of
 *   corrupting the tree, which keeps a stray tag from losing a whole article.
 *
 * This is deliberately not a full HTML5 tree builder: the adapters query it
 * with the class names and tag names they expect, and anything they do not
 * recognise is simply skipped.
 */

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
])

const RAW_TEXT_ELEMENTS = new Set(['script', 'style'])

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  times: '×',
  copy: '©',
}

/** Decode HTML/XML character references. */
export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : match
  })
}

/** Index of the `>` that ends the tag starting at `start`, honouring quotes. */
function findTagEnd(source, start) {
  let quote = ''
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '>') return index
  }
  return -1
}

function parseAttributes(source) {
  const attributes = {}
  if (!source) return attributes
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1].toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    attributes[name] = decodeEntities(value)
  }
  return attributes
}

/** Append text to the current node, merging adjacent text nodes. */
function appendText(node, text) {
  if (!text) return
  const children = node.children
  if (typeof children[children.length - 1] === 'string') {
    children[children.length - 1] += text
  } else {
    children.push(text)
  }
}

/**
 * Parse a markup document into a tree.
 *
 * Returns a `#document` root. A node is `{ name, attributes, children }` where
 * `children` mixes elements and decoded text strings.
 */
export function parseMarkup(source, { html = true } = {}) {
  const text = String(source ?? '')
  const root = { name: '#document', attributes: {}, children: [] }
  const stack = [root]
  let index = 0

  const current = () => stack[stack.length - 1]
  const pushText = (raw, { decode = true } = {}) => {
    appendText(current(), decode ? decodeEntities(raw) : raw)
  }

  while (index < text.length) {
    const open = text.indexOf('<', index)
    if (open === -1) {
      pushText(text.slice(index))
      break
    }
    if (open > index) pushText(text.slice(index, open))

    if (text.startsWith('<!--', open)) {
      const end = text.indexOf('-->', open + 4)
      index = end === -1 ? text.length : end + 3
      continue
    }
    if (text.startsWith('<![CDATA[', open)) {
      const end = text.indexOf(']]>', open + 9)
      pushText(text.slice(open + 9, end === -1 ? text.length : end), { decode: false })
      index = end === -1 ? text.length : end + 3
      continue
    }
    if (text[open + 1] === '!' || text[open + 1] === '?') {
      const end = text.indexOf('>', open + 2)
      index = end === -1 ? text.length : end + 1
      continue
    }

    const end = findTagEnd(text, open + 1)
    if (end === -1) {
      pushText(text.slice(open))
      break
    }
    const raw = text.slice(open + 1, end)
    index = end + 1

    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim().toLowerCase()
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth].name === name) {
          stack.length = depth
          break
        }
      }
      continue
    }

    const selfClosing = /\/\s*$/.test(raw)
    const body = selfClosing ? raw.replace(/\/\s*$/, '') : raw
    const separator = body.search(/\s/)
    const name = (separator === -1 ? body : body.slice(0, separator)).toLowerCase()
    if (!name) continue
    const node = {
      name,
      attributes: parseAttributes(separator === -1 ? '' : body.slice(separator)),
      children: [],
    }
    current().children.push(node)

    if (selfClosing || (html && VOID_ELEMENTS.has(name))) continue

    if (html && RAW_TEXT_ELEMENTS.has(name)) {
      const closing = text.toLowerCase().indexOf(`</${name}`, index)
      const rawBody = closing === -1 ? text.slice(index) : text.slice(index, closing)
      if (rawBody) node.children.push(decodeEntities(rawBody))
      if (closing === -1) {
        index = text.length
      } else {
        const closeEnd = text.indexOf('>', closing)
        index = closeEnd === -1 ? text.length : closeEnd + 1
      }
      continue
    }

    stack.push(node)
  }

  return root
}

export function isElement(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.name === 'string'
}

/** The element name without its namespace prefix (`arxiv:comment` → `comment`). */
export function localName(name) {
  const text = String(name ?? '')
  const colon = text.indexOf(':')
  return (colon === -1 ? text : text.slice(colon + 1)).toLowerCase()
}

export function attr(node, name) {
  if (!isElement(node)) return null
  const key = String(name).toLowerCase()
  if (Object.prototype.hasOwnProperty.call(node.attributes, key)) return node.attributes[key]
  for (const [attribute, value] of Object.entries(node.attributes)) {
    if (localName(attribute) === localName(key)) return value
  }
  return null
}

export function classesOf(node) {
  const value = attr(node, 'class')
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : []
}

export function hasClass(node, name) {
  return classesOf(node).includes(name)
}

export function hasAnyClass(node, names) {
  const classes = classesOf(node)
  return names.some(name => classes.includes(name))
}

/** Direct element children, optionally filtered by local tag name. */
export function childrenOf(node, name) {
  if (!isElement(node)) return []
  const elements = node.children.filter(isElement)
  if (name === undefined) return elements
  const wanted = localName(name)
  return elements.filter(child => localName(child.name) === wanted)
}

/** First matching element in document order (including `node`). */
export function findFirst(node, predicate) {
  if (!isElement(node)) return null
  if (predicate(node)) return node
  for (const child of node.children) {
    if (!isElement(child)) continue
    const found = findFirst(child, predicate)
    if (found) return found
  }
  return null
}

/** All matching elements in document order (including `node`). */
export function findAll(node, predicate, found = []) {
  if (!isElement(node)) return found
  if (predicate(node)) found.push(node)
  for (const child of node.children) {
    if (isElement(child)) findAll(child, predicate, found)
  }
  return found
}

/** Decoded text of a node, without whitespace normalization. */
export function textOf(node) {
  if (typeof node === 'string') return node
  if (!isElement(node)) return ''
  return node.children.map(textOf).join('')
}

/** Collapse runs of whitespace into one space and trim. */
export function collapse(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}
