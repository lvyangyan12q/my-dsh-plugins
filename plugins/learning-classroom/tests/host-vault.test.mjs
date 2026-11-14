import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { installClassroom } from '../src/host.ts'
import { createFileStore } from './support/file-store.mjs'
import { request } from './support/http.mjs'
import { classroomFixture, initialState } from './support/fixture.mjs'

test('未选择知识库时返回可操作空状态，选择已存在目录后重启仍保留', async () => {
  const fixture = await classroomFixture()
  try {
    const empty = await fixture.get()
    assert.equal(empty.status, 200)
    assert.deepEqual(empty.body.vault, { path: null, status: 'unset', reason: null, hint: '请选择一个已存在的本地目录作为知识文件库。' })
    assert.deepEqual(empty.body.spaces, [])
    assert.equal(empty.body.currentSpaceId, null)

    const chosen = await fixture.post({ action: 'vault-choose', path: fixture.vault })
    assert.equal(chosen.status, 200)
    const canonical = await realpath(fixture.vault)
    assert.equal(chosen.body.vault.path, canonical)
    assert.equal(chosen.body.vault.status, 'ready')

    const saved = JSON.parse(await readFile(fixture.stateFile, 'utf8'))
    assert.equal(saved.vaultPath, canonical)
    assert.deepEqual(saved.spaces, [])

    await fixture.restart()
    const restored = await fixture.get()
    assert.equal(restored.body.vault.path, canonical)
    assert.equal(restored.body.vault.status, 'ready')
  } finally {
    await fixture.close()
  }
})

test('拒绝不存在、不是目录和不可写的知识库路径并说明原因', async () => {
  const fixture = await classroomFixture()
  try {
    const missing = await fixture.post({ action: 'vault-choose', path: join(fixture.folder, '不存在') })
    assert.equal(missing.status, 400)
    assert.match(missing.body.error, /不存在/)
    assert.equal(missing.body.code, 'vault-not-found')

    const file = join(fixture.folder, '普通文件.txt')
    await writeFile(file, 'not a folder')
    const notDirectory = await fixture.post({ action: 'vault-choose', path: file })
    assert.equal(notDirectory.status, 400)
    assert.equal(notDirectory.body.code, 'vault-not-directory')
    assert.match(notDirectory.body.error, /不是目录/)

    const denied = installClassroom({
      store: await createFileStore(join(fixture.folder, 'denied.json'), initialState),
      probe: { stat: async () => ({ isDirectory: () => true }), access: async () => { throw new Error('EACCES') }, realpath: async () => fixture.vault },
    })
    try {
      const result = await request(denied.handle, { method: 'POST', body: { action: 'vault-choose', path: fixture.vault } })
      assert.equal(result.status, 400)
      assert.equal(result.body.code, 'vault-unwritable')
      assert.match(result.body.error, /不可写/)
    } finally {
      await denied.close()
    }
  } finally {
    await fixture.close()
  }
})
