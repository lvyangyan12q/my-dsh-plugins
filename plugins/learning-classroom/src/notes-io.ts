import { randomUUID } from 'node:crypto'
import { readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { ClassroomError } from './errors.ts'
import { assertVaultWriteAllowed, maxNoteBytes, noteConflict, notesFolder, noteRelativePath, noteVersion, type VaultActor } from './notes.ts'
import { nodeVaultProbe, resolveVaultPath, vaultRelativePath, type VaultProbe } from './vault.ts'

export interface NoteSummary {
  /** Space-relative path, e.g. `笔记/我的笔记.md`. */
  path: string
  name: string
}

export interface NoteDocument {
  path: string
  content: string
  version: string
  updatedAt: string
}

export interface NoteSaveResult {
  path: string
  version: string
  savedAt: string
}

export interface WriteOptions {
  actor: VaultActor
  /** Version read earlier; required unless `overwrite` is set. */
  expectedVersion?: string
  /** The learner explicitly chose to keep their content over an external edit. */
  overwrite?: boolean
}

const utf8 = { encoding: 'utf8' as const }

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function unavailable(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EACCES' || code === 'EPERM' || code === 'EISDIR' || code === 'ENOTDIR'
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : '未知原因'
}

async function notesDirectory(root: string, spaceDirectory: string, probe: VaultProbe): Promise<string> {
  const relative = vaultRelativePath(`${spaceDirectory}/${notesFolder}`)
  const target = await resolveVaultPath(root, relative, probe)
  let info
  try {
    info = await stat(target)
  } catch (error) {
    if (missing(error)) {
      throw new ClassroomError('notes-unavailable', `笔记目录不存在：${relative}`, 409)
    }
    throw new ClassroomError('notes-unavailable', `无法访问笔记目录：${relative}（${reasonOf(error)}）`, 409)
  }
  if (!info.isDirectory()) {
    throw new ClassroomError('notes-unavailable', `笔记路径不是目录：${relative}`, 409)
  }
  return target
}

/** List the Markdown files directly inside a space's `笔记/` folder. */
export async function listNotes(root: string, spaceDirectory: string, probe: VaultProbe = nodeVaultProbe): Promise<NoteSummary[]> {
  const directory = await notesDirectory(root, spaceDirectory, probe)
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    throw new ClassroomError('notes-unavailable', `无法读取笔记目录：${spaceDirectory}/${notesFolder}（${reasonOf(error)}）`, 409)
  }
  return entries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md') && !entry.name.startsWith('.'))
    .map(entry => ({ path: `${notesFolder}/${entry.name}`, name: entry.name }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/** Read one note. The returned version is the SHA-256 of the bytes on disk. */
export async function readNote(
  root: string,
  spaceDirectory: string,
  input: string,
  probe: VaultProbe = nodeVaultProbe,
): Promise<NoteDocument> {
  const relative = noteRelativePath(input)
  const target = await resolveVaultPath(root, `${spaceDirectory}/${relative}`, probe)
  let info
  try {
    info = await stat(target)
  } catch (error) {
    if (missing(error)) throw new ClassroomError('note-not-found', `笔记文件不存在：${relative}`, 404)
    if (unavailable(error)) throw new ClassroomError('note-not-found', `无法访问笔记文件：${relative}（${reasonOf(error)}）`, 404)
    throw new ClassroomError('note-not-found', `无法读取笔记文件：${relative}（${reasonOf(error)}）`, 404)
  }
  if (!info.isFile()) throw new ClassroomError('note-not-found', `笔记路径不是文件：${relative}`, 404)
  if (info.size > maxNoteBytes) {
    throw new ClassroomError('note-too-large', `笔记文件超过 ${maxNoteBytes} 字节上限：${relative}`, 413)
  }
  let content: string
  try {
    content = await readFile(target, utf8)
  } catch (error) {
    throw new ClassroomError('note-not-found', `无法读取笔记文件：${relative}（${reasonOf(error)}）`, 404)
  }
  return { path: relative, content, version: noteVersion(content), updatedAt: info.mtime.toISOString() }
}

/** Write a vault-relative text file atomically, after the path and actor checks. */
export async function writeVaultText(
  root: string,
  relativeInput: string,
  content: string,
  options: WriteOptions,
  probe: VaultProbe = nodeVaultProbe,
): Promise<{ path: string; version: string }> {
  const relative = vaultRelativePath(relativeInput)
  assertVaultWriteAllowed(options.actor, relative)
  if (Buffer.byteLength(content, 'utf8') > maxNoteBytes) {
    throw new ClassroomError('note-too-large', `内容超过 ${maxNoteBytes} 字节上限：${relative}`, 413)
  }
  const target = await resolveVaultPath(root, relative, probe)

  let current: string | undefined
  try {
    current = await readFile(target, utf8)
  } catch (error) {
    if (!missing(error)) {
      if (unavailable(error)) {
        throw new ClassroomError('note-save-failed', `没有读写该文件的权限：${relative}（${reasonOf(error)}）`, 409)
      }
      throw new ClassroomError('note-save-failed', `无法读取当前文件：${relative}（${reasonOf(error)}）`, 409)
    }
  }

  if (options.overwrite !== true && options.expectedVersion !== undefined) {
    if (current === undefined) {
      throw new ClassroomError('note-conflict', '磁盘上的笔记文件已不存在，可能被外部删除；保存已被拒绝。请选择重新加载或使用我的内容覆盖。', 409)
    }
    if (noteConflict(options.expectedVersion, current)) {
      throw new ClassroomError('note-conflict', '磁盘上的笔记已被外部修改，保存已被拒绝。请选择重新加载或使用我的内容覆盖。', 409)
    }
  } else if (options.expectedVersion === undefined && options.overwrite !== true) {
    // New files are allowed, but only through an actor that may create them.
    if (current !== undefined) {
      throw new ClassroomError('note-conflict', `文件已存在，需要带读取时的版本才能覆盖：${relative}`, 409)
    }
  }

  const directory = dirname(target)
  let directoryInfo
  try {
    directoryInfo = await stat(directory)
  } catch (error) {
    if (missing(error)) {
      throw new ClassroomError('note-save-failed', `保存失败：目录不存在（${relative}）。内容仍保留在编辑器里。`, 409)
    }
    throw new ClassroomError('note-save-failed', `保存失败：无法访问目录（${relative}，${reasonOf(error)}）。内容仍保留在编辑器里。`, 409)
  }
  if (!directoryInfo.isDirectory()) {
    throw new ClassroomError('note-save-failed', `保存失败：父路径不是目录（${relative}）。内容仍保留在编辑器里。`, 409)
  }

  const staging = join(directory, `.${basename(target)}.${randomUUID()}.tmp`)
  try {
    await writeFile(staging, content, { ...utf8, flag: 'wx' })
    await rename(staging, target)
  } catch (error) {
    await rm(staging, { force: true }).catch(() => undefined)
    throw new ClassroomError('note-save-failed', `保存失败：${relative}（${reasonOf(error)}）。内容仍保留在编辑器里。`, 409)
  }
  return { path: relative, version: noteVersion(content) }
}

/** Save the learner's note; conflict is explicit unless the learner chose overwrite. */
export async function saveNote(
  root: string,
  spaceDirectory: string,
  input: string,
  content: string,
  expectedVersion: string,
  options: { overwrite?: boolean } = {},
  probe: VaultProbe = nodeVaultProbe,
): Promise<NoteSaveResult> {
  const relative = noteRelativePath(input)
  // The note folder must already exist: a missing folder is a visible failure,
  // not something we silently recreate behind the learner's back.
  await notesDirectory(root, spaceDirectory, probe)
  const written = await writeVaultText(root, `${spaceDirectory}/${relative}`, content, {
    actor: 'note-save',
    expectedVersion,
    overwrite: options.overwrite,
  }, probe)
  return { path: relative, version: written.version, savedAt: new Date().toISOString() }
}
