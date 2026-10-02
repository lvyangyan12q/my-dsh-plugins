import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RoleClient, RoleClients, parseRoleBinding } from '../src/role-client.ts'

const key = { appId: 'kaogong', instanceId: 'default', roleId: 'teacher' }
const record = id => ({ version: 1, key, sessionId: id, presetId: 'teacher', phase: 'ready', previousSessionIds: [] })
const evidence = { kind: 'lesson', context: { subject: 'math', title: 'target', limit: 5 } }
function fixture({ pending = false, archived = false, fail = false, sending } = {}) {
  let resolve
  const ready = new Promise(yes => { resolve = yes })
  const retained = [], sent = [], released = [], requests = []
  let binding = null
  const ctx = { workspaces: { list: {
    getSnapshot: () => ({ phase: 'ready', state: 'idle', archivedSessionIds: archived ? ['teacher-1'] : [] }), subscribe: () => () => {},
  } }, sessions: { retain(id) {
    retained.push(id)
    const value = { session: { getSnapshot: () => ({ openState: 'open', removed: false }), subscribe: () => () => {} }, ctx: { conversation: { send: async text => { sent.push({ id, text }); await sending } } } }
    return { sessionId: id, binding: value, ready: pending ? ready : Promise.resolve(value), release: () => released.push(id) }
  }, async using(id, _options, action) { const reference = this.retain(id); try { await reference.ready; return await action(reference) } finally { reference.release() } } } }
  const owner = new RoleClient(ctx, async (_url, options) => {
    const data = JSON.parse(options.body); requests.push(data)
    if (data.action === 'teach' || data.action === 'retry') binding ??= record('teacher-1')
    if (data.action === 'replace') binding = { ...record('teacher-2'), previousSessionIds: [binding.sessionId] }
    return { ok: !fail, json: async () => ({ binding, prompt: '/kaogong-teach actual evidence', error: 'Native command failed' }) }
  })
  return { owner, retained, sent, released, requests, resolve, setBinding: value => { binding = value } }
}
test('owner registration and null open make zero native calls; explicit teaching uses exact scoped send', async () => {
  const f = fixture()
  assert.equal(f.requests.length, 0)
  await f.owner.open(key)
  assert.deepEqual(f.retained, [])
  await f.owner.teach(key, evidence)
  assert.deepEqual(f.retained, ['teacher-1', 'teacher-1'])
  assert.equal(f.sent.length, 1)
  assert.equal(f.sent[0].id, 'teacher-1')
  assert.ok(f.sent[0].text.startsWith('/kaogong-teach '))
  assert.deepEqual(f.requests.map(row => row.action), ['read', 'teach'])
  f.owner.dispose()
  assert.deepEqual(f.released, ['teacher-1', 'teacher-1'])
})
test('close/reopen and new owner recover durable ID with no replacement or implicit teaching', async () => {
  const f = fixture(); f.setBinding(record('teacher-1'))
  await f.owner.open(key)
  f.owner.teacher.close()
  await f.owner.open(key)
  assert.deepEqual(f.retained, ['teacher-1', 'teacher-1'])
  assert.deepEqual(f.sent, [])
  const restart = fixture(); restart.setBinding(record('teacher-1'))
  await restart.owner.open(key)
  assert.deepEqual(restart.retained, ['teacher-1'])
  assert.deepEqual(restart.requests.map(row => row.action), ['read'])
  f.owner.dispose(); restart.owner.dispose()
})
test('archived teacher never sends or silently replaces; stale retry rejected and explicit replacement retains old ID', async () => {
  const f = fixture({ archived: true })
  await assert.rejects(f.owner.teach(key, evidence), /unavailable/)
  assert.deepEqual(f.retained, [])
  assert.deepEqual(f.sent, [])
  assert.equal(f.owner.getSnapshot().binding.sessionId, 'teacher-1')
  await assert.rejects(f.owner.retry(key, 'stale'), /changed/)
  await f.owner.replace(key, 'teacher-1')
  assert.deepEqual(f.owner.getSnapshot().binding.previousSessionIds, ['teacher-1'])
  assert.deepEqual(f.retained, ['teacher-2'])
  assert.deepEqual(f.sent, [])
  f.owner.dispose()
})
test('teardown during native opening never sends and releases only the local reference', async () => {
  const f = fixture({ pending: true })
  const teaching = f.owner.teach(key, evidence)
  for (let i = 0; i < 5; i++) await Promise.resolve()
  assert.equal(f.retained.length, 1)
  f.owner.dispose()
  f.resolve()
  await teaching
  assert.deepEqual(f.sent, [])
  assert.deepEqual(f.released, ['teacher-1'])
})
test('command failure exposes the persisted intent ID for recovery, not a guessed new identity', async () => {
  const f = fixture({ fail: true })
  f.setBinding({ ...record('teacher-1'), phase: 'intent' })
  await assert.rejects(f.owner.teach(key, evidence), /Native command failed/)
  assert.equal(f.owner.getSnapshot().binding.sessionId, 'teacher-1')
  assert.equal(f.owner.getSnapshot().binding.phase, 'intent')
  assert.deepEqual(f.retained, [])
  f.owner.dispose()
})
test('metadata rejects different keys/versions and unsafe native preparation', () => {
  for (const value of [{ ...record('id'), version: 2 }, { ...record('id'), key: { ...key, roleId: 'other' } }, { ...record('id'), key: { ...key, subject: 'math' } }, { ...record('id'), previousSessionIds: [null] }]) assert.throws(() => parseRoleBinding(value, key))
})
test('closing the UI during send releases only its UI hold; command hold lasts through send settlement', async () => {
  let settle
  const sending = new Promise(resolve => { settle = resolve })
  const f = fixture({ sending })
  const command = f.owner.teach(key, evidence)
  for (let i = 0; i < 20 && !f.sent.length; i++) await Promise.resolve()
  assert.equal(f.sent.length, 1)
  assert.deepEqual(f.retained, ['teacher-1', 'teacher-1'])
  assert.equal(f.released.length, 0)
  f.owner.teacher.close()
  assert.deepEqual(f.released, ['teacher-1'])
  settle()
  await command
  assert.deepEqual(f.released, ['teacher-1', 'teacher-1'])
  f.owner.dispose()
  assert.equal(f.released.length, 2)
})
test('missing route, login response, offline services and malformed JSON never expose response bodies or acquire replacements', async () => {
  for (const status of [401, 403, 404, 503, 200]) {
    const f = fixture()
    const owner = new RoleClient({ sessions: { retain: () => assert.fail('No replacement'), using: () => assert.fail('No command') }, workspaces: { list: {} } }, async () => ({ status, ok: status === 200,
      json: async () => { throw SyntaxError('Unexpected token <private-secret>') } }))
    await assert.rejects(owner.teach(key, evidence), /Teacher (service unavailable|authentication required)/)
    assert.ok(!owner.getSnapshot().error.includes('private-secret'))
    assert.equal(owner.getSnapshot().binding, null)
    owner.dispose(); f.owner.dispose()
  }
})

test('per-key owners are stable across role/subject switches; read/ensure never send and disposal releases each exact UI hold', async () => {
  const retained = [], released = [], requests = []
  const ctx = { workspaces: { list: { getSnapshot: () => ({ phase: 'ready', state: 'idle', archivedSessionIds: [] }), subscribe: () => () => {} } }, sessions: {
    retain(id) { retained.push(id); return { sessionId: id, ready: Promise.resolve(), binding: { session: { getSnapshot: () => ({ openState: 'open', removed: false }), subscribe: () => () => {} } }, release: () => released.push(id) } },
    using() { assert.fail('Read/ensure cannot send a native command') },
  } }
  const owners = new RoleClients(ctx, async (_url, options) => { const input = JSON.parse(options.body); requests.push(input); return { ok: true, json: async () => ({ binding: { ...record(`${input.key.roleId}-${input.key.subject ?? 'legacy'}`), key: input.key } }) } })
  const keys = [key, { ...key, subject: 'math' }, { ...key, subject: 'language' }, { ...key, roleId: 'class-advisor' }, { ...key, roleId: 'counselor' }]
  assert.deepEqual(retained, [])
  await Promise.all(keys.map(key => owners.open(key)))
  const original = owners.owner(keys[1])
  await owners.ensure(keys[1])
  assert.equal(owners.owner(keys[1]), original)
  assert.equal(new Set(retained).size, 5)
  assert.equal(retained.length, 5, 'Switching does not reacquire or release the existing UI reference')
  assert.deepEqual(released, [])
  assert.deepEqual(requests.map(value => value.action), ['read', 'read', 'read', 'read', 'read', 'ensure'])
  owners.dispose()
  assert.equal(new Set(released).size, 5)
  assert.equal(released.length, 5)
})

test('browser fetch is called without the RoleClient receiver', async () => {
  const f = fixture()
  const request = async function (_url, options) {
    assert.equal(this, undefined, 'native browser fetch must not receive a RoleClient as this')
    assert.equal(JSON.parse(options.body).action, 'read')
    return { ok: true, status: 200, json: async () => ({ binding: null }) }
  }
  const owner = new RoleClient({ sessions: {}, workspaces: { list: { getSnapshot: () => ({ phase: 'ready', state: 'idle', archivedSessionIds: [] }), subscribe: () => () => {} } } }, request)
  try { await owner.open(key); assert.equal(owner.getSnapshot().error, null) }
  finally { owner.dispose(); f.owner.dispose() }
})
