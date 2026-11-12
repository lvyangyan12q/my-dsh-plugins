import { open, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { LinkResolveStatus, LinkResolveView, LinkTargetKind } from './contract.ts'
import { lectureFileKind, parseFrontmatter } from './lectures.ts'
import { formatWikilink, headingKey, parseWikilink, type WikilinkParts } from './links.ts'
import { ClassroomError } from './errors.ts'
import { nodeVaultProbe, resolveVaultPath, vaultRelativePath, type VaultProbe } from './vault.ts'

/** Bounded walk: a link index that silently stops would hide real ambiguity. */
const linkIndexDepthLimit = 16
const linkIndexCountLimit = 4000
/** A file bigger than this cannot be inspected for headings/blocks, only linked. */
const linkInspectBytes = 1.5 * 1024 * 1024
/** Frontmatter aliases must fit in the head; a later body never carries them. */
const aliasChunkBytes = 64 * 1024
/** A frontmatter larger than this cannot be inspected safely; refuse, never guess. */
const aliasFrontmatterBytes = 256 * 1024

function hasFrontmatterOpener(text: string): boolean {
  return /^\uFEFF?---[ \t]*\r?\n/.test(text)
}

/** True once a closing `---`/`...` line follows the opening delimiter. */
function frontmatterClosed(text: string): boolean {
  const lines = text.split('\n')
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index].replace(/\r$/, '').trim()
    if (line === '---' || line === '...') return true
  }
  return false
}

const markdownExtension = /\.md$/i

export interface LinkIndex {
  /** Vault-relative Markdown paths, real on-disk casing, `/`-separated. */
  files: string[]
}

export interface LinkSpaceScope {
  /** Space folder name relative to the vault root. */
  directory: string
  /** Explicitly linked course files, space-relative. */
  linkedLectures?: readonly string[]
}

/**
 * Walk the vault once and collect Markdown files. Directories reached through a
 * symlink/junction are never followed, so the index cannot escape the vault.
 */
export async function buildLinkIndex(root: string, probe: VaultProbe = nodeVaultProbe): Promise<LinkIndex> {
  const realRoot = await probe.realpath(root).catch(() => {
    throw new ClassroomError('vault-unavailable', `知识文件库不可访问：${root}`, 409)
  })
  const files: string[] = []

  const walk = async (directory: string, relative: string, depth: number): Promise<void> => {
    let entries
    try {
      entries = await (probe.readdir ?? ((path, options) => readdir(path, options)))(directory, { withFileTypes: true })
    } catch (error) {
      // A skipped directory could hide a same-name file or an alias collision.
      // Refuse the whole index instead of pretending the vault is complete.
      throw new ClassroomError(
        'link-index-incomplete',
        `无法完整读取知识文件库目录「${relative === '' ? '根目录' : relative}」（${error instanceof Error ? error.message : '未知原因'}）；为避免隐藏同名歧义，双链索引已拒绝建立。`,
        409,
      )
    }
    entries.sort((a, b) => (a.name.normalize('NFC') < b.name.normalize('NFC') ? -1 : a.name.normalize('NFC') > b.name.normalize('NFC') ? 1 : 0))
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const nextRelative = relative === '' ? entry.name : `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        if (depth >= linkIndexDepthLimit) {
          throw new ClassroomError(
            'link-index-too-large',
            `知识文件库目录嵌套超过 ${linkIndexDepthLimit} 层（${nextRelative}）；双链索引无法完整建立。`,
            409,
          )
        }
        await walk(join(directory, entry.name), nextRelative, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (!markdownExtension.test(entry.name)) continue
      if (files.length >= linkIndexCountLimit) {
        throw new ClassroomError(
          'link-index-too-large',
          `知识文件库中的 Markdown 文件超过 ${linkIndexCountLimit} 个；双链索引无法完整建立，请缩小知识库范围。`,
          409,
        )
      }
      files.push(nextRelative.normalize('NFC'))
    }
  }

  await walk(realRoot, '', 0)
  return { files: files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) }
}

function emptyView(spaceId: string, target: string, status: LinkResolveStatus, message: string): LinkResolveView {
  return {
    spaceId,
    target,
    status,
    file: null,
    spacePath: null,
    kind: 'file',
    heading: null,
    blockId: null,
    link: null,
    candidates: [],
    message,
  }
}

function kindOf(space: LinkSpaceScope, file: string, spacePath: string | null): LinkTargetKind {
  if (spacePath === null) return 'file'
  if (spacePath.startsWith('笔记/') && markdownExtension.test(spacePath)) return 'note'
  if (lectureFileKind(spacePath) !== null) {
    return spacePath.startsWith('讲义/') || (space.linkedLectures ?? []).includes(spacePath) ? 'lecture' : 'file'
  }
  return 'file'
}

interface FenceMarker {
  char: string
  length: number
}

/** Opening fence: a run of 3+ backticks/tildes at line start (info string allowed). */
function fenceOpen(line: string): FenceMarker | null {
  const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
  if (match === null) return null
  return { char: match[1][0], length: match[1].length }
}

/** A fence closes only with the same character and at least the opening length. */
function fenceCloses(line: string, fence: FenceMarker): boolean {
  const match = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line)
  return match !== null && match[1][0] === fence.char && match[1].length >= fence.length
}

/** Extract ATX/setext headings outside fenced code, keeping raw heading text. */
export function markdownHeadings(source: string): string[] {
  const body = parseFrontmatter(source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')).body
  const lines = body.split('\n')
  const headings: string[] = []
  let fence: FenceMarker | null = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (fence === null) {
      const opened = fenceOpen(line)
      if (opened !== null) {
        fence = opened
        continue
      }
    } else {
      if (fenceCloses(line, fence)) fence = null
      continue
    }
    const atx = /^\s{0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(line)
    if (atx !== null) {
      const text = atx[2].trim()
      if (text !== '') headings.push(text)
      continue
    }
    const next = lines[index + 1]
    if (line.trim() !== '' && next !== undefined && /^\s{0,3}(?:=+|-+)\s*$/.test(next)
      && !/^\s*(?:[-*+>]|\d+[.)])\s/.test(line)) {
      headings.push(line.trim())
      index += 1
    }
  }
  return headings
}

/** Existing block ids (`^id` ending a block line, including a standalone line). */
export function markdownBlockIds(source: string): string[] {
  const body = parseFrontmatter(source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')).body
  const ids: string[] = []
  let fence: FenceMarker | null = null
  for (const line of body.split('\n')) {
    if (fence === null) {
      const opened = fenceOpen(line)
      if (opened !== null) {
        fence = opened
        continue
      }
    } else {
      if (fenceCloses(line, fence)) fence = null
      continue
    }
    const match = /(?:^|\s)\^([A-Za-z0-9-]+)[ \t]*$/.exec(line)
    if (match !== null) ids.push(match[1])
  }
  return ids
}

/** Frontmatter `aliases`/`alias`, accepting a comma list or a `[a, b]` array. */
export function frontmatterAliases(source: string): string[] {
  const attributes = parseFrontmatter(source).attributes
  const raw = attributes.aliases ?? attributes.alias
  if (raw === undefined) return []
  let text = raw.trim()
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1)
  return text
    .split(',')
    .map(value => value.trim().replace(/^['"]|['"]$/g, '').trim())
    .filter(value => value !== '')
}

interface MatchResult {
  status: 'ok' | 'missing' | 'ambiguous'
  file: string | null
  candidates: string[]
}

function fold(value: string): string {
  return value.normalize('NFC').toLowerCase()
}

function matchPath(files: readonly string[], input: string): MatchResult {
  const candidate = input.normalize('NFC')
  const exact = files.find(file => file.normalize('NFC') === candidate)
  if (exact !== undefined) return { status: 'ok', file: exact, candidates: [] }
  const folded = files.filter(file => fold(file) === fold(candidate))
  if (folded.length === 1) return { status: 'ok', file: folded[0], candidates: [] }
  if (folded.length > 1) return { status: 'ambiguous', file: null, candidates: [...folded].sort() }
  return { status: 'missing', file: null, candidates: [] }
}

function basenameMatches(files: readonly string[], name: string): string[] {
  const hasExtension = /\.[A-Za-z0-9]+$/.test(name)
  return files.filter(file => {
    const base = file.split('/').pop() ?? ''
    if (base === name) return true
    if (!hasExtension) return base.replace(markdownExtension, '') === name
    return false
  })
}

function basenameFoldMatches(files: readonly string[], name: string): string[] {
  const hasExtension = /\.[A-Za-z0-9]+$/.test(name)
  const wanted = fold(name)
  return files.filter(file => {
    const base = file.split('/').pop() ?? ''
    return fold(hasExtension ? base : base.replace(markdownExtension, '')) === wanted
  })
}

async function readBoundedFile(root: string, file: string, probe: VaultProbe): Promise<{ content: string } | { tooLarge: true } | null> {
  const target = await resolveVaultPath(root, file, probe).catch(() => null)
  if (target === null) return null
  let info
  try {
    info = await stat(target)
  } catch {
    return null
  }
  if (!info.isFile()) return null
  if (info.size > linkInspectBytes) return { tooLarge: true }
  try {
    return { content: await readFile(target, 'utf8') }
  } catch {
    return null
  }
}

/**
 * Read just enough of the file to close its frontmatter. A fixed-size head can
 * end inside a long frontmatter, which would look like "no aliases" and could
 * hide a shared alias; keep reading in bounded chunks and refuse instead of
 * returning a false unique result.
 */
async function readAliasFrontmatter(root: string, file: string, probe: VaultProbe): Promise<string | null> {
  let target: string
  try {
    target = await resolveVaultPath(root, file, probe)
  } catch {
    throw new ClassroomError(
      'link-index-incomplete',
      `无法访问别名候选文件「${file}」；为避免隐藏同名别名歧义，双链解析已拒绝继续。`,
      409,
    )
  }
  let handle
  try {
    handle = await open(target, 'r')
  } catch {
    throw new ClassroomError(
      'link-index-incomplete',
      `无法读取别名候选文件「${file}」；别名索引不完整，双链解析已拒绝继续。`,
      409,
    )
  }
  try {
    const chunks: Buffer[] = []
    let offset = 0
    for (;;) {
      const buffer = Buffer.alloc(aliasChunkBytes)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
      if (bytesRead === 0) return null
      chunks.push(buffer.subarray(0, bytesRead))
      offset += bytesRead
      const text = Buffer.concat(chunks).toString('utf8')
      if (!hasFrontmatterOpener(text)) {
        // The opener must be at byte 0; once a full line was read it cannot appear later.
        if (text.includes('\n')) return null
        continue
      }
      if (frontmatterClosed(text)) return text
      if (offset >= aliasFrontmatterBytes) {
        throw new ClassroomError(
          'link-index-incomplete',
          `别名候选文件「${file}」的前言超过 ${Math.round(aliasFrontmatterBytes / 1024)} KB 仍未闭合；别名索引不完整，双链解析已拒绝继续。`,
          409,
        )
      }
    }
  } catch (error) {
    if (error instanceof ClassroomError) throw error
    throw new ClassroomError(
      'link-index-incomplete',
      `无法完整读取别名候选文件「${file}」；别名索引不完整，双链解析已拒绝继续。`,
      409,
    )
  } finally {
    await handle.close().catch(() => undefined)
  }
}

/** Final on-disk check: an index hit alone is not proof the file still exists. */
async function verifyVaultFile(
  root: string,
  file: string,
  probe: VaultProbe,
): Promise<'ok' | 'missing' | 'outside'> {
  let target: string
  try {
    target = await resolveVaultPath(root, file, probe)
  } catch {
    return 'outside'
  }
  try {
    const info = await stat(target)
    return info.isFile() ? 'ok' : 'missing'
  } catch {
    return 'missing'
  }
}

export interface ResolveLinkOptions {
  root: string
  index: LinkIndex
  space: LinkSpaceScope
  spaceId: string
  target: string
  /** Space-relative Markdown path a `[[#标题]]` link belongs to. */
  fromPath?: string
  probe?: VaultProbe
}

/**
 * Resolve one wikilink against the real vault. Nothing is guessed: a bare name
 * matching several files is `ambiguous` with candidates, and a heading or block
 * is only accepted when it really exists in the target file.
 */
export async function resolveVaultLink(options: ResolveLinkOptions): Promise<LinkResolveView> {
  const { root, index, space, spaceId, target } = options
  const probe = options.probe ?? nodeVaultProbe
  const parsed = parseWikilink(target)
  if (!parsed.ok) return emptyView(spaceId, target, 'unsupported', parsed.message)
  const parts: WikilinkParts = parsed.parts

  let file: string | null = null

  if (parts.file === '') {
    if (options.fromPath === undefined || options.fromPath.trim() === '') {
      return emptyView(spaceId, target, 'unsupported', '同一个文件里的标题或块引用需要当前笔记作为来源；请先打开一篇笔记。')
    }
    let fromRelative: string
    try {
      fromRelative = vaultRelativePath(options.fromPath)
    } catch {
      return emptyView(spaceId, target, 'outside', `来源笔记路径越出知识文件库：${options.fromPath}`)
    }
    if (!markdownExtension.test(fromRelative)) {
      return emptyView(spaceId, target, 'unsupported', `来源必须是 Markdown 笔记：${options.fromPath}`)
    }
    file = `${space.directory}/${fromRelative}`
    if (!index.files.some(row => row.normalize('NFC') === file?.normalize('NFC'))) {
      return emptyView(spaceId, target, 'missing', `找不到来源笔记文件：${file}`)
    }
  } else {
    let relative: string
    try {
      relative = vaultRelativePath(parts.file)
    } catch {
      return emptyView(
        spaceId,
        target,
        'outside',
        `双链目标越出知识文件库（不接受绝对路径、盘符或 ..）：${parts.file}`,
      )
    }

    if (relative.includes('/')) {
      let match = matchPath(index.files, relative)
      if (match.status === 'missing' && !markdownExtension.test(relative)) {
        match = matchPath(index.files, `${relative}.md`)
      }
      if (match.status === 'ambiguous') {
        return {
          ...emptyView(spaceId, target, 'ambiguous', `路径在知识文件库中对应多个文件（大小写不同）：${match.candidates.join('、')}`),
          candidates: match.candidates,
        }
      }
      if (match.status === 'missing') {
        return emptyView(spaceId, target, 'missing', `知识文件库里找不到这个文件：${relative}`)
      }
      file = match.file
    } else {
      const exact = basenameMatches(index.files, relative)
      if (exact.length === 1) {
        file = exact[0]
      } else if (exact.length > 1) {
        return {
          ...emptyView(spaceId, target, 'ambiguous', `文件名「${relative}」在不同目录同名出现了 ${exact.length} 次；请改用 Vault 相对路径。`),
          candidates: [...exact].sort(),
        }
      } else {
        const folded = basenameFoldMatches(index.files, relative)
        if (folded.length === 1) {
          file = folded[0]
        } else if (folded.length > 1) {
          return {
            ...emptyView(spaceId, target, 'ambiguous', `文件名「${relative}」大小写不同的同名文件有 ${folded.length} 个；请改用 Vault 相对路径。`),
            candidates: [...folded].sort(),
          }
        } else {
          // Obsidian aliases are an alternative address for a file. Scanning is
          // bounded by the index; two matches are reported, never guessed.
          const aliasMatches: string[] = []
          for (const candidate of index.files) {
            const prefix = await readAliasFrontmatter(root, candidate, probe)
            if (prefix !== null && frontmatterAliases(prefix).some(alias => fold(alias) === fold(relative))) {
              aliasMatches.push(candidate)
            }
          }
          if (aliasMatches.length === 1) {
            file = aliasMatches[0]
          } else if (aliasMatches.length > 1) {
            return {
              ...emptyView(spaceId, target, 'ambiguous', `别名「${relative}」对应多个文件；请改用 Vault 相对路径。`),
              candidates: [...aliasMatches].sort(),
            }
          } else {
            return emptyView(spaceId, target, 'missing', `知识文件库里找不到文件或别名：${relative}`)
          }
        }
      }
    }
  }

  const resolved = file as string
  const verified = await verifyVaultFile(root, resolved, probe)
  if (verified === 'outside') {
    return emptyView(spaceId, target, 'outside', `目标文件经符号链接越出知识文件库：${resolved}`)
  }
  if (verified === 'missing') {
    return emptyView(spaceId, target, 'missing', `目标文件不存在、已被删除或无法读取：${resolved}`)
  }

  const prefix = `${space.directory.normalize('NFC')}/`
  const spacePath = resolved.normalize('NFC').startsWith(prefix)
    ? resolved.slice(space.directory.length + 1)
    : null

  let heading: string | null = null
  let blockId: string | null = null
  if (parts.heading !== null || parts.blockId !== null) {
    const read = await readBoundedFile(root, resolved, probe)
    if (read === null) {
      return emptyView(spaceId, target, 'missing', `无法读取目标文件，不能确认标题或块：${resolved}`)
    }
    if ('tooLarge' in read) {
      return emptyView(
        spaceId,
        target,
        'unsupported',
        `目标文件超过 ${Math.round(linkInspectBytes / 1024)} KB，无法核对标题或块；请只链接文件本身。`,
      )
    }
    if (parts.heading !== null) {
      const wanted = headingKey(parts.heading)
      const found = markdownHeadings(read.content).find(text => headingKey(text) === wanted)
      if (found === undefined) {
        return emptyView(spaceId, target, 'missing', `目标文件里没有标题「${parts.heading}」；不会生成假锚点。`)
      }
      heading = found
    } else if (parts.blockId !== null) {
      const wanted = fold(parts.blockId)
      const found = markdownBlockIds(read.content).find(id => fold(id) === wanted)
      if (found === undefined) {
        return emptyView(spaceId, target, 'missing', `目标文件里没有块 ^${parts.blockId}；不会生成假块 id。`)
      }
      blockId = found
    }
  }

  let link: string
  try {
    link = formatWikilink(resolved, { heading, blockId, alias: parts.alias })
  } catch (error) {
    return emptyView(spaceId, target, 'unsupported', error instanceof Error ? error.message : '目标无法表示成双链。')
  }

  return {
    spaceId,
    target,
    status: 'ok',
    file: resolved,
    spacePath,
    kind: kindOf(space, resolved, spacePath),
    heading,
    blockId,
    link,
    candidates: [],
    message: null,
  }
}
