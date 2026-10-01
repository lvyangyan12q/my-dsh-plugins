import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { SessionBinding, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { TeacherWindow, parseAssociation } from '../src/teacher-window.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture(options: { pending?: boolean; fail?: boolean; state?: string } = {}) {
  const history = deferred<SessionBinding>()
  const sessionListeners = new Set<() => void>()
  let sessionState = { openState: options.state ?? 'open', removed: false }
  const workspaceListeners = new Set<() => void>()
  let workspaceState: WorkspaceSnapshot = { items: [], archivedSessionIds: [], pinnedSessionIds: [], phase: 'ready', state: 'idle', error: null }
  const workspace = {
    getSnapshot: () => workspaceState,
    subscribe: (listener: () => void) => { workspaceListeners.add(listener); return () => { workspaceListeners.delete(listener) } },
  }
  // The fixture supplies only the lifecycle read used by this owner; it renders no chat.
  const binding = { session: {
    getSnapshot: () => sessionState,
    subscribe: (listener: () => void) => { sessionListeners.add(listener); return () => { sessionListeners.delete(listener) } },
  } } as SessionBinding
  const acquired: { id: SessionId; source: string }[] = []
  let released = 0
  let associationReads = 0
  const reference: SessionReference = {
    sessionId: 'synthetic-teacher' as SessionId, binding,
    ready: options.pending ? history.promise : options.fail ? Promise.reject(new Error('inaccessible')) : Promise.resolve(binding),
    release: () => { released++ }, [Symbol.dispose]: () => { released++ },
  }
  const owner = new TeacherWindow({
    retain: (id, opts) => { acquired.push({ id: id as SessionId, source: opts.source }); return reference },
  }, async () => { associationReads++; return reference.sessionId }, workspace)
  return {
    owner, reference, binding, history, acquired, released: () => released, reads: () => associationReads,
    workspace: (change: Partial<WorkspaceSnapshot>) => { workspaceState = { ...workspaceState, ...change }; for (const listener of [...workspaceListeners]) listener() },
    session: (openState: string, removed = false) => { sessionState = { openState, removed }; for (const listener of [...sessionListeners]) listener() },
    subscriptions: () => sessionListeners.size + workspaceListeners.size,
  }
}

test('host metadata rejects absent, corrupted, or empty associations', () => {
  for (const value of [null, {}, { version: 2, sessionId: 's' }, { version: 1, sessionId: '' }, { version: 1, sessionId: ' s ' }]) {
    assert.throws(() => parseAssociation(value))
  }
  assert.equal(parseAssociation({ version: 1, sessionId: 'synthetic-teacher' }), 'synthetic-teacher')
})

test('duplicate open retains only the explicit teacher and never selects main chat', async () => {
  const f = fixture()
  await Promise.all([f.owner.open(), f.owner.open(), f.owner.open()])
  assert.deepEqual(f.acquired, [{ id: 'synthetic-teacher', source: 'personalWorkbenchTeacher' }])
  assert.equal(f.reads(), 1)
  assert.equal(f.owner.getSnapshot().phase, 'open')
  f.owner.dispose()
  assert.equal(f.released(), 1)
})

test('close withdraws the provider before releasing its committed reference', async () => {
  const f = fixture()
  await f.owner.open()
  const unmount = f.owner.mount(f.reference)
  f.owner.close()
  assert.equal(f.owner.getSnapshot().phase, 'closed')
  assert.equal(f.released(), 0)
  unmount()
  unmount()
  assert.equal(f.released(), 1)
})

test('StrictMode effect replay preserves the visible reference', async () => {
  const f = fixture()
  await f.owner.open()
  f.owner.mount(f.reference)()
  assert.equal(f.released(), 0)
  const unmount = f.owner.mount(f.reference)
  f.owner.close()
  unmount()
  assert.equal(f.released(), 1)
})

test('closing during history opening cannot resurrect the window', async () => {
  const f = fixture({ pending: true })
  const opening = f.owner.open()
  await Promise.resolve()
  f.owner.close()
  assert.equal(f.released(), 1, 'pending acquisition releases without waiting for history')
  f.history.resolve(f.binding)
  await opening
  assert.equal(f.owner.getSnapshot().phase, 'closed')
  assert.equal(f.released(), 1)
})

test('closing during metadata retrieval aborts only that acquisition', async () => {
  const metadata = deferred<SessionId>()
  let signal: AbortSignal | undefined
  let retained = false
  const owner = new TeacherWindow({ retain: () => { retained = true; throw new Error('must not retain') } }, s => { signal = s; return metadata.promise }, {
    getSnapshot: () => ({ items: [], archivedSessionIds: [], pinnedSessionIds: [], phase: 'ready', state: 'idle', error: null }),
    subscribe: () => () => {},
  })
  const opening = owner.open()
  owner.close()
  assert.equal(signal?.aborted, true)
  metadata.resolve('synthetic-teacher' as SessionId)
  await opening
  assert.equal(retained, false)
  assert.equal(owner.getSnapshot().phase, 'closed')
})

test('unavailable history is an explicit error with no replacement session', async () => {
  const f = fixture({ fail: true })
  await f.owner.open()
  assert.deepEqual(f.owner.getSnapshot(), { phase: 'error', reason: 'session' })
  assert.equal(f.acquired.length, 1)
  assert.equal(f.released(), 1)
})

test('a failed soft history open never mounts a writable blank conversation', async () => {
  const f = fixture({ state: 'error' })
  await f.owner.open()
  assert.deepEqual(f.owner.getSnapshot(), { phase: 'error', reason: 'session' })
  assert.equal(f.released(), 1)
})

test('close/reopen and a new owner read the same durable host association', async () => {
  const f = fixture()
  await f.owner.open()
  f.owner.close()
  await f.owner.open()
  assert.deepEqual(f.acquired.map(entry => entry.id), ['synthetic-teacher', 'synthetic-teacher'])
  f.owner.dispose()
  const restarted = fixture()
  await restarted.owner.open()
  assert.equal(restarted.reference.sessionId, f.reference.sessionId)
  restarted.owner.dispose()
})

test('plugin teardown releases each hold once and prevents future opening', async () => {
  const f = fixture()
  await f.owner.open()
  const unmount = f.owner.mount(f.reference)
  f.owner.dispose()
  f.owner.dispose()
  unmount()
  await f.owner.open()
  assert.equal(f.released(), 1)
  assert.equal(f.acquired.length, 1)
})

test('archived teacher is excluded even when its history can open', async () => {
  const f = fixture()
  f.workspace({ archivedSessionIds: [f.reference.sessionId] })
  await f.owner.open()
  assert.deepEqual(f.owner.getSnapshot(), { phase: 'error', reason: 'session' })
  assert.equal(f.acquired.length, 0)
  f.owner.dispose()
})

test('an initial pending archive set does not authorize acquisition', async () => {
  const f = fixture()
  f.workspace({ phase: 'pending', state: 'loading' })
  const opening = f.owner.open()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(f.owner.getSnapshot().phase, 'loading')
  assert.equal(f.acquired.length, 0)
  f.workspace({ phase: 'ready', state: 'idle', archivedSessionIds: [f.reference.sessionId] })
  await opening
  assert.equal(f.owner.getSnapshot().phase, 'error')
  f.owner.dispose()
  assert.equal(f.subscriptions(), 0)
})

test('archiving an open teacher withdraws native controls until explicit same-ID retry', async () => {
  const f = fixture()
  await f.owner.open()
  const unmount = f.owner.mount(f.reference)
  f.workspace({ archivedSessionIds: [f.reference.sessionId] })
  assert.deepEqual(f.owner.getSnapshot(), { phase: 'error', reason: 'session' })
  assert.equal(f.released(), 0)
  unmount()
  assert.equal(f.released(), 1)
  f.workspace({ archivedSessionIds: [] })
  assert.equal(f.owner.getSnapshot().phase, 'error', 'unarchive does not reopen without a gesture')
  await f.owner.open()
  assert.equal(f.owner.getSnapshot().phase, 'open')
  assert.equal(f.reads(), 1, 'retry must preserve the selected identity')
  f.owner.dispose()
  assert.equal(f.subscriptions(), 0)
})

test('stale ready/loading and terminal-error archive snapshots withdraw an open teacher', async () => {
  for (const state of ['loading', 'error'] as const) {
    const f = fixture()
    await f.owner.open()
    f.workspace({ phase: 'ready', state })
    assert.deepEqual(f.owner.getSnapshot(), { phase: 'error', reason: 'session' })
    assert.equal(f.subscriptions(), 0)
    f.owner.dispose()
  }
})

test('post-opening history failure exposes owner retry and reacquires the same ID', async () => {
  const f = fixture()
  await f.owner.open()
  f.session('error')
  assert.deepEqual(f.owner.getSnapshot(), { phase: 'error', reason: 'session' })
  assert.equal(f.released(), 1)
  f.session('open')
  await f.owner.open()
  assert.equal(f.owner.getSnapshot().phase, 'open')
  assert.deepEqual(f.acquired.map(entry => entry.id), ['synthetic-teacher', 'synthetic-teacher'])
  assert.equal(f.reads(), 1)
  f.owner.dispose()
})

test('archive changes while history opens are checked before mounting', async () => {
  const f = fixture({ pending: true })
  const opening = f.owner.open()
  await Promise.resolve()
  f.workspace({ archivedSessionIds: [f.reference.sessionId] })
  f.history.resolve(f.binding)
  await opening
  assert.deepEqual(f.owner.getSnapshot(), { phase: 'error', reason: 'session' })
  assert.equal(f.released(), 1)
  assert.equal(f.subscriptions(), 0)
  f.owner.dispose()
})

test('closing a pending archive wait unsubscribes and prevents later acquisition', async () => {
  const f = fixture()
  f.workspace({ phase: 'pending', state: 'loading' })
  const opening = f.owner.open()
  await Promise.resolve()
  assert.equal(f.subscriptions(), 1)
  f.owner.close()
  await opening
  f.workspace({ phase: 'ready', state: 'idle' })
  assert.equal(f.subscriptions(), 0)
  assert.equal(f.acquired.length, 0)
  assert.equal(f.owner.getSnapshot().phase, 'closed')
})

test('terminal archive failure rejects opening without trusting the empty set', async () => {
  const f = fixture()
  f.workspace({ phase: 'pending', state: 'error' })
  await f.owner.open()
  assert.deepEqual(f.owner.getSnapshot(), { phase: 'error', reason: 'session' })
  assert.equal(f.acquired.length, 0)
  assert.equal(f.subscriptions(), 0)
  f.owner.dispose()
})

test('removed history withdraws the provider and a stale scoped retry cannot adopt it', async () => {
  const f = fixture()
  await f.owner.open()
  f.session('open', true)
  assert.deepEqual(f.owner.getSnapshot(), { phase: 'error', reason: 'session' })
  await f.owner.retry('another-session' as SessionId)
  assert.equal(f.acquired.length, 1)
  assert.equal(f.subscriptions(), 0)
  f.owner.dispose()
})
