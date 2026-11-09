import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installClassroom } from '../src/host.ts'
import { classroomFixture, initialState } from './support/fixture.mjs'
import { request } from './support/http.mjs'

async function exists(path) {
  try { await stat(path); return true } catch { return false }
}

async function chooseVault(fixture) {
  const result = await fixture.post({ action: 'vault-choose', path: fixture.vault })
  assert.equal(result.status, 200)
}

test('未选择知识库时创建学习空间给出可操作错误而不是裸异常', async () => {
  const fixture = await classroomFixture()
  try {
    const result = await fixture.post({ action: 'space-create', title: '线性代数' })
    assert.equal(result.status, 409)
    assert.equal(result.body.code, 'vault-unset')
    assert.match(result.body.error, /先选择.*知识文件库|知识文件库/)
  } finally {
    await fixture.close()
  }
})

test('创建学习空间落盘讲义/笔记/附件与默认笔记，重复创建幂等且不覆盖笔记', async () => {
  const fixture = await classroomFixture()
  try {
    await chooseVault(fixture)
    const created = await fixture.post({ action: 'space-create', title: '线性代数' })
    assert.equal(created.status, 200)
    assert.equal(created.body.spaces.length, 1)
    const space = created.body.spaces[0]
    assert.equal(space.title, '线性代数')
    assert.equal(space.directory, '线性代数')
    assert.equal(space.notePath, '笔记/我的笔记.md')
    assert.equal(created.body.currentSpaceId, space.id)

    const spaceRoot = join(fixture.vault, '线性代数')
    for (const folder of ['讲义', '笔记', '附件']) {
      assert.equal((await stat(join(spaceRoot, folder))).isDirectory(), true, `${folder} 应存在`)
    }
    const noteFile = join(spaceRoot, '笔记', '我的笔记.md')
    const note = await readFile(noteFile, 'utf8')
    assert.match(note, /我的笔记/)

    await writeFile(noteFile, note + '\n我自己的理解\n', 'utf8')
    const again = await fixture.post({ action: 'space-create', title: '线性代数' })
    assert.equal(again.status, 200)
    assert.equal(again.body.spaces.length, 1)
    assert.equal(again.body.spaces[0].id, space.id)
    assert.match(await readFile(noteFile, 'utf8'), /我自己的理解/)

    await fixture.restart()
    const restored = await fixture.get()
    assert.equal(restored.body.spaces.length, 1)
    assert.equal(restored.body.spaces[0].id, space.id)
    assert.equal(restored.body.currentSpaceId, space.id)
    assert.equal(restored.body.vault.status, 'ready')
  } finally {
    await fixture.close()
  }
})

test('同名目录已存在但未登记时拒绝并且不半写、不登记', async () => {
  const fixture = await classroomFixture()
  try {
    await chooseVault(fixture)
    const occupied = join(fixture.vault, '已有目录')
    await mkdir(occupied)
    await writeFile(join(occupied, '原有文件.md'), 'keep me', 'utf8')

    const result = await fixture.post({ action: 'space-create', title: '已有目录' })
    assert.equal(result.status, 409)
    assert.equal(result.body.code, 'space-directory-exists')
    assert.match(result.body.error, /已存在/)
    assert.deepEqual((await fixture.get()).body.spaces, [])
    assert.equal(await readFile(join(occupied, '原有文件.md'), 'utf8'), 'keep me')
    assert.equal((await stat(occupied)).isDirectory(), true)
  } finally {
    await fixture.close()
  }
})

test('拒绝带路径分隔符或越界片段的空间名称，不写到知识库外', async () => {
  const fixture = await classroomFixture()
  try {
    await chooseVault(fixture)
    for (const title of ['../越界', 'a/b', 'a\\b', '..', '.']) {
      const result = await fixture.post({ action: 'space-create', title })
      assert.equal(result.status, 400, `${title} 应被拒绝`)
      assert.equal(result.body.code, 'invalid-space-name')
    }
    assert.equal(await exists(join(fixture.folder, '越界')), false)
    assert.deepEqual((await fixture.get()).body.spaces, [])
  } finally {
    await fixture.close()
  }
})

test('知识库目录被外部删除后显示不可用状态，创建空间给出可操作错误', async () => {
  const fixture = await classroomFixture()
  try {
    await chooseVault(fixture)
    await rm(fixture.vault, { recursive: true, force: true })

    const state = await fixture.get()
    assert.equal(state.status, 200)
    assert.equal(state.body.vault.status, 'unavailable')
    assert.match(state.body.vault.reason, /不存在/)
    assert.match(state.body.vault.hint, /重新选择|修复/)

    const result = await fixture.post({ action: 'space-create', title: '线性代数' })
    assert.equal(result.status, 409)
    assert.equal(result.body.code, 'vault-unavailable')
    assert.match(result.body.error, /不存在|不可访问/)
  } finally {
    await fixture.close()
  }
})

test('保存状态失败时回滚已创建的空间文件夹，不留半写结果', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'learning-classroom-rollback-'))
  const vault = join(folder, '知识库')
  await mkdir(vault)
  const state = structuredClone(initialState)
  let writes = 0
  const store = {
    read: () => structuredClone(state),
    write: async next => {
      writes += 1
      if (writes >= 2) throw new Error('磁盘已满')
      Object.assign(state, next)
    },
    close: async () => {},
  }
  const app = installClassroom({ store })
  try {
    const chosen = await request(app.handle, { method: 'POST', body: { action: 'vault-choose', path: vault } })
    assert.equal(chosen.status, 200)

    const result = await request(app.handle, { method: 'POST', body: { action: 'space-create', title: '回滚测试' } })
    assert.equal(result.status, 500)
    assert.equal(result.body.code, 'space-create-failed')
    assert.equal(await exists(join(vault, '回滚测试')), false)
    assert.deepEqual((await readdir(vault)).filter(name => name.startsWith('.learning-classroom-')), [])
    assert.deepEqual(state.spaces, [])
  } finally {
    await app.close()
    await rm(folder, { recursive: true, force: true })
  }
})

test('切换当前学习空间并跨重启保留选择', async () => {
  const fixture = await classroomFixture()
  try {
    await chooseVault(fixture)
    const first = (await fixture.post({ action: 'space-create', title: '第一课' })).body
    const second = (await fixture.post({ action: 'space-create', title: '第二课' })).body
    assert.equal(second.currentSpaceId !== first.currentSpaceId, true)

    const opened = await fixture.post({ action: 'space-open', spaceId: first.currentSpaceId })
    assert.equal(opened.status, 200)
    assert.equal(opened.body.currentSpaceId, first.currentSpaceId)

    await fixture.restart()
    assert.equal((await fixture.get()).body.currentSpaceId, first.currentSpaceId)

    const unknown = await fixture.post({ action: 'space-open', spaceId: '不存在' })
    assert.equal(unknown.status, 409)
    assert.equal(unknown.body.code, 'space-not-found')
  } finally {
    await fixture.close()
  }
})
