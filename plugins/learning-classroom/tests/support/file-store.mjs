import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Test adapter for the Host state seam. It keeps the same contract as the real
 * `learning_classroom` storage domain adapter: durable read/write of navigation
 * state only, with no lecture or note content.
 */
export async function createFileStore(file, initial) {
  let state
  try {
    state = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    state = structuredClone(initial)
  }
  let tail = Promise.resolve()
  return {
    read: () => structuredClone(state),
    write: (next) => {
      const task = tail.then(async () => {
        await mkdir(dirname(file), { recursive: true })
        const staging = `${file}.${process.pid}.${Date.now()}.tmp`
        await writeFile(staging, JSON.stringify(next), 'utf8')
        await rename(staging, file).catch(async (error) => {
          await rm(staging, { force: true })
          throw error
        })
        state = structuredClone(next)
      })
      tail = task.catch(() => {})
      return task
    },
    close: async () => { await tail },
  }
}
