import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import { classroomFixture } from './support/fixture.mjs'
import { classroomStateSchema, emptyClassroomState } from '../src/state.ts'
import { spaceCwdPath } from '../src/spaces.ts'

async function chooseVault(fixture) {
  const result = await fixture.post({ action: 'vault-choose', path: fixture.vault })
  assert.equal(result.status, 200)
}

test('旧状态没有会话绑定位时按未绑定读取', () => {
  const parsed = classroomStateSchema.parse({
    ...emptyClassroomState(),
    vaultPath: '/知识库',
    spaces: [{ id: 'space-1', title: '线性代数', directory: '线性代数', notePath: '笔记/我的笔记.md', createdAt: '2026-11-09T00:00:00.000Z' }],
  })
  assert.equal(parsed.spaces[0].sessionId, null)
})

test('老师会话工作目录只由知识库根与纯文件夹名组成', () => {
  assert.equal(spaceCwdPath('/知识库', '线性代数'), join('/知识库', '线性代数'))
  for (const directory of ['', '.', '..', '../越界', 'a/b', 'a\\b']) {
    assert.equal(spaceCwdPath('/知识库', directory), null, `${JSON.stringify(directory)} 不应生成工作目录`)
  }
})

test('学习空间视图给出会话绑定位与老师会话工作目录，未打开时为空', async () => {
  const fixture = await classroomFixture()
  try {
    await chooseVault(fixture)
    const created = await fixture.post({ action: 'space-create', title: '线性代数' })
    assert.equal(created.status, 200)
    const space = created.body.spaces[0]
    assert.equal(space.sessionId, null)
    assert.equal(space.cwd, join(fixture.vault, '线性代数'))

    const loaded = await fixture.get()
    assert.equal(loaded.body.spaces[0].sessionId, null)
    assert.equal(loaded.body.spaces[0].cwd, join(fixture.vault, '线性代数'))
  } finally {
    await fixture.close()
  }
})

test('session-open 按学习空间保存会话绑定，切换空间与重启都不串会话', async () => {
  const fixture = await classroomFixture()
  try {
    await chooseVault(fixture)
    const first = (await fixture.post({ action: 'space-create', title: '第一课' })).body
    const second = (await fixture.post({ action: 'space-create', title: '第二课' })).body
    const firstId = first.spaces.find(row => row.title === '第一课').id
    const secondId = second.spaces.find(row => row.title === '第二课').id

    const bound = await fixture.post({ action: 'session-open', spaceId: firstId, sessionId: 'session-first' })
    assert.equal(bound.status, 200)
    assert.equal(bound.body.spaces.find(row => row.id === firstId).sessionId, 'session-first')
    assert.equal(bound.body.spaces.find(row => row.id === secondId).sessionId, null)
    assert.equal(bound.body.currentSpaceId, firstId)

    const other = await fixture.post({ action: 'session-open', spaceId: secondId, sessionId: 'session-second' })
    assert.equal(other.status, 200)
    assert.equal(other.body.spaces.find(row => row.id === firstId).sessionId, 'session-first')
    assert.equal(other.body.spaces.find(row => row.id === secondId).sessionId, 'session-second')

    await fixture.restart()
    const restored = await fixture.get()
    assert.equal(restored.body.spaces.find(row => row.id === firstId).sessionId, 'session-first')
    assert.equal(restored.body.spaces.find(row => row.id === secondId).sessionId, 'session-second')
    assert.equal(restored.body.currentSpaceId, secondId)
  } finally {
    await fixture.close()
  }
})

test('session-open 拒绝未知空间与非法会话 id，不改已保存绑定', async () => {
  const fixture = await classroomFixture()
  try {
    await chooseVault(fixture)
    const created = (await fixture.post({ action: 'space-create', title: '线性代数' })).body
    const spaceId = created.currentSpaceId
    await fixture.post({ action: 'session-open', spaceId, sessionId: 'session-kept' })

    const unknown = await fixture.post({ action: 'session-open', spaceId: '不存在', sessionId: 'session-x' })
    assert.equal(unknown.status, 409)
    assert.equal(unknown.body.code, 'space-not-found')

    for (const sessionId of ['', '   ', 'x'.repeat(201), null]) {
      const invalid = await fixture.post({ action: 'session-open', spaceId, sessionId })
      assert.equal(invalid.status, 400, `sessionId ${JSON.stringify(sessionId)} 应被拒绝`)
      assert.equal(invalid.body.code, 'invalid-command')
    }

    const state = await fixture.get()
    assert.equal(state.body.spaces[0].sessionId, 'session-kept')
  } finally {
    await fixture.close()
  }
})
