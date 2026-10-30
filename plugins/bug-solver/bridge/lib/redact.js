/**
 * 桥侧脱敏器：所有对外文本（messages、错误信息、prompt）都走同一个 redact()。
 * 只做保守的模式替换，不解析结构化数据；宁可多脱一点，也不让凭据进入 UI/日志/prompt。
 */

const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g
const BEARER_CREDENTIAL = /(\bauthorization\s*[:=]\s*(?:bearer|basic)\s+)\S+/gi
const URL_CREDENTIAL = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)([^\s/@]+)(@)/gi
const SECRET_KEYS = 'password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token|密码|口令|私钥'
const QUOTED_SECRET = new RegExp(`((?:${SECRET_KEYS})\\s*["']?\\s*[:：=]\\s*)(["'])[^"'\\n]*?\\2`, 'gi')
const BARE_SECRET = new RegExp(`((?:${SECRET_KEYS})\\s*["']?\\s*[:：=]\\s*)[^\\s,;，；"'}]+`, 'gi')

const REDACTED = '***'

/**
 * @param {{ extraPatterns?: Array<{ pattern: RegExp, replacement: string }> }} [options]
 * @returns {{ redact: (value: unknown) => string }}
 */
export function createRedactor(options = {}) {
  const extraPatterns = Array.isArray(options.extraPatterns) ? options.extraPatterns : []

  function redact(value) {
    if (value === null || value === undefined) return ''
    let text = typeof value === 'string' ? value : String(value)
    if (!text) return text
    text = text.replace(PRIVATE_KEY_BLOCK, '[REDACTED PRIVATE KEY]')
    text = text.replace(BEARER_CREDENTIAL, `$1${REDACTED}`)
    text = text.replace(URL_CREDENTIAL, `$1${REDACTED}$3`)
    text = text.replace(QUOTED_SECRET, `$1${REDACTED}`)
    text = text.replace(BARE_SECRET, `$1${REDACTED}`)
    for (const { pattern, replacement } of extraPatterns) text = text.replace(pattern, replacement)
    return text
  }

  return { redact }
}
