import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMemoryDraftStore, createSessionDraftStore } from '../src/note-drafts.ts'

const draft = { content: '# 草稿\n', baseVersion: 'version-1', savedAt: '2026-11-12T00:00:00.000Z' }

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
  const storage = fakeStorage({ 'learning-classroom:note-draft:v1:space-1%3A%E7%AC%94%E8%AE%B0%2F%E4%B8%80.md': '{not json' })
  const store = createSessionDraftStore(storage)
  assert.equal(store.read('space-1', '笔记/一.md'), null)

  storage.setItem('learning-classroom:note-draft:v1:space-1%3A%E7%AC%94%E8%AE%B0%2F%E4%BA%8C.md', JSON.stringify({ content: 42 }))
  assert.equal(store.read('space-1', '笔记/二.md'), null)
})
