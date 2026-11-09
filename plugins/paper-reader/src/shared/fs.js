/**
 * Atomic file replacement, shared by the digest writer and the translation
 * cache.
 *
 * A reader must never see a half-written file: write a unique temporary sibling
 * and rename it over the target. A failed write removes its temporary file and
 * rethrows, so the caller can report the exact cause while the previous file
 * stays intact.
 */
import { randomUUID } from 'node:crypto'
import { rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export async function writeFileAtomic(path, text) {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    await writeFile(temp, text, 'utf8')
    await rename(temp, path)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
}
