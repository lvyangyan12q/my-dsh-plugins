import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classroomStateSchema, emptyClassroomState, learningClassroomDomain, openClassroomStateStore } from '../src/state.ts'

const sourceDir = fileURLToPath(new URL('../src/', import.meta.url))

test('存储身份是 learning_classroom v1，状态只含导航与绑定', async () => {
  assert.equal(learningClassroomDomain.name, 'learning_classroom')
  assert.equal(learningClassroomDomain.version, 1)
  assert.deepEqual(emptyClassroomState(), { schemaVersion: 1, vaultPath: null, spaces: [], currentSpaceId: null })
  assert.equal(classroomStateSchema.safeParse({ ...emptyClassroomState(), lectures: [] }).success, false)
  assert.equal(classroomStateSchema.safeParse({ ...emptyClassroomState(), spaces: [{ id: 'a', title: 't', directory: 'd', notePath: 'n', createdAt: 'c', content: '正文' }] }).success, false)
})

test('插件可执行源码不引用旧存储域 personal_learning', async () => {
  const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const files = await readdir(sourceDir)
  for (const file of files.filter(name => name.endsWith('.ts') || name.endsWith('.tsx'))) {
    const source = stripComments(await readFile(join(sourceDir, file), 'utf8'))
    assert.equal(source.includes('personal_learning'), false, `${file} 不应引用旧存储域`)
  }
})

test('生产存储适配器打开新域并读写状态后关闭句柄', async () => {
  const opened = []
  let stored = emptyClassroomState()
  const domain = {
    global: {
      get: () => stored,
      set: async value => { stored = value },
    },
    close: async () => { opened.push('closed') },
  }
  const store = await openClassroomStateStore({
    storageDomain: {
      open: async spec => { opened.push(spec); return domain },
    },
  })
  assert.equal(opened[0], learningClassroomDomain)
  assert.equal(store.read().vaultPath, null)
  const next = { ...emptyClassroomState(), vaultPath: '/tmp/vault' }
  await store.write(next)
  assert.equal(store.read().vaultPath, '/tmp/vault')
  await store.close()
  assert.deepEqual(opened.at(-1), 'closed')
})
