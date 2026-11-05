/**
 * Explicit proxy policy for the daily pipeline.
 *
 * Network-restricted sources (Hugging Face official API, OpenAI article pages)
 * are only reachable through a proxy the user configured. This module owns the
 * whole policy so the run stays declarative:
 *
 * - **No invented addresses**: an address comes from `HTTP_PROXY`,
 *   `HTTPS_PROXY` or `ALL_PROXY`, or from `proxy.url` in config.json. There is
 *   no built-in host and no system-proxy lookup; a machine without one simply
 *   has no proxy.
 * - **No silent direct connection**: when a source declares `useProxy`, its
 *   requests go through the proxy or the source is skipped. The run never
 *   retries it directly.
 * - **Health check first**: a run checks the proxy before touching a proxied
 *   source, so an expired subscription or a dead tunnel shows up as a skipped
 *   source with a reason instead of five timeouts.
 * - **Credentials stay out of data**: only the redacted form is written to the
 *   digest, the run record or an error message.
 *
 * Node 24 only routes `fetch` through the environment proxy when
 * `NODE_USE_ENV_PROXY=1` is set before the process starts. That switch is the
 * user's, not ours: without it a `HTTP(S)_PROXY` value is reported as
 * unusable, never silently bypassed.
 */

/** Environment variables, in priority order for an https-only pipeline. */
export const PROXY_ENV_VARS = [
  'HTTPS_PROXY',
  'https_proxy',
  'ALL_PROXY',
  'all_proxy',
  'HTTP_PROXY',
  'http_proxy',
]

export const DEFAULT_PROXY_TIMEOUT_MS = 8_000

/**
 * Where the health check looks. Hugging Face is the source that is known to be
 * blocked without a proxy, so a successful read proves the tunnel carries the
 * traffic this pipeline actually needs. Configurable, because the check must
 * follow the user's environment rather than a hard-coded provider.
 */
export const DEFAULT_PROXY_HEALTH_URL = 'https://huggingface.co/api/daily_papers?limit=1'

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const PROXY_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Normalize a proxy URL. A bare `host:port` (the form proxies print in their
 * own UI) is read as http; anything else must parse and be http(s). Returns
 * `null` for a value this pipeline cannot use.
 */
function normalizeProxyUrl(raw) {
  const text = String(raw).trim()
  if (text.length === 0) return null
  const candidate = HAS_SCHEME.test(text) ? text : `http://${text}`
  let url
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (!PROXY_PROTOCOLS.has(url.protocol) || url.hostname.length === 0) return null
  url.hash = ''
  url.search = ''
  return url.toString().replace(/\/$/, '')
}

/** The proxy address as it may be displayed: scheme, optional `***@`, host. */
export function redactProxyUrl(value) {  if (typeof value !== 'string' || value.length === 0) return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (!PROXY_PROTOCOLS.has(url.protocol) || url.hostname.length === 0) return null
  const auth = url.username || url.password ? '***@' : ''
  return `${url.protocol}//${auth}${url.host}`
}

/**
 * Resolve where the proxy address comes from.
 *
 * Returns `{ url, origin, code, error }`:
 * - `url` is the raw address for the transport (it may carry credentials);
 * - `origin` is `'env'`, `'config'` or `null`;
 * - `code` is `null` when usable, else `proxy_unconfigured` or `proxy_invalid`.
 */
export function resolveProxyUrl({ config, env = {} } = {}) {
  for (const name of PROXY_ENV_VARS) {
    const value = env?.[name]
    if (typeof value !== 'string' || value.trim().length === 0) continue
    const url = normalizeProxyUrl(value)
    if (!url) {
      return {
        url: null,
        origin: 'env',
        code: 'proxy_invalid',
        error: `${name} is not a usable http(s) proxy URL`,
      }
    }
    return { url, origin: 'env', code: null, error: null }
  }

  const configured = config?.proxy?.url
  if (typeof configured === 'string' && configured.trim().length > 0) {
    const url = normalizeProxyUrl(configured)
    if (!url) {
      return {
        url: null,
        origin: 'config',
        code: 'proxy_invalid',
        error: 'proxy.url in config.json is not a usable http(s) proxy URL',
      }
    }
    return { url, origin: 'config', code: null, error: null }
  }

  return { url: null, origin: null, code: 'proxy_unconfigured', error: null }
}

/**
 * Human-readable reason for a proxy state that is not `ok`. The same string is
 * written to the digest, the run record and the reading page, so the user reads
 * one explanation everywhere.
 */
export const PROXY_SKIP_REASONS = {
  proxy_unconfigured: '未配置代理（HTTP(S)_PROXY 或 config.json 的 proxy.url）',
  proxy_invalid: '代理地址无效',
  proxy_env_disabled: '代理来自环境变量，但未设置 NODE_USE_ENV_PROXY=1',
  proxy_transport_missing: '配置了 proxy.url，但当前进程没有代理传输层（改用 HTTP(S)_PROXY + NODE_USE_ENV_PROXY=1）',
  proxy_auth: '代理认证失败',
  proxy_timeout: '代理连接超时',
  proxy_unreachable: '代理不可达',
  proxy_http: '代理健康检查失败',
}

export function proxySkipReason(code) {
  return PROXY_SKIP_REASONS[code] ?? '代理不可用'
}

/* ------------------------------------------------------------------ */
/* Health check                                                        */
/* ------------------------------------------------------------------ */

const TIMEOUT_CODES = new Set([
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
])

function isAbort(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || TIMEOUT_CODES.has(error?.code)
}

function isAuthFailure(error) {
  return /407|proxy authentication|authentication required/i.test(String(error?.message ?? ''))
}

/** Replace the proxy address (and its credentials) in a message. */
function sanitizeMessage(message, proxyUrl) {
  let text = String(message ?? '')
  if (typeof proxyUrl !== 'string' || proxyUrl.length === 0) return text
  let parsed
  try {
    parsed = new URL(proxyUrl)
  } catch {
    return text
  }
  for (const secret of [parsed.password, parsed.username && `${parsed.username}:${parsed.password}`]) {
    if (secret) text = text.split(secret).join('***')
  }
  text = text.split(proxyUrl).join(redactProxyUrl(proxyUrl) ?? '***')
  return text
}

function clockIso(now) {
  const value = typeof now === 'function' ? now() : now
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

/**
 * Check a proxy once before the run touches a proxied source.
 *
 * The probe asks the proxy for a real page; `response.ok` is success. A 407/401
 * answer (or an error naming 407) is an authentication failure, an abort is a
 * timeout, and every other transport error is unreachable. The caller turns any
 * non-`ok` result into skipped sources instead of retrying direct.
 */
export async function checkProxyHealth({
  url,
  fetch: fetchImpl,
  healthCheckUrl = DEFAULT_PROXY_HEALTH_URL,
  timeoutMs = DEFAULT_PROXY_TIMEOUT_MS,
  now = () => new Date(),
} = {}) {
  const checkedAt = clockIso(now)
  const base = { httpStatus: null, latencyMs: null, checkedAt, healthCheckUrl }

  if (typeof url !== 'string' || url.length === 0) {
    return { status: 'unconfigured', code: 'proxy_unconfigured', error: null, ...base }
  }
  if (typeof fetchImpl !== 'function') {
    return {
      status: 'failed',
      code: 'proxy_transport_missing',
      error: '配置了代理，但当前进程没有可用于代理请求的 fetch',
      ...base,
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  if (typeof timer.unref === 'function') timer.unref()
  const started = Date.now()

  try {
    const response = await fetchImpl(healthCheckUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json, text/plain;q=0.9, */*;q=0.1' },
    })
    const latencyMs = Date.now() - started
    const httpStatus = Number(response?.status) || 0
    if (httpStatus === 407 || httpStatus === 401) {
      return {
        status: 'failed',
        code: 'proxy_auth',
        httpStatus,
        latencyMs,
        checkedAt,
        healthCheckUrl,
        error: `代理认证失败（HTTP ${httpStatus}）`,
      }
    }
    if (response?.ok !== true) {
      return {
        status: 'failed',
        code: 'proxy_http',
        httpStatus,
        latencyMs,
        checkedAt,
        healthCheckUrl,
        error: `代理健康检查返回 HTTP ${httpStatus || '?'}`,
      }
    }
    return { status: 'ok', code: null, httpStatus, latencyMs, checkedAt, healthCheckUrl, error: null }
  } catch (error) {
    const latencyMs = Date.now() - started
    if (isAbort(error)) {
      return { status: 'timeout', code: 'proxy_timeout', latencyMs, checkedAt, healthCheckUrl, error: '代理健康检查超时', httpStatus: null }
    }
    if (isAuthFailure(error)) {
      return { status: 'failed', code: 'proxy_auth', latencyMs, checkedAt, healthCheckUrl, error: '代理认证失败', httpStatus: null }
    }
    return {
      status: 'failed',
      code: 'proxy_unreachable',
      latencyMs,
      checkedAt,
      healthCheckUrl,
      httpStatus: null,
      error: sanitizeMessage(error?.message ?? error, url),
    }
  } finally {
    clearTimeout(timer)
  }
}
