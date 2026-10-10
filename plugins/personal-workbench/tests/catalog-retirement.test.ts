import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CatalogRetirement } from '../src/catalog-retirement.ts'

type Native = Parameters<CatalogRetirement['attach']>[0]
type Tab = ReturnType<Native['openTabs']['getSnapshot']>[number]
function nativeFixture() {
  let rows: readonly Tab[] = [
    { sessionId: 'main' as Tab['sessionId'], tabId: 'catalog' as Tab['tabId'], kind: 'personal-workbench.catalog', contentId: 'owned' },
    { sessionId: 'main' as Tab['sessionId'], tabId: 'file' as Tab['tabId'], kind: 'file', contentId: 'unrelated' },
  ]
  const listeners = new Set<() => void>()
  let rejectClose = false
  const native: Native = {
    openTabs: { getSnapshot: () => rows, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } },
    mounted: { getSnapshot: () => undefined, subscribe: () => () => {} },
    closeIn: (sessionId, tabId) => {
      if (rejectClose) throw new Error('Resource cleanup refused')
      rows = rows.filter(row => row.sessionId !== sessionId || row.tabId !== tabId)
      for (const listener of listeners) listener()
    },
  }
  return { native, emit: () => { for (const listener of listeners) listener() }, reject: (value: boolean) => { rejectClose = value } }
}

test('a native close handler refusal preserves the catalog until a later public change permits cleanup', () => {
  const fixture = nativeFixture()
  let value: string | null = null
  let pending = false
  const retirement = new CatalogRetirement({ getItem: () => value, setItem: (_key, raw) => { value = raw } }, value => { pending = value })
  const detach = retirement.attach(fixture.native)
  fixture.reject(true)
  retirement.retire()
  assert.deepEqual(fixture.native.openTabs.getSnapshot().map(tab => tab.tabId), ['catalog', 'file'])
  assert.equal(pending, true)
  fixture.reject(false)
  fixture.emit()
  assert.deepEqual(fixture.native.openTabs.getSnapshot().map(tab => tab.tabId), ['file'])
  assert.equal(pending, false)
  detach()
})

test('unavailable storage preserves public scoped cleanup and reports restart recovery uncertainty', () => {
  const fixture = nativeFixture()
  let pending = false
  const retirement = new CatalogRetirement({ getItem: () => { throw new Error('Blocked') }, setItem: () => { throw new Error('Blocked') } }, value => { pending = value })
  const detach = retirement.attach(fixture.native)
  retirement.retire()
  assert.deepEqual(fixture.native.openTabs.getSnapshot().map(tab => tab.tabId), ['file'])
  assert.equal(pending, true)
  detach()
})

test('untrusted retirement markers never authorize closing unrelated or newly opened catalogs', () => {
  for (const raw of ['{', JSON.stringify({ version: 2, tabs: [] }), JSON.stringify({ version: 1, tabs: [{ sessionId: 'main', tabId: 'catalog', extra: true }] }),
    JSON.stringify({ version: 1, tabs: [{ sessionId: 'main', tabId: 'x'.repeat(513) }] }),
    JSON.stringify({ version: 1, tabs: [{ sessionId: 'main', tabId: 'file' }] }), ' '.repeat(131073)]) {
    const fixture = nativeFixture()
    const retirement = new CatalogRetirement({ getItem: () => raw, setItem: () => {} }, () => {})
    const detach = retirement.attach(fixture.native)
    assert.deepEqual(fixture.native.openTabs.getSnapshot().map(tab => tab.tabId), ['catalog', 'file'])
    detach()
  }
})
