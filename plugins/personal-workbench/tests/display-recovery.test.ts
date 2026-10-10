import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DisplayStore } from '../src/display-store.ts'
import type { DisplayData, DisplaySource } from '../src/display-api.ts'

const data: DisplayData = {
  records: [
    { id: 'walden', title: 'Walden', fields: { category: 'Literature', privateText: 'MATERIAL-NEVER-SAVED' } },
    { id: 'habits', title: 'Atomic Habits', fields: { category: 'Learning' } },
  ], filters: [{ field: 'category', label: 'Category' }], stats: [{ id: 'count', label: 'Count', operation: 'count' }],
}
const source: DisplaySource = { appId: 'reading', resource: 'books', label: 'Books', load: async () => data }
const scope = { appId: 'reading', instanceId: 'default', preview: false }
function storage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

test('declared display connection restores filter/search/selection after its owner is recreated without caching records', async () => {
  const local = storage(), options = { connectionId: 'books', storage: local }
  const first = new DisplayStore(source, scope, options)
  await first.reload()
  first.setFilter('category', 'Literature')
  first.setSearch('Walden')
  first.select('walden')
  first.dispose()
  const restored = new DisplayStore(source, scope, options)
  assert.deepEqual(restored.getSnapshot().data.records, [], 'reload always reads actual source data')
  await restored.reload()
  assert.deepEqual(restored.getSnapshot().filters, { category: 'Literature' })
  assert.equal(restored.getSnapshot().search, 'Walden')
  assert.equal(restored.getSnapshot().selectedId, 'walden')
  assert.deepEqual(restored.filteredRecords().map(record => record.id), ['walden'])
  assert.equal([...local.values.values()].join('').includes('MATERIAL-NEVER-SAVED'), false)
  restored.dispose()
})


test('source reload drops obsolete filters and records while retaining editable search and valid selection', async () => {
  let current = data
  const live = new DisplayStore({ ...source, load: async () => current }, scope, { connectionId: 'books', storage: storage() })
  await live.reload()
  live.setFilter('category', 'Literature'); live.setSearch('Walden'); live.select('walden')
  current = { ...data, filters: [] }
  await live.reload()
  assert.deepEqual(live.getSnapshot().filters, {}, 'removed filter declarations must not leave invisible constraints')
  assert.equal(live.getSnapshot().selectedId, 'walden')
  current = { ...data, records: [data.records[1]!] }
  await live.reload()
  assert.equal(live.getSnapshot().selectedId, undefined)
  assert.equal(live.getSnapshot().search, 'Walden')
  live.setSearch(''); live.setFilter('category', 'Learning'); live.select('habits')
  current = { ...data, records: [] }
  await live.reload()
  assert.deepEqual(live.getSnapshot().filters, {}, 'a removed filter option is no longer a valid saved selection')
  assert.equal(live.getSnapshot().selectedId, undefined)
  live.dispose()
})


test('owned source changes reload the same connection and disposal releases its subscription', async () => {
  let current = data, notify: (() => void) | undefined, loads = 0, released = 0
  const observed = { ...source,
    load: async () => { loads++; return current },
    subscribe: (bound: typeof scope, onChange: () => void) => { assert.deepEqual(bound, scope); notify = onChange; return () => { released++ } },
  }
  const store = new DisplayStore(observed, scope, { connectionId: 'books', storage: storage() })
  await store.reload(); store.setFilter('category', 'Literature'); store.setSearch('Walden'); store.select('walden')
  assert.equal(typeof notify, 'function')
  current = { ...data, records: [{ ...data.records[0]!, title: 'Walden revised' }, data.records[1]!] }
  notify!(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(store.filteredRecords()[0]?.title, 'Walden revised')
  assert.equal(store.getSnapshot().selectedId, 'walden')
  assert.deepEqual(store.getSnapshot().filters, { category: 'Literature' })
  store.dispose()
  assert.equal(released, 1)
  const before = loads
  notify!(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(loads, before, 'queued notifications cannot load a disposed connection owner')
})


test('presentation state is isolated by app, instance, preview, connection and source identity', async () => {
  const local = storage(), original = new DisplayStore(source, scope, { connectionId: 'books', storage: local })
  await original.reload(); original.setFilter('category', 'Literature'); original.setSearch('Walden'); original.select('walden'); original.dispose()
  const cases = [
    { scope: { ...scope, instanceId: 'other' }, source, connectionId: 'books' },
    { scope: { ...scope, preview: true }, source, connectionId: 'books' },
    { scope: { ...scope, appId: 'other' }, source, connectionId: 'books' },
    { scope, source, connectionId: 'other' },
    { scope, source: { ...source, appId: 'other-source' }, connectionId: 'books' },
    { scope, source: { ...source, resource: 'other-books' }, connectionId: 'books' },
  ]
  for (const row of cases) {
    const isolated = new DisplayStore(row.source, row.scope, { connectionId: row.connectionId, storage: local })
    await isolated.reload()
    assert.deepEqual(isolated.getSnapshot().filters, {})
    assert.equal(isolated.getSnapshot().search, '')
    assert.equal(isolated.getSnapshot().selectedId, undefined)
    isolated.dispose()
  }
  const recovered = new DisplayStore(source, scope, { connectionId: 'books', storage: local })
  await recovered.reload()
  assert.equal(recovered.getSnapshot().selectedId, 'walden')
  recovered.dispose()
})

test('unavailable, oversized or unsupported presentation storage leaves current editing usable without claiming persistence', async () => {
  for (const local of [
    { getItem: () => { throw Error('Blocked') }, setItem: () => { throw Error('Blocked') } },
    { getItem: () => null, setItem: () => {} },
    { getItem: () => JSON.stringify({ version: 99, entries: [] }), setItem: () => assert.fail('Unsupported cache must remain intact') },
    { getItem: () => ' '.repeat(262145), setItem: () => assert.fail('Oversized cache must remain intact') },
  ]) {
    const live = new DisplayStore(source, scope, { connectionId: 'books', storage: local })
    await live.reload(); live.setFilter('category', 'Literature'); live.setSearch('Walden'); live.select('walden')
    assert.equal(live.getSnapshot().phase, 'ready')
    assert.equal(live.getSnapshot().persistence, 'unavailable')
    assert.equal(live.getSnapshot().selectedId, 'walden')
    assert.deepEqual(live.filteredRecords().map(record => record.id), ['walden'])
    live.dispose()
  }
})
