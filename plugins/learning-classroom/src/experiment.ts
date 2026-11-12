/**
 * Browser-safe experiment rendering policy. The classroom never puts an
 * experiment's HTML into the main document; it wraps the page in an opaque-origin
 * sandbox and injects this policy before the HTML reaches an iframe. The file
 * writer applies the same policy, so opening the file elsewhere keeps the limit.
 */
export const experimentCsp = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  'media-src data:',
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  'sandbox allow-scripts',
].join('; ')

const cspMarker = 'data-learning-classroom-csp="1"'
const cspTag = `<meta http-equiv="Content-Security-Policy" ${cspMarker} content="${experimentCsp}">`

/** Insert markup at the start of a document's head, creating one when needed. */
export function injectIntoHead(html: string, markup: string): string {
  const head = /<head\b[^>]*>/i.exec(html)
  if (head !== null) {
    const index = head.index + head[0].length
    return `${html.slice(0, index)}${markup}${html.slice(index)}`
  }
  const root = /<html\b[^>]*>/i.exec(html)
  if (root !== null) {
    const index = root.index + root[0].length
    return `${html.slice(0, index)}<head>${markup}</head>${html.slice(index)}`
  }
  const doctype = /<!doctype[^>]*>/i.exec(html)
  if (doctype !== null) {
    const index = doctype.index + doctype[0].length
    const rest = html.slice(index)
    const body = /<body\b/i.test(rest)
    return body
      ? `${html.slice(0, index)}<html><head>${markup}</head>${rest}`
      : `${html.slice(0, index)}<html><head>${markup}</head><body>${rest}</body></html>`
  }
  if (/<body\b/i.test(html)) return `<html><head>${markup}</head>${html}</html>`
  return `<html><head>${markup}</head><body>${html}</body></html>`
}

/**
 * Ensure the strongest classroom policy is present before rendering. A model's
 * own CSP cannot replace it: the data marker identifies our exact tag.
 */
export function ensureExperimentCsp(input: string): string {
  const html = typeof input === 'string' ? input : ''
  if (html.includes(cspMarker)) return html
  return injectIntoHead(html, cspTag)
}
