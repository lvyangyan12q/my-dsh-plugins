/**
 * dsh-paper-reader host half.
 *
 * Serves the digest the daily agent writes:
 *   GET /api/paper-reader/digest  -> the latest digest JSON
 *   GET /api/paper-reader/health  -> liveness
 *
 * The digest lives at `$DSH_HOME/paper-reader/digest.json`. When that file is
 * absent the bundled sample answers with `demo: true`, so a fresh install
 * renders immediately. Reading is side-effect free: the route never seeds,
 * mutates, or creates the user file.
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-paper-reader'
export const inject = ['webServer']

const DIGEST_ROUTE = '/api/paper-reader/digest'
const HEALTH_ROUTE = '/api/paper-reader/health'
const SAMPLE_PATH = fileURLToPath(new URL('../sample/digest.json', import.meta.url))
const MAX_BYTES = 8 * 1024 * 1024

/** Write one JSON response with no-store caching. */
function json(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

/** Resolve the DSH home from the profile directory, then the environment. */
function resolveDshHome(ctx) {
  try {
    const profile = ctx.get?.('profileContext')
    const dir = profile?.dir
    if (typeof dir === 'string' && isAbsolute(dir)) return dirname(dirname(dir))
  } catch {
    // Fall through to the environment-derived home.
  }
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** Absolute path of the digest the daily agent writes. */
function resolveDigestPath(ctx) {
  return join(resolveDshHome(ctx), 'paper-reader', 'digest.json')
}

/** Minimal structural check: the client needs days -> items and each item id. */
function isValidDigest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (!Array.isArray(value.days)) return false
  for (const day of value.days) {
    if (!day || typeof day !== 'object' || typeof day.date !== 'string' || !Array.isArray(day.items)) return false
    for (const item of day.items) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !Array.isArray(item.blocks)) return false
    }
  }
  return true
}

/**
 * Read the user's digest, or fall back to the bundled sample.
 * A present but broken file answers an explicit error instead of silently
 * presenting stale sample content as the user's list.
 */
async function readDigest(ctx) {
  const path = resolveDigestPath(ctx)
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    const sample = JSON.parse(await readFile(SAMPLE_PATH, 'utf8'))
    return { ...sample, demo: true, digestPath: path }
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    throw Object.assign(new Error('digest.json is larger than 8 MiB'), { status: 413 })
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw Object.assign(new Error('digest.json is not valid JSON'), { status: 422 })
  }
  if (!isValidDigest(parsed)) {
    throw Object.assign(new Error('digest.json does not match the paper-reader schema'), { status: 422 })
  }
  return { ...parsed, demo: false, digestPath: path }
}

/** Apply the host browser-session admission when the runtime provides it. */
function admissionStatus(ctx, req) {
  let connection
  try {
    connection = ctx.get?.('connection')
  } catch {
    connection = undefined
  }
  if (!connection || typeof connection.admit !== 'function') return null
  const result = connection.admit(req)
  if (result && typeof result === 'object' && 'rejection' in result) return result.rejection || 403
  return null
}

/** Register the digest and health routes on the Web server. */
export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: HEALTH_ROUTE,
      handler: (_req, res) => json(res, 200, { ok: true, plugin: name }),
    }),
    'dsh-paper-reader: health route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: DIGEST_ROUTE,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          json(res, 405, { error: 'method_not_allowed' })
          return
        }
        const rejected = admissionStatus(ctx, req)
        if (rejected) {
          json(res, rejected, { error: 'forbidden' })
          return
        }
        try {
          const digest = await readDigest(ctx)
          if (req.method === 'HEAD') {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end()
            return
          }
          json(res, 200, digest)
        } catch (error) {
          json(res, error?.status ?? 500, {
            error: 'digest_unavailable',
            message: String(error?.message ?? error),
          })
        }
      },
    }),
    'dsh-paper-reader: digest route',
  )
}
