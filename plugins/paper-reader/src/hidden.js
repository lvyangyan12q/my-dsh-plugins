/**
 * A per-day hide list.
 *
 * Deleting an item must survive a re-run of that day: the digest file is
 * regenerated from the sources, so removing a row from it would only last until
 * the next fetch. The hide list lives beside the digests and the reader filters
 * it out when it serves a day, which keeps the stored day intact and the
 * deletion reversible (edit or delete `hidden.json`).
 *
 * Shape: `{ schemaVersion: 1, dates: { "YYYY-MM-DD": ["<url>", ...] } }`
 */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const HIDDEN_FILE = 'hidden.json'

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function emptyList() {
  return { schemaVersion: 1, dates: {} }
}

/** Read the hide list; a missing or broken file is an empty list. */
export async function readHidden({ root }) {
  const path = join(root, HIDDEN_FILE)
  if (!existsSync(path)) return { hidden: emptyList(), path, missing: true }
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    const dates = {}
    for (const [date, urls] of Object.entries(parsed?.dates ?? {})) {
      if (!isDate(date) || !Array.isArray(urls)) continue
      dates[date] = urls.filter(url => typeof url === 'string' && url.length > 0)
    }
    return { hidden: { schemaVersion: 1, dates }, path, missing: false }
  } catch {
    // A corrupt list hides nothing: showing an item twice is better than
    // silently losing the day because the file has a stray character.
    return { hidden: emptyList(), path, missing: false, corrupt: true }
  }
}

/** The URLs hidden for one day. */
export async function hiddenFor({ root, date }) {
  const { hidden } = await readHidden({ root })
  return hidden.dates?.[date] ?? []
}

/**
 * Add one URL to a day's hide list (idempotent) and return the new list.
 * The write is atomic: the reader never sees a half-written file.
 */
export async function hideItem({ root, date, url }) {
  if (!isDate(date)) {
    throw Object.assign(new Error('a date is required: YYYY-MM-DD'), { status: 400, code: 'hidden_invalid_date' })
  }
  if (typeof url !== 'string' || url.length === 0) {
    throw Object.assign(new Error('a url is required'), { status: 400, code: 'hidden_invalid_url' })
  }
  const { hidden, path } = await readHidden({ root })
  const current = Array.isArray(hidden.dates[date]) ? hidden.dates[date] : []
  if (!current.includes(url)) current.push(url)
  const next = { schemaVersion: 1, dates: { ...hidden.dates, [date]: current } }
  const temp = `${path}.tmp`
  await writeFile(temp, JSON.stringify(next), 'utf8')
  await rename(temp, path)
  return next
}

/** Remove one URL from a day's hide list (undo). */
export async function unhideItem({ root, date, url }) {
  if (!isDate(date)) {
    throw Object.assign(new Error('a date is required: YYYY-MM-DD'), { status: 400, code: 'hidden_invalid_date' })
  }
  const { hidden, path } = await readHidden({ root })
  const current = Array.isArray(hidden.dates[date]) ? hidden.dates[date] : []
  const next = { schemaVersion: 1, dates: { ...hidden.dates, [date]: current.filter(entry => entry !== url) } }
  if (next.dates[date].length === 0) delete next.dates[date]
  const temp = `${path}.tmp`
  await writeFile(temp, JSON.stringify(next), 'utf8')
  await rename(temp, path)
  return next
}

/** Drop the hidden items from a day's item list. */
export function applyHidden(items, urls) {
  if (!Array.isArray(items) || !Array.isArray(urls) || urls.length === 0) return items
  const hidden = new Set(urls)
  return items.filter(item => !hidden.has(item?.url))
}
