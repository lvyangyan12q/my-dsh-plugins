/**
 * 窗口2 的 `data/ssh-config.json`（version 2）读写：
 * - 桥从 `projects[].localPath` 合并 allowedRoots，避免「窗口2 配了路径但 start 一律 422」；
 * - 确认页补的 localPath / serviceMap 经 `/writeback` 校验后原子写回；
 * - 只写这个配置文件的指定字段，不碰 connections/links 等其他数据。
 */
import { createHash } from 'node:crypto'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { BridgeError, FieldError } from './errors.js'

export const SSH_CONFIG_VERSION = 2
export const MAX_SSH_CONFIG_BYTES = 1024 * 1024

/** 配置里声明的 ssh-config 路径：显式 sshConfigPath > projectDir/data > 进程 cwd/data（文件存在才用）。 */
export function resolveSshConfigPath(config = {}) {
  if (typeof config.sshConfigPath === 'string' && config.sshConfigPath.trim() !== '') return config.sshConfigPath.trim()
  if (typeof config.projectDir === 'string' && config.projectDir.trim() !== '') {
    return join(config.projectDir.trim(), 'data', 'ssh-config.json')
  }
  // `dsh web` 通常从工作台项目目录启动；只在文件确实存在时采用，避免猜错目录。
  const cwdPath = join(process.cwd(), 'data', 'ssh-config.json')
  return existsSync(cwdPath) ? cwdPath : null
}

/**
 * 读取 ssh-config；文件不存在返回 null，损坏/超限明确报错。
 * @param {string} file
 */
export async function readSshConfig(file) {
  if (typeof file !== 'string' || file.trim() === '') return null
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (cause) {
    if (cause?.code === 'ENOENT') return null
    throw new BridgeError('ssh-config-read-failed', `读取 ssh-config 失败：${cause?.message ?? cause}`, {
      status: 500,
      details: { path: file },
    })
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_SSH_CONFIG_BYTES) {
    throw new BridgeError('ssh-config-too-large', `ssh-config 超过 ${MAX_SSH_CONFIG_BYTES} 字节`, {
      status: 500,
      details: { path: file },
    })
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BridgeError('ssh-config-corrupt', `ssh-config 不是合法 JSON：${file}`, {
      status: 500,
      details: { path: file },
    })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BridgeError('ssh-config-bad-shape', `ssh-config 必须是 JSON 对象：${file}`, { status: 500 })
  }
  return parsed
}

/** 配置里所有非空 localPath（原样，不校验）。 */
export function localPathsOf(config) {
  const projects = Array.isArray(config?.projects) ? config.projects : []
  return projects
    .map((project) => (typeof project?.localPath === 'string' ? project.localPath.trim() : ''))
    .filter(Boolean)
}

/** localPath → 已存在目录的 realpath 列表（去重；不合法/不存在就跳过）。 */
export function allowedRootsFromSshConfig(config) {
  const roots = []
  for (const raw of localPathsOf(config)) {
    if (!isAbsolute(raw)) continue
    try {
      const resolved = realpathSync(raw)
      if (statSync(resolved).isDirectory()) roots.push(resolved)
    } catch {
      // 窗口2 里可能存了尚未拉取的仓库；跳过而不是让整个桥失败。
    }
  }
  return [...new Set(roots)]
}

/** 读取配置并解析 allowedRoots；任何读取/解析失败都降级为空（不阻断 start 的其他校验）。 */
export async function readAllowedRootsFromConfig(file) {
  try {
    return allowedRootsFromSshConfig(await readSshConfig(file))
  } catch {
    return []
  }
}

/**
 * 校验窗口2/确认页新增的本地仓库路径：绝对、存在、是目录、是 git 仓库。
 * @param {unknown} input
 * @param {{ requireGit?: boolean, field?: string }} [options]
 */
export function validateRepoPath(input, { requireGit = true, field = 'localPath' } = {}) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new FieldError(field, 'local-path-missing', '缺少本地仓库路径')
  }
  if (!isAbsolute(input)) {
    throw new FieldError(field, 'local-path-not-absolute', `本地仓库路径必须是绝对路径：${input}`)
  }
  let resolved
  try {
    resolved = realpathSync(input)
  } catch {
    throw new FieldError(field, 'local-path-not-found', `本地仓库路径不存在：${input}`)
  }
  if (!statSync(resolved).isDirectory()) {
    throw new FieldError(field, 'local-path-not-directory', `本地仓库路径必须是目录：${input}`)
  }
  if (requireGit && !existsSync(join(resolved, '.git'))) {
    throw new FieldError(field, 'not-a-git-repo', '本地仓库路径不是 git 仓库')
  }
  return resolved
}

const nonEmpty = (value) => typeof value === 'string' && value.trim() !== ''
const matchSignature = (match) =>
  [...new Set(match.map((item) => String(item).trim().toLowerCase()).filter(Boolean))].sort().join('\u0000')

function normalizeMapping(entry, projectIds) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new FieldError('serviceMap', 'service-map-invalid', 'serviceMap 项必须是对象')
  }
  const match = Array.isArray(entry.match)
    ? entry.match.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : []
  if (match.length === 0) throw new FieldError('serviceMap', 'service-map-match-required', 'serviceMap 至少需要一条匹配关键字')
  const projectId = nonEmpty(entry.projectId) ? entry.projectId.trim() : ''
  if (!projectId) throw new FieldError('serviceMap', 'service-map-project-required', 'serviceMap 缺少 projectId')
  if (!projectIds.has(projectId)) {
    throw new FieldError('serviceMap', 'service-map-project-unknown', `serviceMap 指向不存在的项目：${projectId}`)
  }
  const normalized = { match, projectId }
  if (nonEmpty(entry.container)) normalized.container = entry.container.trim()
  return normalized
}

/**
 * 生成写回后的配置（纯函数）：只更新目标项目的 localPath 与 serviceMap。
 * @param {any} config
 * @param {{ projectId: string, localPath?: string, serviceMap?: any[] }} patch
 */
export function applyWriteback(config, { projectId, localPath, serviceMap } = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new BridgeError('ssh-config-bad-shape', 'ssh-config 必须是 JSON 对象', { status: 500 })
  }
  if (!nonEmpty(projectId)) throw new FieldError('projectId', 'project-id-required', '缺少项目 ID')
  const next = structuredClone(config)
  next.version = SSH_CONFIG_VERSION
  if (!Array.isArray(next.projects)) next.projects = []
  if (!Array.isArray(next.serviceMap)) next.serviceMap = []
  const project = next.projects.find((item) => item && item.id === projectId)
  if (!project) throw new FieldError('projectId', 'project-not-found', `窗口2 没有这个项目：${projectId}`)

  const updated = {}
  if (localPath !== undefined) {
    project.localPath = validateRepoPath(localPath)
    updated.localPath = project.localPath
  }

  if (serviceMap !== undefined) {
    if (!Array.isArray(serviceMap)) throw new FieldError('serviceMap', 'service-map-invalid', 'serviceMap 必须是数组')
    const projectIds = new Set(next.projects.map((item) => item?.id).filter(Boolean))
    const incoming = serviceMap.map((entry) => normalizeMapping(entry, projectIds))
    for (const mapping of incoming) {
      const signature = matchSignature(mapping.match)
      const existingIndex = next.serviceMap.findIndex(
        (item) => Array.isArray(item?.match) && matchSignature(item.match) === signature,
      )
      if (existingIndex >= 0) {
        const existing = next.serviceMap[existingIndex]
        if (existing.projectId !== mapping.projectId) {
          throw new FieldError(
            'serviceMap',
            'service-map-duplicate',
            `匹配关键字已被项目 ${existing.projectId} 使用：${mapping.match.join(', ')}`,
          )
        }
        next.serviceMap[existingIndex] = mapping
      } else {
        next.serviceMap.push(mapping)
      }
    }
    updated.serviceMapCount = next.serviceMap.length
  }

  const body = JSON.stringify(next, null, 2)
  return { config: next, updated, sha256: createHash('sha256').update(body).digest('hex') }
}

/** 原子写回 ssh-config。 */
export async function writeSshConfig(file, config) {
  if (typeof file !== 'string' || file.trim() === '') {
    throw new BridgeError('ssh-config-path-missing', '未配置 ssh-config 路径（sshConfigPath/projectDir）', { status: 503 })
  }
  await mkdir(dirname(file), { recursive: true })
  const body = JSON.stringify(config, null, 2)
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(tmp, body, 'utf8')
    await rename(tmp, file)
  } finally {
    await rm(tmp, { force: true }).catch(() => {})
  }
  return { path: file, bytes: Buffer.byteLength(body, 'utf8') }
}
