/**
 * URL helpers shared by the source adapters, the selector and the reader.
 *
 * Two different questions, deliberately kept apart:
 *
 * - `normalizeUrl` answers "is this the same page?" for discovery memory: it
 *   drops the fragment and a trailing slash.
 * - `canonicalUrl` answers "is this the same paper?" for dedupe: it also drops
 *   the scheme, `www.`, an arXiv `/vN` suffix and case, so the arXiv abs page
 *   and its HTML/PDF variants collapse to one key.
 */

/** A compare key that ignores the fragment and trailing slashes. */
export function normalizeUrl(value) {
  try {
    const url = new URL(String(value))
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return String(value ?? '').trim().replace(/\/+$/, '')
  }
}

/** A dedupe key that ignores scheme, `www.`, version suffix, case and query case. */
export function canonicalUrl(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    const path = url.pathname.replace(/\/+$/, '').replace(/v\d+$/, '')
    return `${url.hostname.replace(/^www\./i, '')}${path}${url.search}`.toLowerCase()
  } catch {
    return normalizeUrl(text).toLowerCase()
  }
}

/** The last path segment of a URL, used as a stable article slug. */
export function slugFromUrl(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    const segments = url.pathname.split('/').filter(Boolean)
    return segments.length > 0 ? segments[segments.length - 1] : ''
  } catch {
    return ''
  }
}
