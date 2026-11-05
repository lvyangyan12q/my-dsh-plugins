/**
 * Date helpers shared by the pipeline, the storage layer, the CLI and the
 * reading page.
 *
 * Two shapes matter here:
 *
 * - a **digest date** is a real calendar day written `YYYY-MM-DD`, used as the
 *   day-file name and the list grouping key;
 * - a **timestamp** is an ISO 8601 instant used for `publishedAt` /
 *   `collectedAt`.
 *
 * Every helper is dependency-free so the browser bundle can import it too.
 */

const DAY_MS = 86_400_000

/** Is the value a real calendar date written `YYYY-MM-DD`? */
export function isDigestDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** The `YYYY-MM-DD` part of an ISO timestamp, else null. */
export function dateOnly(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? '').trim())
  return match ? match[1] : null
}

/** Move a real `YYYY-MM-DD` date by whole days (UTC). */
export function shiftDate(date, days) {
  const base = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(base)) return date
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10)
}

/** Alias kept for callers that read as "add N days". */
export const addDays = shiftDate

/** The browser's (or the given clock's) local calendar date. */
export function localDate(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Normalize a source-declared publication time to an ISO instant, or null.
 *
 * A bare `YYYY-MM-DD` is read as midnight UTC, so a digest never mixes date
 * strings and instants under the same `publishedAt` key.
 */
export function normalizeInstant(value) {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  if (isDigestDate(text)) return `${text}T00:00:00.000Z`
  const time = Date.parse(text)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}
