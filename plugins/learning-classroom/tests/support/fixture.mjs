import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installClassroom } from '../../src/host.ts'
import { createFileStore } from './file-store.mjs'
import { request } from './http.mjs'

export const initialState = { schemaVersion: 1, vaultPath: null, spaces: [], currentSpaceId: null }

/** Real temporary vault plus a restartable Host app, without a DSH runtime. */
export async function classroomFixture(options = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'learning-classroom-host-'))
  const vault = join(folder, '知识库')
  await mkdir(vault)
  const stateFile = join(folder, 'state.json')
  let app
  const open = async () => {
    app = installClassroom({ store: await createFileStore(stateFile, initialState), ...options })
    return app
  }
  await open()
  return {
    folder,
    vault,
    stateFile,
    get app() { return app },
    restart: async () => { await app.close(); await open() },
    get: () => request(app.handle, { method: 'GET' }),
    post: body => request(app.handle, { method: 'POST', body }),
    close: async () => { await app.close(); await rm(folder, { recursive: true, force: true }) },
  }
}
