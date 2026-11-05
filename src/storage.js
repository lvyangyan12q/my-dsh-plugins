/**
 * Day-file storage for the paper-reader data directory.
 *
 * Layout under `$DSH_HOME/paper-reader`:
 *
 *   digest/YYYY-MM-DD.json   one digest per day (schema v2 day document)
 *   index.json               the list of stored days, written last
 *   runs/YYYY-MM-DD.json     one run record per CLI run (diagnostics only)
 *
 * Guarantees this module owns:
 *
 * - **Atomic replacement**: every file is written to a temporary sibling and
 *   renamed over the target, so a crash or a failed write leaves the previous
 *   file intact. The index is written after the day file: the page only ever
 *   sees complete days.
 * - **8 MiB ceiling per day**: an oversized day is rejected before anything is
 *   written, so yesterday's good file stays.
 * - **30-day retention**: old day files are pruned best-effort after a write;
 *   a prune failure is reported but never blocks the new day or its index.
 *
 * The CLI and the host share this module, so a scheduled run and the reader
 * agree on paths, limits and the index shape.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { validateDayDigest } from './shared/schema.js'

export const MAX_DAY_BYTES = 8 * 1024 * 1024
export const MAX_RUN_BYTES = 1024 * 1024
export const RETENTION_DAYS = 30
export const INDEX_SCHEMA_VERSION = 2

const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/

/** An error the HTTP layer can turn into a status without guessing. */
function storageError(code, message, status, extra = {}) {
  return Object.assign(new Error(message), { code, status }, extra)
}

/** Is the value a real calendar date in the `YYYY-MM-DD` shape? */
export function isDigestDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Move a `YYYY-MM-DD` date by whole days. */
export function addDays(date, days) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

/** Resolve every path this module reads or writes. */
export function storagePaths(root) {
  const digestDir = join(root, 'digest')
  const runsDir = join(root, 'runs')
  return {
    root,
    digestDir,
    runsDir,
    indexPath: join(root, 'index.json'),
    dayPath: date => join(digestDir, `${date}.json`),
    runPath: date => join(runsDir, `${date}.json`),
  }
}

/** Write a file through a temporary sibling so readers never see a half file. */
async function writeFileAtomic(path, text) {
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
 * Merge one day into the index: newest first, oldest outside the retention
 * window dropped, at most `retentionDays` entries. Pure, so the CLI can unit
 * test an index before touching disk.
 */
export function mergeIndex(previous, entry, { retentionDays = RETENTION_DAYS, today, updatedAt } = {}) {
  const days = new Map()
  const priorDays = Array.isArray(previous?.days) ? previous.days : []
  for (const day of priorDays) {
    if (isDigestDate(day?.date)) days.set(day.date, day)
  }
  const anchor = isDigestDate(today) ? today : entry?.date
  if (isDigestDate(entry?.date)) days.set(entry.date, entry)
  const cutoff = isDigestDate(anchor) ? addDays(anchor, -(retentionDays - 1)) : ''
  const kept = [...days.values()]
    .filter(day => !cutoff || day.date >= cutoff)
    .sort((left, right) => (left.date < right.date ? 1 : left.date > right.date ? -1 : 0))
    .slice(0, retentionDays)
  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    updatedAt: updatedAt ?? new Date().toISOString(),
    retentionDays,
    days: kept,
  }
}

/**
 * Read `index.json`. A missing index is data, not an error (`missing: true`);
 * a corrupt one is an explicit 422 so the page can say what is wrong.
 */
export async function readIndex({ root }) {
  const { indexPath } = storagePaths(root)
  let text
  try {
    text = await readFile(indexPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { index: null, missing: true }
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw storageError('index_invalid', 'index.json is not valid JSON', 422)
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.days)) {
    throw storageError('index_invalid', 'index.json must be an object with a days array', 422)
  }
  const days = parsed.days.filter(day => day && isDigestDate(day.date))
  if (days.length !== parsed.days.length) {
    throw storageError('index_invalid', 'index.json contains a day entry without a valid date', 422)
  }
  return {
    index: {
      ...parsed,
      schemaVersion: Number(parsed.schemaVersion) || INDEX_SCHEMA_VERSION,
      retentionDays: Number(parsed.retentionDays) || RETENTION_DAYS,
      days,
    },
    missing: false,
  }
}

/**
 * Write one day and then its index entry.
 *
 * The day file is written first and atomically; the index is refreshed
 * afterwards. A failed index write is reported with `dayWritten: true`, so a
 * caller can retry the index without rewriting the day.
 */
export async function writeDayDigest({ root, digest, now = new Date(), retentionDays = RETENTION_DAYS }) {
  if (!digest || !isDigestDate(digest.date)) {
    throw storageError('digest_invalid_date', 'digest.date must be a real YYYY-MM-DD date', 400)
  }
  const problems = validateDayDigest(digest)
  if (problems.length > 0) {
    throw storageError('digest_invalid', `digest does not match the day contract: ${problems[0]}`, 422)
  }

  const paths = storagePaths(root)
  const text = JSON.stringify(digest)
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > MAX_DAY_BYTES) {
    throw storageError(
      'digest_too_large',
      `digest for ${digest.date} is ${bytes} bytes; the per-day limit is ${MAX_DAY_BYTES}`,
      413,
      { bytes, maxBytes: MAX_DAY_BYTES },
    )
  }

  const path = paths.dayPath(digest.date)
  await mkdir(paths.digestDir, { recursive: true })
  await writeFileAtomic(path, text)

  const updatedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString()
  const entry = {
    date: digest.date,
    items: Array.isArray(digest.items) ? digest.items.length : 0,
    generatedAt: typeof digest.generatedAt === 'string' ? digest.generatedAt : null,
    runStatus: typeof digest.run?.status === 'string' ? digest.run.status : null,
    sources: Array.isArray(digest.run?.sources) ? digest.run.sources : [],
    bytes,
    updatedAt,
  }

  // A corrupt index is derived data: rebuild it from the day files rather than
  // refusing the write. The day file remains the source of truth.
  let previous = null
  try {
    previous = (await readIndex({ root })).index
  } catch {
    previous = null
  }
  const index = mergeIndex(previous, entry, { retentionDays, today: digest.date, updatedAt })
  try {
    await writeFileAtomic(paths.indexPath, JSON.stringify(index))
  } catch (error) {
    throw storageError(
      'index_write_failed',
      `wrote ${path} but could not update index.json: ${error?.message ?? error}`,
      500,
      { cause: error, dayPath: path, dayWritten: true },
    )
  }

  const pruned = await pruneExpired({ root, today: digest.date, retentionDays })
  return { date: digest.date, path, bytes, index, pruned }
}

/**
 * Read one stored day. Missing, corrupt, oversized and mismatched files each
 * answer a distinct code so the route can map them to 404 / 422 / 413.
 */
export async function readDayDigest({ root, date, maxBytes = MAX_DAY_BYTES }) {
  if (!isDigestDate(date)) {
    throw storageError('digest_invalid_date', 'date must be a real YYYY-MM-DD date', 400)
  }
  const path = storagePaths(root).dayPath(date)
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw storageError('digest_missing', `no digest is stored for ${date}`, 404)
    }
    throw error
  }
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > maxBytes) {
    throw storageError(
      'digest_too_large',
      `digest for ${date} is ${bytes} bytes; the per-day limit is ${maxBytes}`,
      413,
      { bytes, maxBytes },
    )
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw storageError('digest_invalid', `digest for ${date} is not valid JSON`, 422)
  }
  if (parsed?.date !== date) {
    throw storageError('digest_invalid', `digest for ${date} carries a different date`, 422)
  }
  const problems = validateDayDigest(parsed)
  if (problems.length > 0) {
    throw storageError('digest_invalid', `digest for ${date} does not match the day contract: ${problems[0]}`, 422)
  }
  return { date, digest: parsed, path, bytes }
}

/**
 * Delete day files older than the retention window. Errors are collected, not
 * thrown: retention is housekeeping, and a stale day must not block today.
 */
export async function pruneExpired({ root, today, retentionDays = RETENTION_DAYS }) {
  const result = { deleted: [], failed: [] }
  const anchor = isDigestDate(today) ? today : new Date().toISOString().slice(0, 10)
  const cutoff = addDays(anchor, -(retentionDays - 1))
  const { digestDir } = storagePaths(root)
  let names
  try {
    names = await readdir(digestDir)
  } catch (error) {
    if (error?.code === 'ENOENT') return result
    result.failed.push({ date: null, message: String(error?.message ?? error) })
    return result
  }
  for (const name of names) {
    const match = DAY_FILE.exec(name)
    if (!match || match[1] >= cutoff) continue
    try {
      await unlink(join(digestDir, name))
      result.deleted.push(match[1])
    } catch (error) {
      result.failed.push({ date: match[1], message: String(error?.message ?? error) })
    }
  }
  result.deleted.sort()
  result.failed.sort((left, right) => String(left.date).localeCompare(String(right.date)))
  return result
}

/**
 * Write the run record for one date. Diagnostics only: it is never read by the
 * page, so a failed write must not take the digest down, and a chatty record is
 * capped so one bad run cannot fill the disk.
 */
export async function writeRunRecord({ root, date, record, maxBytes = MAX_RUN_BYTES }) {
  if (!isDigestDate(date)) {
    throw storageError('run_invalid_date', 'run date must be a real YYYY-MM-DD date', 400)
  }
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw storageError('run_invalid', 'run record must be an object', 422)
  }
  const text = JSON.stringify(record)
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > maxBytes) {
    throw storageError('run_too_large', `run record for ${date} is ${bytes} bytes; the limit is ${maxBytes}`, 413, {
      bytes,
      maxBytes,
    })
  }
  const path = storagePaths(root).runPath(date)
  await mkdir(storagePaths(root).runsDir, { recursive: true })
  await writeFileAtomic(path, text)
  return { date, path, bytes }
}

/* ------------------------------------------------------------------ */
/* Source discovery state                                              */
/* ------------------------------------------------------------------ */

export const SOURCE_STATE_SCHEMA_VERSION = 1

/** `$DSH_HOME/paper-reader/state/sources.json`. */
export function sourceStatePath(root) {
  return join(root, 'state', 'sources.json')
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Read the per-source discovery memory.
 *
 * The file records, for every URL an adapter has already offered, the digest
 * date on which it was first seen. A URL first seen on the current date is
 * still "new" for that date, so re-running the same day reproduces the day
 * instead of silently dropping yesterday's difference. A missing file is an
 * empty memory, not an error.
 */
export async function readSourceState({ root }) {
  const path = sourceStatePath(root)
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        state: { schemaVersion: SOURCE_STATE_SCHEMA_VERSION, updatedAt: null, sources: {} },
        missing: true,
      }
    }
    throw error
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw storageError('source_state_invalid', 'state/sources.json is not valid JSON', 422)
  }
  if (!isRecord(parsed) || (parsed.sources !== undefined && !isRecord(parsed.sources))) {
    throw storageError('source_state_invalid', 'state/sources.json must be an object with a sources object', 422)
  }

  const sources = {}
  for (const [id, entry] of Object.entries(parsed.sources ?? {})) {
    if (!isRecord(entry)) continue
    const seen = isRecord(entry.seen) ? entry.seen : {}
    sources[id] = {
      seen,
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : null,
    }
  }
  return {
    state: {
      schemaVersion: SOURCE_STATE_SCHEMA_VERSION,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      sources,
    },
    missing: false,
  }
}

/**
 * Remember the URLs discovered for one source.
 *
 * Existing first-seen dates win, so the same-day rerun still sees the URL as
 * new. The oldest entries are dropped past `maxUrls` to keep the file bounded.
 */
export function mergeSourceSeen(previous, sourceId, urls, {
  date,
  updatedAt,
  maxUrls = 1000,
} = {}) {
  const existing = previous?.sources?.[sourceId]?.seen ?? {}
  const seen = { ...existing }
  for (const url of urls ?? []) {
    if (typeof url !== 'string' || url.length === 0) continue
    if (!Object.prototype.hasOwnProperty.call(seen, url)) seen[url] = date
  }
  const limit = Number.isInteger(maxUrls) && maxUrls > 0 ? maxUrls : 1000
  const kept = Object.entries(seen).slice(-limit)
  return {
    schemaVersion: SOURCE_STATE_SCHEMA_VERSION,
    updatedAt: updatedAt ?? previous?.updatedAt ?? null,
    sources: {
      ...(previous?.sources ?? {}),
      [sourceId]: { seen: Object.fromEntries(kept), updatedAt: updatedAt ?? null },
    },
  }
}

/** Write the source discovery memory atomically. */
export async function writeSourceState({ root, state, now = new Date() }) {
  const path = sourceStatePath(root)
  const text = JSON.stringify({
    ...state,
    schemaVersion: SOURCE_STATE_SCHEMA_VERSION,
    updatedAt: state?.updatedAt ?? (now instanceof Date ? now.toISOString() : new Date(now).toISOString()),
  })
  await mkdir(dirname(path), { recursive: true })
  await writeFileAtomic(path, text)
  return { path, bytes: Buffer.byteLength(text, 'utf8') }
}

/** Read one run record; a missing record is `null`, not an error. */
export async function readRunRecord({ root, date }) {
  if (!isDigestDate(date)) {
    throw storageError('run_invalid_date', 'run date must be a real YYYY-MM-DD date', 400)
  }
  const path = storagePaths(root).runPath(date)
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  try {
    return JSON.parse(text)
  } catch {
    throw storageError('run_invalid', `run record for ${date} is not valid JSON`, 422)
  }
}
