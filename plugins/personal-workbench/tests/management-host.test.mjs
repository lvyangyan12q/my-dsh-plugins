import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import { installManagement } from '../src/management-host.ts'
import { managementDomain, assignmentRecord } from '../src/management-domain.ts'
import { bindingKey, RoleBindings } from '../src/role-bindings.ts'

const source = process.env.DSH_SOURCE
assert.ok(source, 'Set DSH_SOURCE to a built official checkout')
const require = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
const { Context } = require('@deepseek-ai/cordis')
const built = path => import(pathToFileURL(resolve(source, path, 'lib/index.js')).href)
const { default: Storage } = await built('packages/storage/storage')
const { JsonStorageBackend } = await built('packages/storage/storage-json')
const { DomainFacility } = await built('packages/storage/storage-domain')
const key = { appId: 'example', instanceId: 'default', roleId: 'teacher', subject: 'math' }

async function fixture(root) {
  const ctx = new Context(); await ctx.plugin(Storage)
  const backend = new JsonStorageBackend(root)
  ctx.storage.backend.register('json', backend)
  const facility = new DomainFacility(ctx, { backend: 'json', routes: {} }); ctx.storage.mount('domain', facility)
  let rejection, missing = false, changed = false, broken = false, complete = true, disposedProvider = false, archived = false
  const bindings = new RoleBindings({ get: () => null, put: async () => assert.fail('Management must not create Sessions') },
    { validate: async () => {}, create: async () => assert.fail('Unexpected native creation') })
  bindings.registerRole({ key, presetId: 'example.teacher', creation: { cwd: 'C:/synthetic-workspace' }, teaching: { skillName: 'registered-skill', provider: 'example-provider' } })
  const legacyKey = { ...key }; delete legacyKey.subject
  bindings.registerRole({ key: legacyKey, presetId: 'example.legacy', creation: { cwd: 'C:/synthetic-workspace' } })
  let ready = false
  const publicBindings = { listRoles: () => bindings.listRoles(), read: async roleKey => ready && bindingKey(roleKey) === bindingKey(key) ? {
    version: 1, key, sessionId: 'exact-role-session', presetId: 'example.teacher', phase: 'ready', previousSessionIds: [],
  } : null }
  const metadata = { name: 'registered-skill', description: 'Registered fixture metadata', provider: 'example-provider', source: 'runtime', invocation: { userInvocable: true, modelInvocable: false }, path: 'C:/private/path', metadata: { token: 'never-export' } }
  const scopes = []
  const authority = {
    get: name => name === 'workspaceRegistry' ? { archivedSessionIds: archived ? ['exact-role-session'] : [] } : undefined,
    storageDomain: facility, personalWorkbenchBindings: publicBindings,
    agentPresets: { resolve: async id => ({ id, broken: broken ? 'broken' : undefined }),
      acquireScope: async id => { const scope = { id }; scopes.push(scope); return { key: scope, [Symbol.asyncDispose]: async () => scopes.splice(scopes.indexOf(scope), 1) } },
      list: async () => [{ id: 'example.teacher' }, { id: 'example.legacy' }, { id: 'native.unowned', name: 'Native', secret: 'never-export' }], serviceFor: () => undefined },
    agents: { get: () => undefined }, tools: { schemas: scope => { assert.ok(scope, 'Tools must be scoped'); return [{ name: 'fixture-tool', description: 'Visible', config: { token: 'never-export' } }] } },
    skills: { snapshot: async () => ({ complete, skills: disposedProvider ? [] : [metadata] }), get: () => assert.fail('Catalog/save must not read Skill bodies') },
    sessionController: {
      projections: async request => { assert.equal(request.sessionId, 'exact-role-session'); return missing ? null : { values: { agentPreset: changed ? 'other' : 'example.teacher', modelSelection: { lastUsed: { provider: 'observed', model: 'used' }, next: { provider: 'observed', model: 'next' } }, permissions: { currentValue: 'native-fixture' } } } },
      inspect: async () => ({ meta: { cwd: 'C:/recorded-workspace' }, events: [{ type: 'user/message', seq: 8, data: { source: { kind: 'skill-invocation', name: 'registered-skill', form: 'instructions' }, content: [{ type: 'text', text: 'actual inspected fixture body' }] } }] }),
      modelCatalog: () => assert.fail('No provider IO in management reads'), create: () => assert.fail('No Session creation'), selectModel: () => assert.fail('No global model default mutation'),
    },
    connection: { requestRejection: () => rejection }, on: () => () => {},
  }
  const owner = await installManagement(authority)
  const call = async (body, method = 'POST', type = 'application/json') => {
    const req = Readable.from([typeof body === 'string' ? body : JSON.stringify(body)]); req.method = method; req.headers = { 'content-type': type }
    let status, value
    await owner.handle(req, { setHeader() {}, writeHead: code => { status = code }, end: text => { value = text ? JSON.parse(text) : null } })
    return { status, value }
  }
  return { call, scopes, owner, ready: () => { ready = true }, deny: value => { rejection = value }, missing: () => { missing = true }, changed: () => { changed = true }, broken: () => { broken = true }, incomplete: () => { complete = false }, removeProvider: () => { disposedProvider = true }, archived: () => { archived = true },
    close: async () => { await owner.dispose(); await bindings.dispose(); await backend.close(); await ctx.fiber.dispose() } }
}

test('real workbench DomainFacility/JSON assignments survive reopen, isolate full keys and reject stale concurrent saves', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-management-'))
  let first, second
  try {
    first = await fixture(root)
    const save = names => first.call({ action: 'assign', key, expectedRevision: 0, names })
    const results = await Promise.all([save(['registered-skill']), save([])])
    assert.deepEqual(results.map(row => row.status), [200, 409])
    assert.deepEqual(results[0].value.assignment.names, ['registered-skill'])
    assert.equal(first.scopes.length, 0)
    await first.close(); first = undefined
    second = await fixture(root)
    const catalog = (await second.call({ action: 'catalog' })).value
    assert.deepEqual(catalog.roles.find(row => row.key.subject === 'math').assignment.names, ['registered-skill'])
    assert.deepEqual(catalog.roles.find(row => row.key.subject === undefined).assignment.names, [])
    assert.equal(catalog.roles.find(row => row.key.subject === 'math').assignment.revision, 1)
    assert.deepEqual(catalog.presets.map(row => row.id), ['native.unowned'])
    assert.equal(catalog.roles[0].loaded.length, 0, 'Persistence/catalog must never imply bodies are loaded')
    second.ready()
    const observed = (await second.call({ action: 'catalog' })).value.roles.find(row => row.key.subject === 'math')
    assert.equal(observed.model.lastUsed.model, 'used'); assert.equal(observed.model.next.model, 'next')
    assert.deepEqual(observed.loaded, [{ name: 'registered-skill', seq: 8 }])
    assert.equal(observed.permissions.provenance, 'native-session-projection')
    assert.equal(JSON.stringify(catalog).includes('never-export'), false)
    assert.equal(JSON.stringify(catalog).includes('private/path'), false)
  } finally { await first?.close(); await second?.close(); await rm(root, { recursive: true, force: true }) }
})

test('authenticated bounded management route rejects malformed requests and invalid availability without native mutations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-management-'))
  const f = await fixture(root)
  try {
    f.deny(401); assert.equal((await f.call('bad')).status, 401); f.deny(undefined)
    assert.equal((await f.call({}, 'GET')).status, 405)
    assert.equal((await f.call({}, 'POST', 'text/plain')).status, 415)
    assert.equal((await f.call('bad')).status, 400)
    assert.equal((await f.call('x'.repeat(16385))).status, 413)
    for (const names of [['missing'], ['registered-skill', 'registered-skill'], ['/registered-skill']]) {
      assert.notEqual((await f.call({ action: 'assign', key, expectedRevision: 0, names })).status, 200)
    }
    assert.equal((await f.call({ action: 'assign', key, expectedRevision: 0, names: [], credentials: 'never-store' })).status, 400)
    assert.equal((await f.call({ action: 'assign', key: { ...key, subject: 'other' }, expectedRevision: 0, names: [] })).status, 409)
    f.incomplete()
    assert.equal((await f.call({ action: 'assign', key, expectedRevision: 0, names: ['registered-skill'] })).status, 409)
    assert.equal(f.scopes.length, 0)
    await f.owner.dispose()
    assert.equal((await f.call({ action: 'catalog' })).status, 503)
  } finally { await f.close(); await rm(root, { recursive: true, force: true }) }
})

test('ready role failure and provider loss stay explicit and keep persisted assignments', async () => {
  for (const invalidate of ['missing', 'changed', 'broken', 'removeProvider', 'archived']) {
    const root = await mkdtemp(join(tmpdir(), 'workbench-management-'))
    const f = await fixture(root)
    try {
      assert.equal((await f.call({ action: 'assign', key, expectedRevision: 0, names: ['registered-skill'] })).status, 200)
      f.ready(); f[invalidate]()
      const row = (await f.call({ action: 'catalog' })).value.roles.find(row => row.key.subject === 'math')
      assert.deepEqual(row.assignment.names, ['registered-skill'])
      assert.deepEqual(row.missingNames, ['registered-skill'])
      if (invalidate !== 'removeProvider') { assert.equal(row.available, false); assert.ok(row.error) }
      assert.equal((await f.call({ action: 'assign', key, expectedRevision: 1, names: ['registered-skill'] })).status, 409)
    } finally { await f.close(); await rm(root, { recursive: true, force: true }) }
  }
})

test('assignment domain admits only stable keys, names and revisions', () => {
  assert.equal(managementDomain.name, 'personal_workbench_management')
  assert.equal(assignmentRecord.safeParse({ version: 1, key, revision: 1, names: ['registered-skill'], bodyLoaded: true }).success, false)
  assert.equal(assignmentRecord.safeParse({ version: 1, key, revision: -1, names: [] }).success, false)
})
