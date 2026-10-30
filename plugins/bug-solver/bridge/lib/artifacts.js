/**
 * run 产物链：读写 `<localPath>/.bug-solver/runs/<runId>/` 下的产物。
 *
 * 安全边界：
 * - artifact name 必须是 run 目录内的相对路径，拒绝绝对路径/`..`/盘符/空字节；
 * - 读取前 stat 并限制大小（默认 256 KiB），文本统一走调用方 redactor；
 * - result.json manifest 校验路径逃逸、branch/commit 一致性、差分大小与可选 sha256。
 *
 * 本模块不依赖 DispatchService；测试可以直接用临时目录验证。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { BridgeError, NotFoundError } from './errors.js'
import { isPathInside } from './paths.js'

export const MAX_ARTIFACT_BYTES = 256 * 1024
export const MAX_ARTIFACT_NAME_CHARS = 512
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/i

const badName = (message) => new BridgeError('artifact-invalid-name', message, { status: 400 })

export function isSafeRunId(runId) {
  return typeof runId === 'string' && RUN_ID_PATTERN.test(runId)
}

/** `<localPath>/.bug-solver/runs/<runId>`（不保证存在）。 */
export function runArtifactDir(localPath, runId) {
  if (typeof localPath !== 'string' || !isAbsolute(localPath)) {
    throw new BridgeError('artifact-no-root', '缺少本地仓库绝对路径，无法定位产物', { status: 500 })
  }
  if (!isSafeRunId(runId)) throw new BridgeError('artifact-bad-run-id', `非法 runId：${String(runId)}`, { status: 400 })
  return join(localPath, '.bug-solver', 'runs', runId)
}

/** 规整产物相对路径：统一 `/`，拒绝绝对路径、盘符、`..`、`.` 与空字节。 */
export function normalizeArtifactName(name) {
  if (typeof name !== 'string' || name.trim() === '') throw badName('缺少产物名')
  if (name.length > MAX_ARTIFACT_NAME_CHARS || name.includes('\u0000')) throw badName('产物名过长或含非法字符')
  const posix = name.replace(/\\/g, '/')
  if (isAbsolute(name) || /^[A-Za-z]:/.test(name) || posix.startsWith('/')) throw badName('产物名必须是相对路径')
  const parts = posix.split('/').filter((part) => part !== '')
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) throw badName('产物名不允许路径回退')
  return parts.join('/')
}

/** 解析产物绝对路径，并再次确认没有逃出 run 目录。 */
export function resolveArtifactPath(localPath, runId, name) {
  const dir = runArtifactDir(localPath, runId)
  const target = resolve(dir, normalizeArtifactName(name))
  if (target === dir || !isPathInside(target, dir)) throw badName('产物路径逃出 run 目录')
  return target
}

/**
 * 列出 run 目录下的全部产物（相对路径、`/` 分隔、升序）。目录不存在返回空数组。
 * @returns {string[]}
 */
export function listArtifacts(localPath, runId) {
  const root = runArtifactDir(localPath, runId)
  if (!existsSync(root)) return []
  const out = []
  const walk = (dir, prefix) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full, rel)
      else if (entry.isFile()) out.push(rel)
    }
  }
  walk(root, '')
  return out.sort()
}

/**
 * 读取一个产物：只允许 run 目录内、大小受限、文本脱敏。
 * @param {string} localPath
 * @param {string} runId
 * @param {string} name
 * @param {{ maxBytes?: number, redactor?: { redact: (value: unknown) => string } }} [options]
 */
export function readArtifact(localPath, runId, name, { maxBytes = MAX_ARTIFACT_BYTES, redactor } = {}) {
  const normalized = normalizeArtifactName(name)
  const target = resolveArtifactPath(localPath, runId, normalized)
  let stat
  try {
    stat = statSync(target)
  } catch {
    throw new NotFoundError('artifact-not-found', `没有这个产物：${normalized}`, { details: { name: normalized } })
  }
  if (!stat.isFile()) throw new NotFoundError('artifact-not-found', `不是文件：${normalized}`, { details: { name: normalized } })
  if (stat.size > maxBytes) {
    throw new BridgeError('artifact-too-large', `产物超过 ${maxBytes} 字节上限：${normalized}`, {
      status: 413,
      details: { name: normalized, size: stat.size, maxBytes },
    })
  }
  const buffer = readFileSync(target)
  const raw = buffer.toString('utf8')
  return {
    name: normalized,
    size: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    text: typeof redactor?.redact === 'function' ? redactor.redact(raw) : raw,
  }
}

/** 产物是否存在（名字非法/不存在都返回 false，不抛）。 */
export function artifactExists(localPath, runId, name) {
  try {
    return existsSync(resolveArtifactPath(localPath, runId, name))
  } catch {
    return false
  }
}

/** 桥写产物（plan/review 兜底，或页面回写的文本）；仍在 run 目录内。 */
export async function writeArtifact(localPath, runId, name, text) {
  const target = resolveArtifactPath(localPath, runId, name)
  await mkdir(dirname(target), { recursive: true })
  writeFileSync(target, typeof text === 'string' ? text : String(text ?? ''), 'utf8')
  return target
}

function readJsonManifest(text) {
  if (typeof text !== 'string' || text.trim() === '') return { error: { code: 'manifest-missing', message: 'result.json 不存在或为空' } }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: { code: 'manifest-invalid-json', message: 'result.json 不是合法 JSON' } }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: { code: 'manifest-bad-shape', message: 'result.json 必须是对象' } }
  }
  return { manifest: parsed }
}

/**
 * 校验本轮 result.json manifest。
 * 返回 `{ ok, errors, manifest, commit }`；错误不抛异常，由状态机记入 warnings/round.manifestErrors。
 * @param {{ text: string, run: any, round: number, localPath: string, eventCommit?: string | null, maxBytes?: number }} options
 */
export function validateResultManifest({ text, run, round, localPath, eventCommit = null, maxBytes = MAX_ARTIFACT_BYTES } = {}) {
  const errors = []
  if (typeof text === 'string' && Buffer.byteLength(text, 'utf8') > maxBytes) {
    return {
      ok: false,
      errors: [{ code: 'manifest-too-large', message: `result.json 超过 ${maxBytes} 字节` }],
      manifest: null,
      commit: null,
    }
  }
  const { manifest, error } = readJsonManifest(text)
  if (error) return { ok: false, errors: [error], manifest: null, commit: null }

  const nonEmpty = (value) => typeof value === 'string' && value.trim() !== ''

  if (!nonEmpty(manifest.branch)) errors.push({ code: 'branch-missing', message: 'result.json 缺少 branch' })
  else if (nonEmpty(run?.branch) && manifest.branch.trim() !== run.branch) {
    errors.push({ code: 'branch-mismatch', message: `branch 不一致：manifest=${manifest.branch} run=${run.branch}` })
  }

  const commit = nonEmpty(manifest.commit) ? manifest.commit.trim() : null
  if (!commit) errors.push({ code: 'commit-missing', message: 'result.json 缺少 commit' })
  else if (nonEmpty(eventCommit) && eventCommit.trim() !== commit) {
    errors.push({ code: 'commit-mismatch', message: `commit 不一致：manifest=${commit} event=${eventCommit}` })
  }

  const runRoot = runArtifactDir(localPath, run?.id)
  const roundDir = join(runRoot, `round-${round}`)
  let diffTarget = null
  if (!nonEmpty(manifest.diffPath)) {
    errors.push({ code: 'diff-path-missing', message: 'result.json 缺少 diffPath' })
  } else {
    try {
      const normalized = normalizeArtifactName(manifest.diffPath)
      diffTarget = resolve(runRoot, normalized)
      if (!existsSync(diffTarget)) diffTarget = resolve(roundDir, normalized)
      if (!isPathInside(diffTarget, runRoot)) {
        errors.push({ code: 'diff-path-escape', message: `diffPath 逃出 run 目录：${manifest.diffPath}` })
        diffTarget = null
      } else if (!existsSync(diffTarget)) {
        errors.push({ code: 'diff-missing', message: `diffPath 指向的文件不存在：${manifest.diffPath}` })
        diffTarget = null
      } else {
        const stat = statSync(diffTarget)
        if (!stat.isFile()) {
          errors.push({ code: 'diff-not-file', message: `diffPath 不是文件：${manifest.diffPath}` })
          diffTarget = null
        } else if (stat.size > maxBytes) {
          errors.push({ code: 'diff-too-large', message: `diff.patch 超过 ${maxBytes} 字节` })
          diffTarget = null
        }
      }
    } catch (cause) {
      const code = cause?.code === 'artifact-invalid-name' ? 'diff-path-escape' : 'diff-path-invalid'
      errors.push({ code, message: String(cause?.message ?? cause) })
      diffTarget = null
    }
  }

  if (nonEmpty(manifest.sha256)) {
    const expected = manifest.sha256.trim()
    if (!SHA256_PATTERN.test(expected)) {
      errors.push({ code: 'sha256-invalid', message: 'sha256 必须是 64 位十六进制' })
    } else if (diffTarget) {
      const actual = createHash('sha256').update(readFileSync(diffTarget)).digest('hex')
      if (actual.toLowerCase() !== expected.toLowerCase()) {
        errors.push({ code: 'sha256-mismatch', message: 'diff.patch 的 sha256 与 manifest 不一致' })
      }
    }
  }

  return { ok: errors.length === 0, errors, manifest, commit }
}

/** 仅供测试/诊断：解析真实路径（文件不存在返回 null）。 */
export function canonicalPath(path) {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}
