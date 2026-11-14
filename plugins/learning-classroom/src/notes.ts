import { createHash } from 'node:crypto'
import { ClassroomError } from './errors.ts'
import { vaultRelativePath } from './vault.ts'

/** Folder, inside a learning space, that holds the learner's own Markdown notes. */
export const notesFolder = '笔记'
/** Text read/write cap for a single note (bytes of UTF-8 content). */
export const maxNoteBytes = 1024 * 1024

/**
 * A note version is the SHA-256 of the file's UTF-8 bytes. Content hashing
 * means an edit made outside the plugin (Obsidian, git, another editor) is
 * detected just as reliably as one made here.
 */
export function noteVersion(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/** True when the content on disk no longer matches the version read earlier. */
export function noteConflict(expectedVersion: string, content: string): boolean {
  return noteVersion(content) !== expectedVersion
}

/**
 * Validate a space-relative note path: it must stay inside the space's
 * `笔记/` folder and name a Markdown file. Traversal is rejected by the shared
 * vault path validator, never rewritten. Returns a normalized `/` path.
 */
export function noteRelativePath(input: string): string {
  let normalized: string
  try {
    normalized = vaultRelativePath(input)
  } catch (error) {
    if (error instanceof ClassroomError) {
      throw new ClassroomError('note-path-invalid', error.message)
    }
    throw error
  }
  const segments = normalized.split('/')
  if (segments.length < 2 || segments[0] !== notesFolder) {
    throw new ClassroomError('note-path-invalid', `笔记路径必须在「${notesFolder}/」目录下：${input}`)
  }
  if (!segments[segments.length - 1].toLowerCase().endsWith('.md')) {
    throw new ClassroomError('note-path-invalid', `笔记必须是 Markdown 文件：${input}`)
  }
  return normalized
}

/** Who is asking to write: the learner's own save, or a future teacher tool. */
export type VaultActor = 'note-save' | 'teacher'

/**
 * True for a vault-relative path inside some space's `笔记/` folder. Both the
 * vault-relative form (`空间/笔记/x.md`) and the space-relative form
 * (`笔记/x.md`) are recognized so a caller cannot dodge the guard by using the
 * wrong frame.
 */
export function isNotePath(path: string): boolean {
  const segments = path.replaceAll('\\', '/').split('/').filter(segment => segment !== '' && segment !== '.')
  return segments[0] === notesFolder || segments[1] === notesFolder
}

/**
 * Single write gate for every host-side file write. `note-save` is the only
 * actor allowed to write the `笔记/` folder; teacher tools are rejected here
 * before any file is touched, so a refusal never damages the original note.
 */
export function assertVaultWriteAllowed(actor: VaultActor, path: string): void {
  if (actor === 'note-save') return
  if (isNotePath(vaultRelativePath(path))) {
    throw new ClassroomError('note-write-forbidden', `老师工具不能写入「${notesFolder}/」目录：${path}`, 403)
  }
}
