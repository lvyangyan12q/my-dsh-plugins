import { constants } from 'node:fs'
import { access, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { ClassroomError } from './errors.ts'

export interface VaultProbe {
  stat(path: string): Promise<{ isDirectory(): boolean }>
  access(path: string, mode: number): Promise<void>
  realpath(path: string): Promise<string>
}

export const nodeVaultProbe: VaultProbe = {
  stat: path => stat(path),
  access: (path, mode) => access(path, mode),
  realpath: path => realpath(path),
}

/**
 * Validate a user-picked vault root. It must already exist, be a directory and
 * be writable; the canonical (symlink-resolved) absolute path is what gets saved.
 */
export async function inspectVaultRoot(input: string, probe: VaultProbe = nodeVaultProbe): Promise<string> {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new ClassroomError('vault-path-required', '请填写知识文件库目录的绝对路径。')
  }
  const absolute = resolve(input.trim())
  let info: { isDirectory(): boolean }
  try {
    info = await probe.stat(absolute)
  } catch {
    throw new ClassroomError('vault-not-found', `知识文件库目录不存在：${absolute}`)
  }
  if (!info.isDirectory()) {
    throw new ClassroomError('vault-not-directory', `知识文件库路径不是目录：${absolute}`)
  }
  try {
    await probe.access(absolute, constants.W_OK)
  } catch {
    throw new ClassroomError('vault-unwritable', `知识文件库目录不可写：${absolute}`)
  }
  try {
    return await probe.realpath(absolute)
  } catch {
    throw new ClassroomError('vault-not-found', `知识文件库目录不存在：${absolute}`)
  }
}

const drivePattern = /^[A-Za-z]:/
const uncPattern = /^[\\/]{2}/

/**
 * Validate a vault-relative file path without touching the filesystem. Rejects
 * traversal, absolute paths, drive letters, UNC paths and NUL bytes rather than
 * silently rewriting them. Returns a normalized `/`-separated relative path.
 */
export function vaultRelativePath(input: string): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new ClassroomError('vault-path-invalid', '文件路径不能为空。')
  }
  if (input.includes('\0')) {
    throw new ClassroomError('vault-path-invalid', '文件路径包含非法字符。')
  }
  const candidate = input.replaceAll('\\', '/')
  if (isAbsolute(candidate) || drivePattern.test(candidate) || uncPattern.test(candidate)) {
    throw new ClassroomError('vault-path-invalid', `文件路径必须是知识文件库内的相对路径：${input}`)
  }
  const segments = candidate.split('/')
  if (segments.some(segment => segment === '..')) {
    throw new ClassroomError('vault-path-invalid', `文件路径不能越出知识文件库根目录：${input}`)
  }
  const normalized = segments.filter(segment => segment !== '' && segment !== '.').join('/')
  if (normalized === '') {
    throw new ClassroomError('vault-path-invalid', '文件路径不能指向知识文件库根目录本身。')
  }
  return normalized
}

function outside(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  if (path === '') return false
  return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)
}

/**
 * True when two already-resolved absolute paths are the same directory or one is
 * inside the other. `path.relative` gives the platform's case rules on Windows;
 * callers must pass real paths, not client input.
 */
export function pathInside(root: string, candidate: string): boolean {
  return !outside(root, candidate)
}

function comparisonKey(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

/**
 * Resolve a relative path inside the vault and prove the real location (after
 * following symlinks/junctions) is still inside the real vault root. Escapes
 * throw; they are never clamped back into the vault.
 */
export async function resolveVaultPath(root: string, input: string, probe: VaultProbe = nodeVaultProbe): Promise<string> {
  const relativePath = vaultRelativePath(input)
  const realRoot = await probe.realpath(root).catch(() => {
    throw new ClassroomError('vault-unavailable', `知识文件库不可访问：${root}`, 409)
  })
  const target = resolve(realRoot, relativePath)
  const rootKey = comparisonKey(realRoot)
  if (outside(rootKey, comparisonKey(target))) {
    throw new ClassroomError('vault-path-invalid', `文件路径不能越出知识文件库根目录：${input}`)
  }
  // The target may not exist yet, but every existing ancestor must still
  // resolve inside the vault. A junction/symlink anywhere on the way out is
  // rejected rather than clamped back.
  let current = target
  for (;;) {
    const real = await probe.realpath(current).catch(() => undefined)
    if (real !== undefined) {
      if (outside(rootKey, comparisonKey(real))) {
        throw new ClassroomError('vault-path-invalid', `文件路径经符号链接越出知识文件库根目录：${input}`)
      }
      break
    }
    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }
  return target
}
