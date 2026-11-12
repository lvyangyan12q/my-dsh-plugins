/**
 * Browser-safe experiment rendering policy. The classroom never puts an
 * experiment's HTML into the main document; it wraps the page in an opaque-origin
 * sandbox iframe and prefixes this policy before the HTML reaches it.
 *
 * The policy is an unambiguous *trusted prefix*, never a string search for a
 * `<head>` or an already-present tag: a comment, attribute or script containing
 * the marker cannot suppress it or capture the insertion point. The same prefix
 * is written by the Host, so opening the file elsewhere keeps the resource limit.
 * The opaque-origin sandbox itself is the iframe's `sandbox="allow-scripts"`
 * attribute; CSP `sandbox` delivered through `<meta>` is ignored by Chrome.
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
].join('; ')

const cspTag = `<meta http-equiv="Content-Security-Policy" data-learning-classroom-csp="1" content="${experimentCsp}">`
const viewportTag = '<meta name="viewport" content="width=device-width, initial-scale=1">'

/**
 * Exact first bytes of every secured document. Nothing before this prefix is
 * trusted, and `startsWith` on this constant is unambiguous: it is markup, not a
 * substring that can be hidden in a comment.
 */
export const experimentTrustedPrefix = `<!doctype html><html><head>${cspTag}<meta charset="utf-8">${viewportTag}`

/**
 * Put the trusted prefix in front of any experiment HTML. Existing documents are
 * kept as body content; their own `<head>`/`<html>` tokens are handled by the
 * HTML parser as body-mode tokens and cannot move our policy out of the real
 * head. `headMarkup` is host-owned, escaped metadata only.
 */
export function wrapExperimentDocument(input: string, headMarkup = ''): string {
  const html = typeof input === 'string' ? input : ''
  if (html.startsWith(experimentTrustedPrefix)) return html
  return `${experimentTrustedPrefix}${headMarkup}</head><body>${html}</body></html>`
}

/** Client-side guard for existing or hand-written experiment files. */
export function ensureExperimentCsp(input: string): string {
  return wrapExperimentDocument(input)
}
