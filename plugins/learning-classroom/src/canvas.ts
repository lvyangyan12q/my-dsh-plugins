/**
 * Pure JSON Canvas 1.0 reading plus the knowledge-relation vocabulary of the
 * classroom's 脉络 view. No filesystem or React imports live here: the same
 * module is unit tested directly and bundled into the browser panel.
 *
 * The reader is intentionally strict about structure — an invalid canvas must
 * never render half a graph — while tolerating the extra fields Obsidian or
 * future JSON Canvas versions may add.
 */
export const canvasFileName = '脉络.canvas'
/** Same bound as a lecture read: a huge canvas must not stall the panel. */
export const canvasReadLimit = 2 * 1024 * 1024
export const canvasNodeLimit = 2000
export const canvasEdgeLimit = 5000
export const canvasCoordinateLimit = 1_000_000
export const canvasSizeLimit = 100_000

export type CanvasNodeType = 'text' | 'file' | 'link' | 'group'

/** Relation semantics asked for by the classroom: 先修 / 组成 / 应用. */
export type CanvasRelation = 'prerequisite' | 'composition' | 'application' | 'related'

export type CanvasSide = 'top' | 'right' | 'bottom' | 'left'
export type CanvasEnd = 'none' | 'arrow'

export interface ParsedCanvasNode {
  id: string
  type: CanvasNodeType
  x: number
  y: number
  width: number
  height: number
  color: string | null
  text: string | null
  file: string | null
  url: string | null
  label: string | null
}

export interface ParsedCanvasEdge {
  id: string
  fromNode: string
  toNode: string
  label: string | null
  relation: CanvasRelation
  fromEnd: CanvasEnd
  toEnd: CanvasEnd
  fromSide: CanvasSide | null
  toSide: CanvasSide | null
  color: string | null
  /** A relation from a concept to itself. It is legal JSON Canvas but never a prerequisite. */
  selfLoop: boolean
}

export interface ParsedCanvas {
  nodes: ParsedCanvasNode[]
  edges: ParsedCanvasEdge[]
  /** Bounding box of every node, in canvas coordinates. */
  width: number
  height: number
}

/** Structural failure that makes the whole canvas unreadable. */
export class CanvasFormatError extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'CanvasFormatError'
  }
}

const nodeTypes: ReadonlySet<string> = new Set(['text', 'file', 'link', 'group'])
const sides: ReadonlySet<string> = new Set(['top', 'right', 'bottom', 'left'])
const ends: ReadonlySet<string> = new Set(['none', 'arrow'])

function fail(reason: string): never {
  throw new CanvasFormatError(reason)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') fail(`${label} 必须是字符串。`)
  if (value.trim() === '') fail(`${label} 不能为空。`)
  if (value.length > max) fail(`${label} 过长。`)
  return value
}

function optionalString(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') fail(`${label} 必须是字符串。`)
  if (value.length > max) fail(`${label} 过长。`)
  return value
}

function optionalEnum<T extends string>(value: unknown, label: string, allowed: ReadonlySet<string>): T | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !allowed.has(value)) {
    fail(`${label} 只能是 ${[...allowed].join('、')}。`)
  }
  return value as T
}

function coordinate(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} 必须是有限数字。`)
  if (Math.abs(value) > canvasCoordinateLimit) fail(`${label} 超出可渲染范围。`)
  return value
}

function extent(value: unknown, label: string): number {
  const size = coordinate(value, label)
  if (size <= 0) fail(`${label} 必须大于 0。`)
  if (size > canvasSizeLimit) fail(`${label} 超出可渲染范围。`)
  return size
}

function parseNode(raw: unknown, index: number): ParsedCanvasNode {
  if (!isRecord(raw)) fail(`第 ${index + 1} 个节点不是对象。`)
  const id = requiredString(raw.id, `第 ${index + 1} 个节点的 id`, 200)
  const where = `节点「${id}」`
  if (typeof raw.type !== 'string' || !nodeTypes.has(raw.type)) {
    fail(`${where} 的类型未知：${String(raw.type)}。`)
  }
  const type = raw.type as CanvasNodeType
  const x = coordinate(raw.x, `${where} 的 x`)
  const y = coordinate(raw.y, `${where} 的 y`)
  const width = extent(raw.width, `${where} 的 width`)
  const height = extent(raw.height, `${where} 的 height`)
  const color = optionalString(raw.color, `${where} 的 color`, 32)

  let text: string | null = null
  let file: string | null = null
  let url: string | null = null
  let label: string | null = null
  switch (type) {
    case 'text':
      if (typeof raw.text !== 'string') fail(`${where} 是文本节点，缺少 text。`)
      text = raw.text
      break
    case 'file':
      file = requiredString(raw.file, `${where} 的文件路径`, 1024)
      break
    case 'link':
      url = requiredString(raw.url, `${where} 的链接`, 2048)
      break
    case 'group':
      label = optionalString(raw.label, `${where} 的 label`, 200)
      break
  }

  return { id, type, x, y, width, height, color, text, file, url, label }
}

function parseEdge(raw: unknown, index: number, nodeIds: ReadonlySet<string>): ParsedCanvasEdge {
  if (!isRecord(raw)) fail(`第 ${index + 1} 条边不是对象。`)
  const id = requiredString(raw.id, `第 ${index + 1} 条边的 id`, 200)
  const where = `边「${id}」`
  const fromNode = requiredString(raw.fromNode, `${where} 的 fromNode`, 200)
  const toNode = requiredString(raw.toNode, `${where} 的 toNode`, 200)
  if (!nodeIds.has(fromNode)) fail(`${where} 引用了不存在的节点「${fromNode}」。`)
  if (!nodeIds.has(toNode)) fail(`${where} 引用了不存在的节点「${toNode}」。`)
  const label = optionalString(raw.label, `${where} 的 label`, 500)
  return {
    id,
    fromNode,
    toNode,
    label,
    relation: classifyRelation(label),
    fromEnd: optionalEnum<CanvasEnd>(raw.fromEnd, `${where} 的 fromEnd`, ends) ?? 'none',
    toEnd: optionalEnum<CanvasEnd>(raw.toEnd, `${where} 的 toEnd`, ends) ?? 'none',
    fromSide: optionalEnum<CanvasSide>(raw.fromSide, `${where} 的 fromSide`, sides),
    toSide: optionalEnum<CanvasSide>(raw.toSide, `${where} 的 toSide`, sides),
    color: optionalString(raw.color, `${where} 的 color`, 32),
    selfLoop: fromNode === toNode,
  }
}

/** Parse and validate a complete `脉络.canvas` file. Throws on any illegal structure. */
export function parseCanvasDocument(source: string): ParsedCanvas {
  if (typeof source !== 'string' || source.trim() === '') {
    fail('画布文件是空的。')
  }
  let input: unknown
  try {
    input = JSON.parse(source)
  } catch (error) {
    fail(`不是合法 JSON：${error instanceof Error ? error.message : '无法解析'}`)
  }
  if (!isRecord(input)) fail('顶层必须是 JSON 对象。')
  if (!Array.isArray(input.nodes)) fail('缺少 nodes 数组。')
  if (input.nodes.length > canvasNodeLimit) fail(`节点过多（上限 ${canvasNodeLimit}）。`)
  const rawEdges = input.edges ?? []
  if (!Array.isArray(rawEdges)) fail('edges 必须是数组。')
  if (rawEdges.length > canvasEdgeLimit) fail(`边过多（上限 ${canvasEdgeLimit}）。`)

  const nodes: ParsedCanvasNode[] = []
  const nodeIds = new Set<string>()
  input.nodes.forEach((raw, index) => {
    const node = parseNode(raw, index)
    if (nodeIds.has(node.id)) fail(`节点 id 重复：${node.id}。`)
    nodeIds.add(node.id)
    nodes.push(node)
  })

  const edges: ParsedCanvasEdge[] = []
  const edgeIds = new Set<string>()
  rawEdges.forEach((raw, index) => {
    const edge = parseEdge(raw, index, nodeIds)
    if (edgeIds.has(edge.id)) fail(`边 id 重复：${edge.id}。`)
    edgeIds.add(edge.id)
    edges.push(edge)
  })

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.width)
    maxY = Math.max(maxY, node.y + node.height)
  }

  return {
    nodes,
    edges,
    width: nodes.length === 0 ? 0 : maxX - minX,
    height: nodes.length === 0 ? 0 : maxY - minY,
  }
}

const relationKeywords: ReadonlyArray<[CanvasRelation, RegExp]> = [
  ['prerequisite', /^(?:先修|前置|prereq|prerequisite|requires)/i],
  ['composition', /^(?:组成|构成|包含|compose|composition|contains|part[- ]of)/i],
  ['application', /^(?:应用|apply|applies|application)/i],
]

/**
 * Map a free-form edge label onto the classroom's relation vocabulary. Unknown
 * labels stay `related` (still rendered and still directional); they are never
 * silently relabelled as a prerequisite.
 */
export function classifyRelation(label: string | null | undefined): CanvasRelation {
  const text = typeof label === 'string' ? label.trim() : ''
  if (text === '') return 'related'
  for (const [relation, pattern] of relationKeywords) {
    if (pattern.test(text)) return relation
  }
  return 'related'
}

const relationNames: Record<CanvasRelation, string> = {
  prerequisite: '先修',
  composition: '组成',
  application: '应用',
  related: '相关',
}

export function relationName(relation: CanvasRelation): string {
  return relationNames[relation]
}

/** One canvas file node resolved to a space-relative lecture or note target. */
export interface CanvasFileTarget {
  kind: 'lecture' | 'note'
  /** Space-relative path with nested folders preserved, e.g. `讲义/第一章/01.md`. */
  path: string
  /** Real fragment to reveal after opening; both null when the node has none. */
  heading: string | null
  blockId: string | null
}

export interface CanvasTargetOptions {
  /** Existing course files the learner explicitly linked, space-relative. */
  linkedLectures?: readonly string[]
}

/**
 * Split a canvas file reference into its path and optional fragment. Obsidian
 * writes the file field vault-relative, so both the vault form
 * (`概率论/讲义/第一章/01.md`) and the space form (`讲义/第一章/01.md`) are
 * accepted. A fragment (`#标题`, `#^块id`) is kept for real anchor navigation;
 * the Host checks that the heading/block actually exists before calling it ok.
 */
function canvasFileRef(file: string): { path: string; heading: string | null; blockId: string | null } | null {
  if (typeof file !== 'string') return null
  const hash = file.indexOf('#')
  const rawPath = (hash === -1 ? file : file.slice(0, hash)).trim()
  const rawFragment = hash === -1 ? '' : file.slice(hash + 1).trim()
  if (rawPath === '') return null
  if (hash !== -1 && rawFragment === '') return null
  if (rawPath.includes('|') || rawPath.includes('\u0000')) return null

  const normalized = rawPath.replaceAll('\\', '/').replace(/^\.\/+/, '')
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null
  const segments = normalized.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) return null
  if (segments.some(segment => segment.startsWith('.'))) return null

  let heading: string | null = null
  let blockId: string | null = null
  if (rawFragment !== '') {
    if (rawFragment.startsWith('^')) {
      blockId = rawFragment.slice(1).trim()
      if (blockId === '' || blockId.includes('#')) return null
    } else {
      heading = rawFragment
      if (heading.includes('#')) return null
    }
  }
  return { path: segments.join('/'), heading, blockId }
}

/**
 * Classify a canvas file reference as an openable classroom target. The caller
 * must already have proven the reference is a vault-relative path; this function
 * only decides whether it points at this space's `讲义/` (including nested
 * chapters), one of its explicitly linked course files, or a nested `笔记/` file.
 * Anything else returns null so the Host can explain why it cannot be opened.
 */
export function classifyCanvasTarget(
  file: string,
  spaceDirectory: string,
  options: CanvasTargetOptions = {},
): CanvasFileTarget | null {
  const ref = canvasFileRef(file)
  if (ref === null) return null
  const prefix = `${spaceDirectory.replaceAll('\\', '/')}/`
  const relative = ref.path.startsWith(prefix) ? ref.path.slice(prefix.length) : ref.path
  const segments = relative.split('/')
  if (segments.length < 2) return null

  const fileName = segments[segments.length - 1]
  if (segments[0] === '讲义' && /\.(md|html)$/i.test(fileName)) {
    return { kind: 'lecture', path: relative, heading: ref.heading, blockId: ref.blockId }
  }
  if (segments[0] === '笔记' && /\.md$/i.test(fileName)) {
    return { kind: 'note', path: relative, heading: ref.heading, blockId: ref.blockId }
  }
  if ((options.linkedLectures ?? []).includes(relative) && /\.(md|html)$/i.test(fileName)) {
    return { kind: 'lecture', path: relative, heading: ref.heading, blockId: ref.blockId }
  }
  return null
}

/** External links in a canvas may only become anchors for safe schemes. */
export function isSafeCanvasUrl(url: string): boolean {
  if (typeof url !== 'string') return false
  const candidate = url.trim()
  if (candidate === '' || /[\u0000-\u0020]/.test(candidate)) return false
  if (candidate.startsWith('//')) return false
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(candidate)
  if (scheme === null) return false
  return ['http', 'https', 'mailto'].includes(scheme[1].toLowerCase())
}
