/**
 * Pure lecture-directory logic. The course directory is derived from the files in
 * the space's `讲义/` folder: `.md` lectures and `.html` experiments, ordered by
 * file name unless frontmatter overrides `order`/`title`.
 */
export const lectureFolder = '讲义'

export type LectureKind = 'markdown' | 'experiment'

export interface LectureFrontmatter {
  present: boolean
  attributes: Record<string, string>
  body: string
}

export interface LectureMeta {
  title: string
  order: number | null
}

export interface LectureOrdering {
  fileName: string
  order: number | null
}

const opener = /^\uFEFF?---[ \t]*\r?\n/

/**
 * Parse a leading `---` frontmatter block. Anything unknown stays in the body:
 * an unterminated block is not frontmatter, so a stray `---` never swallows the
 * lecture text.
 */
export function parseFrontmatter(source: string): LectureFrontmatter {
  const match = opener.exec(source)
  if (match === null) return { present: false, attributes: {}, body: source }
  const attributes: Record<string, string> = {}
  let index = match[0].length
  while (index <= source.length) {
    const lineEnd = source.indexOf('\n', index)
    const raw = lineEnd === -1 ? source.slice(index) : source.slice(index, lineEnd)
    const line = raw.replace(/\r$/, '')
    const trimmed = line.trim()
    if (trimmed === '---' || trimmed === '...') {
      return { present: true, attributes, body: lineEnd === -1 ? '' : source.slice(lineEnd + 1) }
    }
    if (trimmed !== '' && !trimmed.startsWith('#')) {
      const pair = /^([A-Za-z0-9_.-]+)[ \t]*:[ \t]*(.*)$/.exec(line)
      if (pair !== null) attributes[pair[1]] = unquote(pair[2].trim())
    }
    if (lineEnd === -1) break
    index = lineEnd + 1
  }
  return { present: false, attributes: {}, body: source }
}

function unquote(value: string): string {
  const quoted = /^(['"])([\s\S]*)\1$/.exec(value)
  return quoted === null ? value : quoted[2]
}

export function lectureFileKind(fileName: string): LectureKind | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.html')) return 'experiment'
  return null
}

/** File name without its lecture extension — the display title fallback. */
export function lectureBaseName(fileName: string): string {
  return fileName.replace(/\.(md|html)$/i, '')
}

function parseOrder(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Derive display title and order for one lecture file from its name and the
 * head of its content. Returns null for files that are not lectures, so callers
 * never have to guess an extension.
 */
export function readLectureMeta(fileName: string, head: string): LectureMeta | null {
  if (lectureFileKind(fileName) === null) return null
  const frontmatter = parseFrontmatter(head)
  const title = (frontmatter.attributes.title ?? '').trim()
  return {
    title: title === '' ? lectureBaseName(fileName) : title,
    order: parseOrder(frontmatter.attributes.order),
  }
}

function fileNameKey(fileName: string): string {
  return fileName.normalize('NFC')
}

/** Explicit `order` first, ascending; files without order fall back to file name. */
export function compareLectures(a: LectureOrdering, b: LectureOrdering): number {
  if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order
  if (a.order !== null && b.order === null) return -1
  if (a.order === null && b.order !== null) return 1
  const left = fileNameKey(a.fileName)
  const right = fileNameKey(b.fileName)
  return left < right ? -1 : left > right ? 1 : 0
}

export function sortLectures<T extends LectureOrdering>(entries: readonly T[]): T[] {
  return [...entries].sort(compareLectures)
}
