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

test('legacy scoped cleanup retries refused closes while keeping the unverified durable retirement pending', () => {
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
  assert.equal(pending, true)
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


test('durable retirement delegates only the owned kind and retains partial failures even with empty inventory', () => {
  const fixture = nativeFixture(), calls: string[] = []
  const native = { ...fixture.native, retirementVersion: 1,
    openTabs: { ...fixture.native.openTabs, getSnapshot: () => [] },
    retireTabsByKind: (kind: string) => { calls.push(kind); return { outcome: 'partial' as const, records: [{ sessionId: 'dormant', outcome: 'unsupported-snapshot' }] } },
    closeIn: () => { throw new Error('Durable retirement must not fall back to adopted close') },
  }
  let saved: string | null = null, pending = false
  const retirement = new CatalogRetirement({ getItem: () => saved, setItem: (_key, raw) => { saved = raw } }, value => { pending = value })
  retirement.attach(native)
  assert.deepEqual(calls, [], 'attaching without a requested retirement never cleans an active provider')
  retirement.retire()
  assert.deepEqual(calls, ['personal-workbench.catalog'])
  assert.equal(pending, true)
  assert.equal(JSON.parse(saved!).requested, true)
})


test('re-enabled providers protect fresh occurrences from pending kind-wide retries until explicit retirement', () => {
  const fixture = nativeFixture()
  let calls = 0
  const native = { ...fixture.native, retirementVersion: 1,
    retireTabsByKind: () => { calls++; return { outcome: 'partial' as const, records: [] } },
  }
  const retirement = new CatalogRetirement({ getItem: () => null, setItem: () => {} }, () => {})
  retirement.attach(native)
  retirement.retire()
  assert.equal(calls, 1)
  retirement.resume()
  fixture.emit()
  assert.equal(calls, 1, 'pending cleanup cannot retire a freshly registered provider on unrelated inventory changes')
  retirement.retire()
  assert.equal(calls, 2, 'the next explicit provider retirement owns its current occurrences')
})


test('a saved durable failure retries through the public capability and clears only after certified completion', () => {
  let saved: string | null = null, pending = false, calls = 0
  const storage = { getItem: () => saved, setItem: (_key: string, raw: string) => { saved = raw } }
  const fixture = nativeFixture()
  let outcome: 'partial' | 'service-unavailable' | 'persistence-unavailable' | 'in-progress' | 'complete' = 'service-unavailable'
  const native = { ...fixture.native, retirementVersion: 1, retireTabsByKind: () => { calls++; return { outcome, records: [] } } }
  const first = new CatalogRetirement(storage, value => { pending = value })
  const detach = first.attach(native)
  first.retire()
  assert.equal(pending, true)
  detach()
  const recovered = new CatalogRetirement(storage, value => { pending = value })
  const release = recovered.attach(native)
  assert.equal(calls, 2, 'a recreated owner restores pending intent even without adopting dormant Sessions')
  for (outcome of ['persistence-unavailable', 'in-progress', 'partial'] as const) {
    fixture.emit()
    assert.equal(pending, true)
    assert.equal(JSON.parse(saved!).requested, true)
  }
  outcome = 'complete'
  fixture.emit()
  assert.equal(pending, false)
  assert.equal(JSON.parse(saved!).requested, false)
  release()
  const before = calls
  new CatalogRetirement(storage, () => {}).attach(native)
  assert.equal(calls, before, 'completed cleanup does not run again against a newly registered provider')
})


test('a legacy or unknown native capability cannot erase a durable kind-wide failure with no occurrence ids', () => {
  const fixture = nativeFixture()
  let saved = JSON.stringify({ version: 2, requested: true, tabs: [] }), pending = false
  const native = { ...fixture.native, retirementVersion: 2, retireTabsByKind: () => assert.fail('Unknown capability version') }
  const retirement = new CatalogRetirement({ getItem: () => saved, setItem: (_key, raw) => { saved = raw } }, value => { pending = value })
  retirement.attach(native)
  assert.equal(pending, true)
  assert.equal(JSON.parse(saved).requested, true)
  assert.deepEqual(fixture.native.openTabs.getSnapshot().map(tab => tab.tabId), ['catalog', 'file'])
})


test('restored own storage clears recovery uncertainty only after a verified retirement marker write', () => {
  const fixture = nativeFixture()
  let unavailable = true, saved: string | null = null, pending = false
  const storage = {
    getItem: () => { if (unavailable) throw new Error('Temporarily unavailable'); return saved },
    setItem: (_key: string, raw: string) => { if (unavailable) throw new Error('Temporarily unavailable'); saved = raw },
  }
  const native = { ...fixture.native, retirementVersion: 1, retireTabsByKind: () => ({ outcome: 'complete' as const, records: [] }) }
  const retirement = new CatalogRetirement(storage, value => { pending = value })
  retirement.attach(native)
  retirement.retire()
  assert.equal(pending, true)
  unavailable = false
  fixture.emit()
  assert.equal(pending, false)
  assert.equal(JSON.parse(saved!).requested, false)
})
