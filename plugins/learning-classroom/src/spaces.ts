import { join } from 'node:path'
import { ClassroomError } from './errors.ts'

export const defaultNotePath = '笔记/我的笔记.md'
export const spaceFolders = ['讲义', '笔记', '附件'] as const
export const defaultNoteContent = '# 我的笔记\n\n'

const illegal = /[<>:"|?*\u0000-\u001f]/g
const windowsReserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/**
 * Derive a filesystem folder name from a learning-space title. Path
 * separators and traversal fragments are rejected (not silently rewritten):
 * the title is user-facing, while the folder name is a path.
 */
export function spaceDirectoryName(title: string): string {
  const trimmed = typeof title === 'string' ? title.trim() : ''
  if (trimmed === '') {
    throw new ClassroomError('invalid-space-name', '学习空间名称不能为空。')
  }
  if (trimmed === '.' || trimmed === '..' || /[\\/]/.test(trimmed)) {
    throw new ClassroomError('invalid-space-name', `学习空间名称不能包含路径分隔符或越界片段：${title}`)
  }
  let name = trimmed
    .normalize('NFC')
    .replace(illegal, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.\s]+|[-.\s]+$/g, '')
  if (name.length > 60) name = name.slice(0, 60).replace(/[-.\s]+$/g, '')
  if (name === '' || name === '.' || name === '..') {
    throw new ClassroomError('invalid-space-name', `学习空间名称无法生成有效文件夹名：${title}`)
  }
  if (windowsReserved.test(name)) {
    throw new ClassroomError('invalid-space-name', `学习空间名称是系统保留名，请换一个：${title}`)
  }
  return name
}

/**
 * Absolute folder of one registered learning space inside the vault. The
 * browser needs it to create its teacher Session on the Host; the directory
 * value comes from stored navigation state, so containment is re-checked here
 * instead of trusting it.
 * @param root - canonical vault root.
 * @param directory - stored space folder name.
 * @returns the containment-checked absolute folder, or null when the stored name is not a plain folder name.
 */
export function spaceCwdPath(root: string, directory: string): string | null {
  if (typeof directory !== 'string' || directory === '' || directory === '.' || directory === '..') return null
  if (/[\\/]/.test(directory)) return null
  return join(root, directory)
}
