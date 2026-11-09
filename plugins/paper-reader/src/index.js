/**
 * dsh-paper-reader host half.
 *
 * Serves the data the daily agent writes:
 *   GET /api/paper-reader/index           -> which days exist (newest first)
 *   GET /api/paper-reader/status          -> the latest run record, sanitized
 *   GET /api/paper-reader/digest/<date>   -> one stored day
 *   GET /api/paper-reader/digest          -> legacy single-file digest
 *   GET /api/paper-reader/health          -> liveness
 *
 * Day files live at `$DSH_HOME/paper-reader/digest/YYYY-MM-DD.json` with the
 * index at `$DSH_HOME/paper-reader/index.json` (see src/storage.js). The legacy
 * `digest.json` and the bundled sample stay readable: the page uses them when
 * no index exists yet, so a fresh install still renders immediately.
 *
 * Reading is side-effect free: no route seeds, mutates, or creates user data.
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_DAY_BYTES, readDayDigest, readIndex } from './storage.js'
import { validateDigest } from './shared/schema.js'
import { readRunStatus } from './status.js'

export const name = 'dsh-paper-reader'
export const inject = ['webServer']

const INDEX_ROUTE = '/api/paper-reader/index'
const STATUS_ROUTE = '/api/paper-reader/status'
const DIGEST_ROUTE = '/api/paper-reader/digest'
// The web server matches a prefix as `p` or `p/<anything>`; a trailing slash
// would become `p//<anything>` and miss every real date URL.
const DIGEST_DATE_PREFIX = DIGEST_ROUTE
const HEALTH_ROUTE = '/api/paper-reader/health'
const SAMPLE_PATH = fileURLToPath(new URL('../sample/digest.json', import.meta.url))

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

/** The reader data directory that holds `index.json` and `digest/`. */
function resolveDataRoot(ctx) {
  return join(resolveDshHome(ctx), 'paper-reader')
}

/** Absolute path of the legacy digest the daily agent wrote before day files. */
function resolveDigestPath(ctx) {
  return join(resolveDataRoot(ctx), 'digest.json')
}

/**
 * Contract check: v1 digests stay readable, v2 items must declare their
 * `sourceLanguage` and pair every translatable field. The first problem is
 * reported back to the caller so a broken file is debuggable.
 */
function digestProblem(value) {
  const problems = validateDigest(value)
  return problems.length > 0 ? problems[0] : null
}

/**
 * Read the legacy single-file digest, or fall back to the bundled sample.
 * A present but broken file answers an explicit error instead of silently
 * presenting stale sample content as the user's list.
 */
async function readLegacyDigest(ctx) {
  const path = resolveDigestPath(ctx)
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    const sample = JSON.parse(await readFile(SAMPLE_PATH, 'utf8'))
    return { ...sample, demo: true, digestPath: path }
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_DAY_BYTES) {
    throw Object.assign(new Error('digest.json is larger than 8 MiB'), { status: 413 })
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw Object.assign(new Error('digest.json is not valid JSON'), { status: 422 })
  }
  const problem = digestProblem(parsed)
  if (problem) {
    throw Object.assign(new Error(`digest.json does not match the paper-reader schema: ${problem}`), { status: 422 })
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

/** GET/HEAD + admission guard shared by every data route. */
async function guard(ctx, req, res, run) {
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
    const body = await run()
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end()
      return
    }
    json(res, 200, body)
  } catch (error) {
    json(res, error?.status ?? 500, {
      error: error?.code ?? 'digest_unavailable',
      message: String(error?.message ?? error),
    })
  }
}

/** The date part of a by-date request, or null when the shape is wrong. */
function requestedDate(req) {
  let pathname
  try {
    pathname = new URL(req.url ?? '', 'http://localhost').pathname
  } catch {
    return null
  }
  const base = `${DIGEST_ROUTE}/`
  if (!pathname.startsWith(base)) return null
  const rest = pathname.slice(base.length)
  return rest.length > 0 && !rest.includes('/') ? decodeURIComponent(rest) : null
}

/** Register the index, run status, by-date digest, legacy digest and health routes. */
export function apply(ctx) {
  const dataRoot = () => resolveDataRoot(ctx)

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
      path: INDEX_ROUTE,
      handler: (req, res) => guard(ctx, req, res, async () => {
        let index
        let missing
        try {
          ({ index, missing } = await readIndex({ root: dataRoot() }))
        } catch (error) {
          // Keep the public error code stable; the message carries the detail.
          throw Object.assign(new Error(String(error?.message ?? error)), {
            status: error?.status ?? 500,
            code: 'index_unavailable',
          })
        }
        return {
          schemaVersion: index?.schemaVersion ?? 2,
          retentionDays: index?.retentionDays ?? 30,
          updatedAt: index?.updatedAt ?? null,
          days: index?.days ?? [],
          missing,
          demo: false,
          indexPath: join(dataRoot(), 'index.json'),
        }
      }),
    }),
    'dsh-paper-reader: index route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: STATUS_ROUTE,
      handler: (req, res) => guard(ctx, req, res, async () => {
        try {
          return await readRunStatus({ root: dataRoot() })
        } catch (error) {
          // Status is advisory: the client shows a notice and keeps the last
          // readable digest. Name the failure without leaking a path or cause.
          throw Object.assign(new Error(String(error?.message ?? error)), {
            status: error?.status ?? 500,
            code: 'status_unavailable',
          })
        }
      }),
    }),
    'dsh-paper-reader: run status route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: DIGEST_DATE_PREFIX,
      handler: (req, res) => guard(ctx, req, res, async () => {
        const date = requestedDate(req)
        // readDayDigest answers 400 for a malformed date; an empty or nested
        // path never reaches it.
        if (!date) {
          throw Object.assign(new Error('a date is required: /api/paper-reader/digest/YYYY-MM-DD'), {
            status: 400,
            code: 'digest_invalid_date',
          })
        }
        const { digest, path, bytes } = await readDayDigest({ root: dataRoot(), date })
        return { ...digest, demo: false, digestPath: path, bytes }
      }),
    }),
    'dsh-paper-reader: by-date digest route',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: DIGEST_ROUTE,
      handler: (req, res) => guard(ctx, req, res, () => readLegacyDigest(ctx)),
    }),
    'dsh-paper-reader: legacy digest route',
  )
}
