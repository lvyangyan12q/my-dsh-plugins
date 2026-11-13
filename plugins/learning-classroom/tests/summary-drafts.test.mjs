import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSessionDraftStore } from '../src/note-drafts.ts'
import { createSummaryDraftStore } from '../src/summary-drafts.ts'

/** In-memory sessionStorage stand-in: the same tab survives a store rebuild. */
function fakeStorage() {
  const data = new Map()
  const storage = {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)) },
    removeItem: key => { data.delete(key) },
  }
  return { storage, data }
}

test('小结草稿写入 sessionStorage，页面刷新后（新 store）仍能读回两段正文', async () => {
  const fake = fakeStorage()
  const store = createSummaryDraftStore(createSessionDraftStore(fake.storage))
  const summary = '第一段。\n\n## 我自己的标题\n\n- 列表\n\n```js\nconst x = 1\n```'
  const nextStep = '下一步：\n\n1. 做练习'
  const written = store.write('space-1', {
    summary,
    nextStep,
    baseVersion: 'version-1',
    revision: 3,
    savedAt: '2026-11-13T00:00:00.000Z',
  })
  assert.equal(written, 'session')

  // A refresh rebuilds the store over the same sessionStorage.
  const afterRefresh = createSummaryDraftStore(createSessionDraftStore(fake.storage))
  assert.deepEqual(afterRefresh.read('space-1'), {
    summary,
    nextStep,
    baseVersion: 'version-1',
    revision: 3,
    savedAt: '2026-11-13T00:00:00.000Z',
    storage: 'session',
  })
})

test('草稿按主题隔离，旧 revision 不能覆盖新草稿，删除后读回 null', async () => {
  const fake = fakeStorage()
  const store = createSummaryDraftStore(createSessionDraftStore(fake.storage))
  store.write('space-1', { summary: 'A', nextStep: 'a', baseVersion: 'v1', revision: 5, savedAt: 'now' })
  store.write('space-2', { summary: 'B', nextStep: 'b', baseVersion: 'v2', revision: 2, savedAt: 'now' })
  assert.equal(store.read('space-1').summary, 'A')
  assert.equal(store.read('space-2').summary, 'B')

  const stale = store.write('space-1', { summary: '旧', nextStep: '', baseVersion: 'v1', revision: 4, savedAt: 'now' })
  assert.equal(stale, 'stale')
  assert.equal(store.read('space-1').summary, 'A')

  store.remove('space-1')
  assert.equal(store.read('space-1'), null)
  assert.equal(store.read('space-2').summary, 'B')
})

test('sessionStorage 不可用时退回共享内存草稿并明确标注不持久', async () => {
  const store = createSummaryDraftStore(createSessionDraftStore(null))
  const result = store.write('space-memory', {
    summary: '只在内存',
    nextStep: '',
    baseVersion: '',
    revision: 1,
    savedAt: 'now',
  })
  assert.equal(result, 'memory')
  const read = store.read('space-memory')
  assert.equal(read.summary, '只在内存')
  assert.equal(read.baseVersion, null)
  assert.equal(read.storage, 'memory')
  store.remove('space-memory')
  assert.equal(store.read('space-memory'), null)
})
