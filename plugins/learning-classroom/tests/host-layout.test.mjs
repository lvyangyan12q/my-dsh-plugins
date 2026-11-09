import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, writeFile } from 'node:fs/promises'
import { defaultLayout } from '../src/layout.ts'
import { classroomStateSchema } from '../src/state.ts'
import { classroomFixture } from './support/fixture.mjs'

async function withSpace(t) {
  const fixture = await classroomFixture()
  t.after(() => fixture.close())
  const chosen = await fixture.post({ action: 'vault-choose', path: fixture.vault })
  assert.equal(chosen.status, 200)
  const created = await fixture.post({ action: 'space-create', title: '线性代数' })
  assert.equal(created.status, 200)
  return { fixture, space: created.body.spaces[0] }
}

function layoutOf(body, spaceId) {
  return body.spaces.find(row => row.id === spaceId).layout
}

test('学习空间默认带布局：三栏展开、宽度可用，GET 也返回', async t => {
  const { fixture, space } = await withSpace(t)
  assert.deepEqual(space.layout, defaultLayout())

  const state = await fixture.get()
  assert.deepEqual(layoutOf(state.body, space.id), defaultLayout())
})

test('布局按空间保存：宽度与收起状态跨重启恢复，其他空间不受影响', async t => {
  const { fixture, space } = await withSpace(t)
  const second = (await fixture.post({ action: 'space-create', title: '第二课' })).body.spaces[1]
  assert.deepEqual(second.layout, defaultLayout())

  const layout = {
    widths: { directory: 260, notes: 300, conversation: 260 },
    collapsed: { directory: true, notes: false, conversation: true },
  }
  const saved = await fixture.post({ action: 'layout-save', spaceId: space.id, layout })
  assert.equal(saved.status, 200)
  assert.deepEqual(layoutOf(saved.body, space.id), layout)
  assert.deepEqual(layoutOf(saved.body, second.id), defaultLayout())

  await fixture.restart()
  const restored = await fixture.get()
  assert.deepEqual(layoutOf(restored.body, space.id), layout)
  assert.deepEqual(layoutOf(restored.body, second.id), defaultLayout())
})

test('宽度越界截断到边界，非数值与未知字段被拒绝且不改状态', async t => {
  const { fixture, space } = await withSpace(t)

  const truncated = await fixture.post({
    action: 'layout-save',
    spaceId: space.id,
    layout: {
      widths: { directory: 9999, notes: -20, conversation: 300.4 },
      collapsed: { directory: false, notes: true, conversation: false },
    },
  })
  assert.equal(truncated.status, 200)
  assert.deepEqual(layoutOf(truncated.body, space.id), {
    widths: { directory: 360, notes: 200, conversation: 300 },
    collapsed: { directory: false, notes: true, conversation: false },
  })

  const before = layoutOf((await fixture.get()).body, space.id)
  const rejected = [
    { action: 'layout-save', spaceId: space.id, layout: { widths: { directory: '260', notes: 220, conversation: 240 }, collapsed: { directory: false, notes: false, conversation: false } } },
    { action: 'layout-save', spaceId: space.id, layout: { widths: { directory: 260, notes: 220, conversation: 240, lecture: 300 }, collapsed: { directory: false, notes: false, conversation: false } } },
    { action: 'layout-save', spaceId: space.id, layout: { widths: { directory: 260, notes: 220, conversation: 240 }, collapsed: { directory: false, notes: 'yes', conversation: false } } },
    { action: 'layout-save', spaceId: space.id, layout: { widths: { directory: 260, notes: 220, conversation: 240 }, collapsed: { directory: false, notes: false, conversation: false }, zoom: 2 } },
    { action: 'layout-save', spaceId: space.id },
  ]
  for (const command of rejected) {
    const result = await fixture.post(command)
    assert.equal(result.status, 400, `${JSON.stringify(command)} 应被拒绝`)
    assert.equal(result.body.code, 'invalid-command')
  }
  assert.deepEqual(layoutOf((await fixture.get()).body, space.id), before)

  const unknown = await fixture.post({ action: 'layout-save', spaceId: '不存在', layout: defaultLayout() })
  assert.equal(unknown.status, 409)
  assert.equal(unknown.body.code, 'space-not-found')
})

test('存储 schema：旧空间缺 layout 补默认值，越界宽度截断，未知字段拒绝', () => {
  const legacySpace = { id: 'a', title: 't', directory: 'd', notePath: 'n', createdAt: 'c' }
  const legacy = { schemaVersion: 1, vaultPath: null, spaces: [legacySpace], currentSpaceId: null }

  const parsed = classroomStateSchema.parse(legacy)
  assert.deepEqual(parsed.spaces[0].layout, defaultLayout())
  assert.equal(parsed.spaces[0].lecturePath, null)
  assert.equal(parsed.spaces[0].sessionId, null)

  const clamped = classroomStateSchema.parse({
    ...legacy,
    spaces: [{
      ...legacySpace,
      layout: {
        widths: { directory: 9999, notes: -1, conversation: 300.6 },
        collapsed: { directory: true },
      },
    }],
  })
  assert.deepEqual(clamped.spaces[0].layout, {
    widths: { directory: 360, notes: 200, conversation: 301 },
    collapsed: { directory: true, notes: false, conversation: false },
  })

  const unknown = classroomStateSchema.safeParse({
    ...legacy,
    spaces: [{
      ...legacySpace,
      layout: {
        widths: { directory: 200, notes: 220, conversation: 240 },
        collapsed: { directory: false, notes: false, conversation: false },
        extra: 1,
      },
    }],
  })
  assert.equal(unknown.success, false)
  assert.equal(classroomStateSchema.safeParse({ ...legacy, spaces: [{ ...legacySpace, layout: { ...defaultLayout(), widths: { ...defaultLayout().widths, notes: '220' } } }] }).success, false)
})

test('旧状态缺 layout 字段时给默认值，已存在空间其余字段不被破坏', async t => {
  const { fixture, space } = await withSpace(t)
  const layout = {
    widths: { directory: 260, notes: 300, conversation: 260 },
    collapsed: { directory: true, notes: false, conversation: false },
  }
  await fixture.post({ action: 'layout-save', spaceId: space.id, layout })

  const before = JSON.parse(await readFile(fixture.stateFile, 'utf8'))
  const legacy = structuredClone(before)
  for (const row of legacy.spaces) {
    delete row.layout
    delete row.lecturePath
    delete row.sessionId
  }
  await fixture.app.close()
  await writeFile(fixture.stateFile, JSON.stringify(legacy), 'utf8')
  await fixture.restart()

  const restored = await fixture.get()
  assert.equal(restored.status, 200)
  const row = restored.body.spaces.find(candidate => candidate.id === space.id)
  assert.equal(row.title, space.title)
  assert.equal(row.directory, space.directory)
  assert.equal(row.notePath, space.notePath)
  assert.equal(row.lecturePath, null)
  assert.equal(row.sessionId, null)
  assert.deepEqual(row.layout, defaultLayout())
  assert.equal(restored.body.currentSpaceId, space.id)
})
