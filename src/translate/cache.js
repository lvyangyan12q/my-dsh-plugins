/**
 * On-disk translation cache.
 *
 * One JSON file per translated block at `$DSH_HOME/paper-reader/cache/`, named
 * by the SHA-256 of everything that can change the answer: the source text,
 * the target language, the model and the glossary version. A repeated run
 * therefore reuses translations across days without calling the endpoint.
 *
 * The cache is derived data and never load-bearing: an unreadable or
 * unwritable entry only costs a request, never a failed run.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export const CACHE_DIR_NAME = 'cache'

/** The cache key, as specified: sha256(original + target + model + glossary version). */
export function translationCacheKey({ text, targetLanguage, model, glossaryVersion }) {
  // JSON keeps the fields unambiguous (a plain concatenation could collide
  // when one value ends where the next begins).
  const material = JSON.stringify({
    text: String(text ?? ''),
    targetLanguage: String(targetLanguage ?? ''),
    model: String(model ?? ''),
    glossaryVersion: String(glossaryVersion ?? ''),
  })
  return createHash('sha256').update(material).digest('hex')
}

export function translationCachePath({ root, key }) {
  return join(root, CACHE_DIR_NAME, `${key}.json`)
}

/** Write a cache entry through a temporary sibling; errors are reported, not thrown. */
async function writeAtomic(path, text) {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    await writeFile(temp, text, 'utf8')
    await rename(temp, path)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
}

/**
 * A tiny read-through cache. `get` returns null on any problem (missing file,
 * corrupt JSON, wrong shape), so a corrupt cache can never break a run.
 */
export function createTranslationCache({ root }) {
  const state = { errors: 0 }
  let dirReady = false

  async function ensureDir() {
    if (dirReady) return
    await mkdir(join(root, CACHE_DIR_NAME), { recursive: true })
    dirReady = true
  }

  return {
    errors: () => state.errors,
    async get(key) {
      try {
        const text = await readFile(translationCachePath({ root, key }), 'utf8')
        const entry = JSON.parse(text)
        return typeof entry?.text === 'string' && entry.text.trim().length > 0 ? entry.text : null
      } catch {
        return null
      }
    },
    async put(key, text, meta = {}) {
      try {
        await ensureDir()
        await writeAtomic(
          translationCachePath({ root, key }),
          JSON.stringify({ key, text, ...meta, cachedAt: new Date().toISOString() }),
        )
      } catch {
        state.errors += 1
      }
    },
  }
}
