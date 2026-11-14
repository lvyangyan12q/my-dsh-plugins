/**
 * Pure lecture-directory logic. The course directory is derived from the files in
 * the space's `讲义/` folder: `.md` lectures and `.html` experiments, ordered by
 * file name unless frontmatter overrides `order`/`title`.
 */
export const lectureFolder = '讲义'

export type LectureKind = 'markdown' | 'experiment'

/** Where one course entry came from: the `讲义/` tree or an explicit link to an existing file. */
export type LectureSource = 'lectures' | 'linked'

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

function decodeHtmlText(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .trim()
}

function htmlMeta(head: string, name: string): string | undefined {
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes: Record<string, string> = {}
    for (const match of tag.matchAll(/([a-zA-Z][a-zA-Z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attributes[match[1].toLowerCase()] = decodeHtmlText(match[2] ?? match[3] ?? '')
    }
    if (attributes.name === name && attributes.content !== undefined) return attributes.content
  }
  return undefined
}

function htmlLectureMeta(head: string): Omit<LectureMeta, 'title'> & { title: string | null } {
  const declaredTitle = htmlMeta(head, 'learning-classroom:title')
  const documentTitle = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]
  const title = (declaredTitle ?? (documentTitle === undefined ? '' : decodeHtmlText(documentTitle))).trim()
  return {
    title: title === '' ? null : title,
    order: parseOrder(htmlMeta(head, 'learning-classroom:order')),
  }
}

/**
 * Derive display title and order for one lecture file from its name and the
 * head of its content. Generated experiments carry a `<title>` and optional
 * classroom order meta; Markdown uses frontmatter. Returns null for files that
 * are not lectures, so callers never have to guess an extension.
 */
export function readLectureMeta(fileName: string, head: string): LectureMeta | null {
  const kind = lectureFileKind(fileName)
  if (kind === null) return null
  if (kind === 'experiment') {
    // Hand-written HTML may still carry the older frontmatter convention; a
    // generated experiment uses a real <title> and classroom meta instead.
    const frontmatter = parseFrontmatter(head)
    if (frontmatter.present) {
      const title = (frontmatter.attributes.title ?? '').trim()
      return {
        title: title === '' ? lectureBaseName(fileName) : title,
        order: parseOrder(frontmatter.attributes.order),
      }
    }
    const html = htmlLectureMeta(head)
    return { title: html.title ?? lectureBaseName(fileName), order: html.order }
  }
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

/** One course entry after the folder rules are applied. */
export interface CourseLectureOrdering extends LectureOrdering {
  /** Chapter label derived from the file's folder; '' means the topic root. */
  chapter: string
  source: LectureSource
}

/**
 * Derive a chapter label from a space-relative path. `讲义/第一章/01.md` is
 * chapter `第一章`; a linked `资料/概率/基础.md` belongs to `资料/概率`; files
 * directly at a source root have no chapter. The rules are purely lexical, so
 * the same files always produce the same directory.
 */
export function lectureChapterOf(relativePath: string, source: LectureSource): string {
  const segments = relativePath.replaceAll('\\', '/').split('/').filter(segment => segment !== '' && segment !== '.')
  const parent = segments.slice(0, -1)
  // `讲义` is the course root, not a chapter; linked files keep their real folder.
  return source === 'lectures' ? parent.slice(1).join('/') : parent.join('/')
}

/**
 * Chapter first (empty chapter is the topic root and sorts first), then the
 * existing order/frontmatter rule inside the chapter. An explicit `order` never
 * jumps a file into another chapter: folders carry the course structure.
 */
export function compareCourseLectures(a: CourseLectureOrdering, b: CourseLectureOrdering): number {
  const left = a.chapter.normalize('NFC')
  const right = b.chapter.normalize('NFC')
  if (left !== right) return left < right ? -1 : 1
  return compareLectures(a, b)
}

export function sortCourseLectures<T extends CourseLectureOrdering>(entries: readonly T[]): T[] {
  return [...entries].sort(compareCourseLectures)
}

export interface CourseChapter<T> {
  chapter: string
  entries: T[]
}

/** Group already-sorted entries into chapters without reordering anything. */
export function groupCourseLectures<T extends CourseLectureOrdering>(entries: readonly T[]): CourseChapter<T>[] {
  const groups: CourseChapter<T>[] = []
  for (const entry of entries) {
    const last = groups[groups.length - 1]
    if (last !== undefined && last.chapter === entry.chapter) last.entries.push(entry)
    else groups.push({ chapter: entry.chapter, entries: [entry] })
  }
  return groups
}

/**
 * Hidden names (dot files/folders) are never course content. Keeping this rule
 * in one place means the directory, the association picker and the reader all
 * agree on what they refuse.
 */
export function isHiddenRelativePath(relativePath: string): boolean {
  return relativePath.replaceAll('\\', '/').split('/').some(segment => segment.startsWith('.') && segment !== '.' && segment !== '')
}

/**
 * Resolve a relative Markdown link against the lecture that contains it. Only
 * targets under the shared `讲义/` tree are returned; external URLs, absolute
 * paths, note paths and traversal above the course root stay untouched. The
 * caller still has to confirm the target is an existing course entry.
 */
export function resolveLectureHref(basePath: string, href: string): string | null {
  if (typeof basePath !== 'string' || typeof href !== 'string') return null
  const pathPart = href.split('#', 1)[0]?.split('?', 1)[0]?.trim() ?? ''
  if (pathPart === '') return null
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(pathPart)) return null
  if (pathPart.startsWith('/') || pathPart.startsWith('//') || pathPart.startsWith('\\')) return null
  const base = basePath.replaceAll('\\', '/').split('/')
  if (base.length < 2 || base[0] !== lectureFolder) return null
  // Accept both a link relative to the current chapter and a course-root path
  // such as `讲义/03-实验.html`; generated lectures commonly use the latter.
  const link = pathPart.replaceAll('\\', '/')
  const segments = link.startsWith(`${lectureFolder}/`)
    ? link.split('/')
    : [...base.slice(0, -1), ...link.split('/')]
  const resolved: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (resolved.length === 0) return null
      resolved.pop()
      continue
    }
    if (segment.startsWith('.')) return null
    resolved.push(segment)
  }
  if (resolved.length < 2 || resolved[0] !== lectureFolder) return null
  if (lectureFileKind(resolved[resolved.length - 1] ?? '') === null) return null
  return resolved.join('/')
}
