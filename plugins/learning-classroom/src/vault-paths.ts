import { ClassroomError } from './errors.ts'

const drivePattern = /^[A-Za-z]:/
const uncPattern = /^[\\/]{2}/

/**
 * Validate a vault-relative file path without touching the filesystem or Node
 * APIs. It is shared with the browser so the same refusal copy is used on both
 * sides. Rejects traversal, absolute paths, drive letters, UNC paths and NUL
 * bytes rather than silently rewriting them. Returns a normalized `/` path.
 */
export function vaultRelativePath(input: string): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new ClassroomError('vault-path-invalid', '文件路径不能为空。')
  }
  if (input.includes('\0')) {
    throw new ClassroomError('vault-path-invalid', '文件路径包含非法字符。')
  }
  const candidate = input.replaceAll('\\', '/')
  if (candidate.startsWith('/') || drivePattern.test(candidate) || uncPattern.test(candidate)) {
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
