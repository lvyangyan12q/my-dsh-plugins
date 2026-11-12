import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  allocateDraftRevision,
  createMemoryDraftStore,
  createSessionDraftStore,
  draftRevisionClock,
  observeDraftRevision,
} from '../src/note-drafts.ts'

const draft = { content: '# 草稿\n', baseVersion: 'version-1', revision: 1, savedAt: '2026-11-12T00:00:00.000Z' }

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem(key) { return data.get(key) ?? null },
    setItem(key, value) { data.set(key, value) },
    removeItem(key) { data.delete(key) },
  }
}

test('内存草稿：写入返回 memory，读回带来源，按空间与路径隔离', () => {
  const store = createMemoryDraftStore()
  assert.equal(store.write('space-1', '笔记/一.md', draft), 'memory')
  assert.deepEqual(store.read('space-1', '笔记/一.md'), { ...draft, storage: 'memory' })
  assert.equal(store.read('space-1', '笔记/二.md'), null)
  assert.equal(store.read('space-2', '笔记/一.md'), null)
  store.remove('space-1', '笔记/一.md')
  assert.equal(store.read('space-1', '笔记/一.md'), null)
})

test('会话草稿：正常写入返回 session，读回带 session 来源', () => {
  const storage = fakeStorage()
  const store = createSessionDraftStore(storage)
  assert.equal(store.write('space-1', '笔记/一.md', draft), 'session')
  assert.equal(storage.data.size, 1)
  assert.deepEqual(store.read('space-1', '笔记/一.md'), { ...draft, storage: 'session' })
})

test('草稿 revision 是 CAS：旧 revision 不能覆盖新草稿，只返回 stale', () => {
  const store = createMemoryDraftStore()
  assert.equal(store.write('space-cas', '笔记/一.md', { ...draft, revision: 2, content: '新草稿' }), 'memory')
  assert.equal(store.write('space-cas', '笔记/一.md', { ...draft, revision: 1, content: '旧失败内容' }), 'stale')
  assert.equal(store.read('space-cas', '笔记/一.md').content, '新草稿')
  assert.equal(store.write('space-cas', '笔记/一.md', { ...draft, revision: 3, content: '更新草稿' }), 'memory')
  assert.equal(store.read('space-cas', '笔记/一.md').content, '更新草稿')
  store.remove('space-cas', '笔记/一.md')
})

test('草稿 revision 时钟跨挂载单调，清掉草稿也不回退', () => {
  const spaceId = 'space-clock'
  const path = '笔记/时钟.md'
  observeDraftRevision(spaceId, path, 5)
  assert.equal(draftRevisionClock(spaceId, path), 5)
  assert.equal(allocateDraftRevision(spaceId, path), 6)
  assert.equal(allocateDraftRevision(spaceId, path), 7)

  // Clearing the draft (for example, because it matched disk) must not reset
  // the clock: a later mount still allocates above the old revision.
  const store = createMemoryDraftStore()
  store.write(spaceId, path, { ...draft, revision: 7, content: 'Y' })
  store.remove(spaceId, path)
  assert.equal(draftRevisionClock(spaceId, path), 7)
  assert.equal(allocateDraftRevision(spaceId, path), 8)
  assert.equal(allocateDraftRevision('space-clock-other', path), 1, '不同空间独立计时')
})

test('setItem 失败时退回共享内存：不同 store 实例也能跨挂载读回并标明 memory', () => {
  const throwing = {
    getItem() { return null },
    setItem() { throw new Error('quota exceeded') },
    removeItem() {},
  }
  const first = createSessionDraftStore(throwing)
  const second = createSessionDraftStore(throwing)
  assert.equal(first.write('space-fallback', '笔记/回退.md', draft), 'memory')
  assert.deepEqual(second.read('space-fallback', '笔记/回退.md'), { ...draft, storage: 'memory' })
  second.remove('space-fallback', '笔记/回退.md')
  assert.equal(second.read('space-fallback', '笔记/回退.md'), null)
})

test('没有 web storage 时多个实例共享内存，而不是每次新建空 store', () => {
  const first = createSessionDraftStore(null)
  const second = createSessionDraftStore(null)
  assert.equal(first.write('space-nostorage', '笔记/无存储.md', draft), 'memory')
  assert.deepEqual(second.read('space-nostorage', '笔记/无存储.md'), { ...draft, storage: 'memory' })
  second.remove('space-nostorage', '笔记/无存储.md')
})

test('损坏或旧格式的已存草稿被忽略，不把未知 JSON 当正文', () => {
  const storage = fakeStorage({ 'learning-classroom:note-draft:v1:space-1:%E7%AC%94%E8%AE%B0%2F%E4%B8%80.md': '{not json' })
  const store = createSessionDraftStore(storage)
  assert.equal(store.read('space-1', '笔记/一.md'), null)

  storage.setItem('learning-classroom:note-draft:v1:space-1:%E7%AC%94%E8%AE%B0%2F%E4%BA%8C.md', JSON.stringify({ content: 42 }))
  assert.equal(store.read('space-1', '笔记/二.md'), null)

  // Old records without a revision are still readable as revision 0.
  storage.setItem('learning-classroom:note-draft:v1:space-1:%E7%AC%94%E8%AE%B0%2F%E4%B8%89.md', JSON.stringify({ content: '旧格式', baseVersion: 'v0', savedAt: '2026-11-12T00:00:00.000Z' }))
  assert.deepEqual(store.read('space-1', '笔记/三.md'), { content: '旧格式', baseVersion: 'v0', revision: 0, savedAt: '2026-11-12T00:00:00.000Z', storage: 'session' })
  store.remove('space-1', '笔记/三.md')
})
