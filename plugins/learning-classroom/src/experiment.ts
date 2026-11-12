/**
 * Resource policy applied to the fixed trusted experiment runtime. The runtime
 * itself is trusted code; model input is only a JSON data literal. The iframe's
 * `sandbox="allow-scripts"` attribute is the opaque-origin boundary (CSP
 * `sandbox` delivered via `<meta>` is ignored by Chrome).
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
