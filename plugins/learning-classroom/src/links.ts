/**
 * Obsidian-compatible wikilink syntax, shared by the Host resolver and the
 * browser. This module is pure: it never touches the filesystem, so the same
 * parsing rules decide what the reader typed and what the Host later resolves.
 *
 * Supported forms:
 *   [[文件]]
 *   [[文件|显示别名]]
 *   [[文件#标题]]
 *   [[文件#^已有块id]]
 *   [[文件#标题|显示别名]]
 *   [[#本文件标题]] / [[#^本文件块]]
 */
export interface WikilinkParts {
  /** The inner text exactly as written, without the `[[`/`]]` wrapper. */
  raw: string
  /** File part, still vault-relative or a bare name; '' for a same-file link. */
  file: string
  /** Heading text when the link carries `#标题`; null otherwise. */
  heading: string | null
  /** Existing block id when the link carries `#^id`; null otherwise. */
  blockId: string | null
  /** Display text after `|`; null when the link has none. */
  alias: string | null
}

export type WikilinkParse =
  | { ok: true; parts: WikilinkParts }
  | { ok: false; message: string }

function invalid(message: string): WikilinkParse {
  return { ok: false, message }
}

const unsafeTarget = /[\u0000\n\r]/

/**
 * Parse one link the reader typed or pasted. A malformed link is refused rather
 * than silently rewritten, so the UI can explain what is wrong.
 */
export function parseWikilink(input: string): WikilinkParse {
  if (typeof input !== 'string') return invalid('双链必须是文本。')
  let inner = input.trim()
  if (inner === '') return invalid('双链目标不能为空。')
  if (inner.startsWith('[[')) {
    if (!inner.endsWith(']]')) return invalid('双链缺少结尾的 ]]；没有生成链接。')
    inner = inner.slice(2, -2)
  }
  if (inner.includes('[[') || inner.includes(']]')) {
    return invalid('双链只能包含一层 [[...]]，不能嵌套或夹带多余方括号。')
  }
  if (inner === '' || unsafeTarget.test(inner)) {
    return invalid('双链目标不能为空，也不能包含换行。')
  }

  const bar = inner.indexOf('|')
  const targetText = (bar === -1 ? inner : inner.slice(0, bar)).trim()
  const aliasText = bar === -1 ? '' : inner.slice(bar + 1).trim()
  if (targetText === '') return invalid('双链缺少文件或标题。')

  const hash = targetText.indexOf('#')
  const file = (hash === -1 ? targetText : targetText.slice(0, hash)).trim()
  const fragment = hash === -1 ? '' : targetText.slice(hash + 1).trim()

  let heading: string | null = null
  let blockId: string | null = null
  if (fragment !== '') {
    if (fragment.startsWith('^')) {
      blockId = fragment.slice(1).trim()
      if (blockId === '') return invalid('块引用缺少块 id：请使用 [[文件#^真实块id]]。')
    } else {
      heading = fragment
    }
  }

  if (file === '' && heading === null && blockId === null) {
    return invalid('双链必须指向文件、标题或块。')
  }
  if (file.includes('#') || (heading !== null && heading.includes('#'))) {
    return invalid('双链只能有一个 #；标题里的 # 会破坏目标。')
  }

  return {
    ok: true,
    parts: {
      raw: inner,
      file,
      heading,
      blockId,
      alias: aliasText === '' ? null : aliasText,
    },
  }
}

function assertSafePart(value: string, label: string): void {
  if (value === '' || /[\u0000\n\r]/.test(value)) throw new Error(`${label}不能为空或包含换行。`)
  if (value.includes(']]') || value.includes('[[')) throw new Error(`${label}不能包含方括号。`)
}

/**
 * Render a canonical link. The file is expected to be a vault-relative path
 * (the Host resolver always returns one), so the result is unambiguous in both
 * DSH and Obsidian. A heading wins over a block, matching the parser's model.
 */
export function formatWikilink(
  file: string,
  options: { heading?: string | null; blockId?: string | null; alias?: string | null } = {},
): string {
  assertSafePart(file, '双链文件路径')
  if (file.includes('#') || file.includes('|')) throw new Error('双链文件路径不能包含 # 或 |。')
  const alias = options.alias ?? null
  if (alias !== null) {
    assertSafePart(alias, '显示别名')
    if (alias.includes('|')) throw new Error('显示别名不能包含 |。')
  }
  let target = file
  if (options.heading !== undefined && options.heading !== null) {
    assertSafePart(options.heading, '标题')
    if (options.heading.includes('#')) throw new Error('标题不能包含 #。')
    target += `#${options.heading}`
  } else if (options.blockId !== undefined && options.blockId !== null) {
    assertSafePart(options.blockId, '块 id')
    if (options.blockId.includes('#') || /\s/.test(options.blockId)) throw new Error('块 id 不能包含空白或 #。')
    target += `#^${options.blockId}`
  }
  return alias === null ? `[[${target}]]` : `[[${target}|${alias}]]`
}

/** Compare heading text the way Obsidian does: NFC, trimmed, case-insensitive. */
export function headingKey(text: string): string {
  return text.normalize('NFC').trim().toLowerCase()
}

/** The text a reader sees for a parsed link when no display alias was written. */
export function wikilinkDisplay(parts: WikilinkParts): string {
  if (parts.alias !== null) return parts.alias
  if (parts.heading !== null) return parts.heading
  if (parts.blockId !== null) return `^${parts.blockId}`
  return parts.file
}
