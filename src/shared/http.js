/**
 * One fetch-text helper for every source adapter.
 *
 * Each adapter used to carry its own copy of "GET with an accept header, an
 * abortable timeout and no timer keeping the process alive". The differences
 * that actually matter are the accept header, the user agent and the timeout,
 * so they are options here; error wrapping and source tagging stay in the
 * adapter that owns the source.
 */

/** Fetch text with a timeout that never keeps the process alive. */
export async function fetchText(fetchImpl, url, {
  timeoutMs = 20_000,
  userAgent,
  accept = 'text/html',
  headers = {},
} = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  if (typeof timer.unref === 'function') timer.unref()
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept,
        ...(userAgent ? { 'user-agent': userAgent } : {}),
        ...headers,
      },
    })
    const text = typeof response.text === 'function' ? await response.text() : ''
    return { response, text }
  } finally {
    clearTimeout(timer)
  }
}
