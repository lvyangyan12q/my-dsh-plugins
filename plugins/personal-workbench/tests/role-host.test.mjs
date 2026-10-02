import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Readable } from 'node:stream'
import { installRoles } from '../src/role-host.ts'
import { kaogongRolePresets, kaogongRoleDefinitions, legacyTeacherPresetId as teacherPresetId, teachingSkillProvider as teacherSkillProvider } from '../../kaogong/src/role-definitions.ts'
const teacherPreset = (await kaogongRolePresets())[0]
import { apply } from '../src/index.ts'

const key = { appId: 'kaogong', instanceId: 'default', roleId: 'teacher' }
test('base Host without optional role authorities preserves the read-only proof and returns a local 503', () => {
  const routes = []
  const ctx = { on: () => () => {}, effect: action => action(), inject: () => {}, webServer: { register: route => { routes.push(route); return () => {} } } }
  apply(ctx, { teacherSessionId: 'configured-proof' })
  const call = (path, method) => {
    let status, value
    routes.find(route => route.path === path).handler({ method }, { writeHead: code => { status = code }, end: data => { value = JSON.parse(data) } })
    return { status, value }
  }
  assert.equal(call('/api/personal-workbench/roles', 'POST').status, 503)
  assert.deepEqual(call('/api/personal-workbench/teacher', 'GET'), { status: 200, value: { version: 1, sessionId: 'configured-proof' } })
})
// Public authority/HTTP fixtures, not a fake conversation or a runtime-acceptance claim.
async function fixture() {
  const rows = new Map(), created = [], events = []
  let rejection, broken = false, skillMissing = false, sessionMissing = false, presetChanged = false, flushFailure = false
  const ctx = {
    on: () => () => {},
    storageDomain: { open: async spec => { events.push(spec.name); return { table: name => { assert.equal(name, 'bindings'); return { get: key => rows.get(key), put: async (key, row) => { rows.set(key, row); events.push('persist') } } }, close: async () => events.push('close-domain') } } },
    agentPresets: { register: async definition => { assert.equal(definition, teacherPreset); events.push('register-preset'); return async () => events.push('remove-preset') }, resolve: async id => { assert.equal(id, teacherPresetId); return { id, broken: broken ? 'missing' : undefined } }, acquireScope: async () => ({ key: {}, [Symbol.asyncDispose]: async () => events.push('release-scope') }) },
    skills: { list: async () => skillMissing ? [] : [{ name: 'kaogong-teach', provider: teacherSkillProvider }], get: async () => ({ name: 'kaogong-teach', provider: teacherSkillProvider, content: 'packaged body', invocation: { userInvocable: true } }) },
    sessionController: { projections: async () => sessionMissing ? null : { values: { agentPreset: presetChanged ? 'other' : teacherPresetId } }, create: async request => { assert.equal(rows.size, 1); assert.equal(events.includes('persist'), true); created.push(request); return { sessionId: request.sessionId, agentPreset: request.agentPreset } } },
    sessionPersistence: { flush: async () => { events.push('native-durability'); if (flushFailure) throw Error('Native flush failed') } },
    connection: { requestRejection: () => rejection }, reflect: { provide: (name, value) => { assert.equal(name, 'personalWorkbenchBindings'); ctx.binding = value; return () => { delete ctx.binding } } },
  }
  const owner = await installRoles(ctx)
  ctx.binding.registerRole(kaogongRoleDefinitions('C:/learning')[0])
  const call = async (body, method = 'POST', type = 'application/json') => {
    const req = Readable.from([typeof body === 'string' ? body : JSON.stringify(body)])
    req.method = method; req.headers = { 'content-type': type }
    let status, content
    const res = { setHeader() {}, writeHead(value) { status = value }, end(value) { content = value } }
    await owner.handle(req, res)
    return { status, value: content ? JSON.parse(content) : null }
  }
  return { ctx, owner, rows, created, events, call, deny: value => { rejection = value }, broken: () => { broken = true }, missingSkill: () => { skillMissing = true }, missingSession: () => { sessionMissing = true }, changedPreset: () => { presetChanged = true }, flushFailure: value => { flushFailure = value } }
}
test('Host route authenticates before parsing and bounds methods, type, bytes and supported values with zero creation', async () => {
  const f = await fixture()
  try {
    assert.deepEqual(f.created, [])
    f.deny(401); assert.equal((await f.call('not-json')).status, 401)
    f.deny(403); assert.equal((await f.call({ action: 'ensure', key })).status, 403)
    f.deny(undefined)
    assert.equal((await f.call({}, 'GET')).status, 405)
    assert.equal((await f.call({}, 'POST', 'text/plain')).status, 415)
    assert.equal((await f.call('not-json')).status, 400)
    assert.equal((await f.call('x'.repeat(131073))).status, 413)
    assert.equal((await f.call({ action: 'ensure', key: { ...key, roleId: 'other' } })).status, 409)
    assert.equal((await f.call({ action: 'read', key })).value.binding, null)
    assert.deepEqual(f.created, [])
  } finally { await f.owner.dispose() }
  assert.equal(f.events.at(-1), 'close-domain')
})
test('Host teaching uses an explicit preset and literal slash preparation; missing ready preset never defaults', async () => {
  const f = await fixture()
  try {
    const first = await f.call({ action: 'teach', key, evidence: { kind: 'lesson', context: { subject: 'math', title: 'target', limit: 5 } } })
    assert.equal(first.status, 200)
    assert.equal(first.value.binding.presetId, teacherPresetId)
    assert.ok(first.value.prompt.startsWith('/kaogong-teach '))
    assert.equal(first.value.skill.preflightBodyReadable, true)
    assert.equal(first.value.skill.bodyLoaded, undefined, 'Preflight must not claim native turn injection')
    assert.equal(f.created.length, 1)
    assert.equal(f.created[0].sessionId, first.value.binding.sessionId)
    f.broken()
    const failed = await f.call({ action: 'retry', key, expectedSessionId: first.value.binding.sessionId })
    assert.equal(failed.status, 409)
    assert.equal(failed.value.binding.sessionId, first.value.binding.sessionId)
    assert.equal(f.created.length, 1)
  } finally { await f.owner.dispose() }
})
test('missing actual Skill blocks allocation; preset declares only trusted package roots and non-complete scoped persona', async () => {
  const f = await fixture()
  try { f.missingSkill(); assert.equal((await f.call({ action: 'ensure', key })).status, 409); assert.equal(f.rows.size, 0); assert.deepEqual(f.created, []) }
  finally { await f.owner.dispose() }
  const persona = teacherPreset.plugins.find(row => row.name === '@deepseek-ai/dsh-persona').config
  const filesystem = teacherPreset.plugins.find(row => row.name === '@deepseek-ai/dsh-skill-filesystem').config
  assert.equal(persona.complete, false)
  assert.equal(filesystem.includeDefaultRoots, false)
  assert.deepEqual(filesystem.customSkillDirs, [])
  assert.equal(filesystem.watch, false)
  assert.ok(filesystem.bundledSkillDir.replaceAll('\\', '/').endsWith('/plugins/kaogong/roles/skills/'))
  assert.ok(teacherPreset.plugins.some(row => row.name === '@deepseek-ai/dsh-tool-skill'))
})
test('ready missing or preset-changed Sessions keep their binding and never recreate on read/ensure', async () => {
  for (const invalidate of ['missingSession', 'changedPreset']) {
    const f = await fixture()
    try {
      const ready = (await f.call({ action: 'ensure', key })).value.binding
      f[invalidate]()
      for (const action of ['read', 'ensure']) {
        const response = await f.call({ action, key })
        assert.equal(response.status, 409)
        assert.equal(response.value.binding.sessionId, ready.sessionId)
      }
      assert.equal(f.created.length, 1)
    } finally { await f.owner.dispose() }
  }
})

test('native blank header durability precedes ready; failed flush leaves a same-ID retryable intent', async () => {
  const f = await fixture()
  try {
    f.flushFailure(true)
    const failed = await f.call({ action: 'ensure', key })
    assert.equal(failed.status, 409)
    assert.equal(failed.value.binding.phase, 'intent')
    const id = failed.value.binding.sessionId
    assert.deepEqual(f.events.slice(-2), ['persist', 'native-durability'])
    f.flushFailure(false)
    const ready = await f.call({ action: 'retry', key, expectedSessionId: id })
    assert.equal(ready.status, 200)
    assert.equal(ready.value.binding.phase, 'ready')
    assert.equal(ready.value.binding.sessionId, id)
    assert.deepEqual(f.created.map(row => row.sessionId), [id, id])
    assert.deepEqual(f.events.slice(-2), ['native-durability', 'persist'])
    assert.ok(f.created.every(row => row.cwd === 'C:/learning'))
  } finally { await f.owner.dispose() }
})
