import { Readable } from 'node:stream'

/** Minimal HTTP exchange against the plugin's public `/api/learning-classroom` handler. */
export async function request(handle, { method = 'GET', body, headers = {} } = {}) {
  let status = 0, payload = '', responseHeaders = {}
  const req = Readable.from(body === undefined ? [] : [typeof body === 'string' ? body : JSON.stringify(body)])
  req.method = method
  req.headers = { 'content-type': 'application/json', ...headers }
  req.url = '/api/learning-classroom'
  const res = {
    setHeader(name, value) { responseHeaders[name] = value },
    writeHead(code, extra = {}) { status = code; Object.assign(responseHeaders, extra) },
    end(chunk) { if (chunk !== undefined) payload += typeof chunk === 'string' ? chunk : chunk.toString('utf8') },
  }
  await handle(req, res)
  let json
  try { json = payload ? JSON.parse(payload) : undefined } catch { json = undefined }
  return { status, headers: responseHeaders, body: json, text: payload }
}
