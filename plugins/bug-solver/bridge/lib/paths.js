/**
 * 路径安全边界（唯一实现）：
 * 输入路径必须是绝对路径、存在、是目录，realpath 后必须落在某个 allowedRoot 内。
 * 前缀比较按路径分段，避免 C:\repo-other 冒充 C:\repo；Windows 下大小写不敏感。
 * host.js 的纵深防御也复用 `isPathInside`，避免两份大小写/分段规则。
 */
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, sep } from 'node:path'
import { FieldError } from './errors.js'

const CASE_INSENSITIVE = process.platform === 'win32'

function fieldError(field, code, message) {
  return new FieldError(field, code, message)
}

function normalizeForCompare(value) {
  return CASE_INSENSITIVE ? value.toLowerCase() : value
}

/**
 * candidate 是否等于 root 或位于 root 之下（按路径分段；win32 大小写不敏感）。
 * @param {string} candidate
 * @param {string} root
 * @returns {boolean}
 */
export function isPathInside(candidate, root) {
  if (typeof candidate !== 'string' || typeof root !== 'string') return false
  const a = normalizeForCompare(candidate)
  const b = normalizeForCompare(root)
  if (a === b) return true
  return a.startsWith(b.endsWith(sep) ? b : b + sep)
}

/** 规范化配置的 allowedRoots；任一 root 不合法都视为配置错误（fails closed）。 */
export function normalizeAllowedRoots(allowedRoots, field = 'allowedRoots') {
  if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) {
    throw fieldError(field, 'allowed-roots-not-configured', 'allowedRoots 未配置：拒绝任何派发路径')
  }
  return allowedRoots.map((root) => {
    if (typeof root !== 'string' || root.trim() === '' || !isAbsolute(root)) {
      throw fieldError(field, 'bad-allowed-root', `allowedRoots 必须是绝对路径：${String(root)}`)
    }
    let resolved
    try {
      resolved = realpathSync(root)
    } catch {
      throw fieldError(field, 'bad-allowed-root', `allowedRoots 路径不存在：${root}`)
    }
    if (!statSync(resolved).isDirectory()) {
      throw fieldError(field, 'bad-allowed-root', `allowedRoots 必须是目录：${root}`)
    }
    return resolved
  })
}

/**
 * 校验 draft.project.localPath，返回 canonical（realpath）路径。
 * @param {unknown} input
 * @param {string[]} allowedRoots
 * @param {string} [field]
 * @returns {string}
 */
export function resolveAllowedPath(input, allowedRoots, field = 'project.localPath') {
  if (typeof input !== 'string' || input.trim() === '') {
    throw fieldError(field, 'local-path-missing', '缺少本地仓库路径')
  }
  if (!isAbsolute(input)) {
    throw fieldError(field, 'local-path-not-absolute', `本地仓库路径必须是绝对路径：${input}`)
  }
  const roots = normalizeAllowedRoots(allowedRoots)
  let resolved
  try {
    resolved = realpathSync(input)
  } catch {
    throw fieldError(field, 'local-path-not-found', `本地仓库路径不存在：${input}`)
  }
  if (!statSync(resolved).isDirectory()) {
    throw fieldError(field, 'local-path-not-directory', `本地仓库路径必须是目录：${input}`)
  }
  if (!roots.some((root) => isPathInside(resolved, root))) {
    throw fieldError(field, 'local-path-outside-allowed-roots', `本地仓库路径不在 allowedRoots 内：${input}`)
  }
  return resolved
}
