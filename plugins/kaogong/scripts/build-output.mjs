import { lstat, readdir, realpath, rm } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

/** Only an explicitly owned build directory may be recursively removed, after
 * a complete nofollow scan proves that neither it nor its children are links. */
export async function cleanBuildOutput(root, directory) {
  const owner = await realpath(root), target = resolve(directory), offset = relative(owner, target)
  if (!offset || isAbsolute(offset) || offset === '..' || offset.startsWith('..')) throw Error('BUILD_OUTPUT_OUTSIDE_PLUGIN')
  try { await lstat(target) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  if ((await realpath(target)).toLowerCase() !== target.toLowerCase()) throw Error('BUILD_OUTPUT_LINKED_PATH')
  const links = []
  async function scan(file) {
    const stat = await lstat(file)
    if (stat.isSymbolicLink()) { links.push(file); return }
    if (stat.isDirectory()) for (const name of await readdir(file)) await scan(resolve(file, name))
  }
  await scan(target)
  if (links.length) throw Error('BUILD_OUTPUT_HAS_LINKS')
  await rm(target, { recursive: true })
}
