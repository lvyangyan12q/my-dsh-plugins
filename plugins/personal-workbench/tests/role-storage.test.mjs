import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { roleBindingsDomain } from '../src/role-domain.ts'
import { RoleBindings } from '../src/role-bindings.ts'

const source = process.env.DSH_SOURCE
assert.ok(source, 'Set DSH_SOURCE to a built official checkout')
const require = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
const { Context } = require('@deepseek-ai/cordis')
const { default: Storage } = await import(pathToFileURL(resolve(source, 'packages/storage/storage/lib/index.js')))
const { JsonStorageBackend } = await import(pathToFileURL(resolve(source, 'packages/storage/storage-json/lib/index.js')))
const { DomainFacility } = await import(pathToFileURL(resolve(source, 'packages/storage/storage-domain/lib/index.js')))
test('actual DomainFacility and JSON medium persist intent, close their handle and recover exact ID after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-roles-'))
  const key = { appId: 'kaogong', instanceId: 'default', roleId: 'teacher' }
  const created = []
  const boot = async () => {
    const ctx = new Context(); await ctx.plugin(Storage)
    const backend = new JsonStorageBackend(root)
    ctx.storage.backend.register('json', backend)
    const facility = new DomainFacility(ctx, { backend: 'json', routes: {} })
    ctx.storage.mount('domain', facility)
    const domain = await facility.open(roleBindingsDomain)
    return { ctx, backend, facility, domain, close: async () => { await domain.close(); await backend.close(); await ctx.fiber.dispose() } }
  }
  let first, second
  try {
    first = await boot()
    const interrupted = new RoleBindings(first.domain.table('bindings'), { presetId: 'teacher', validate: async () => {}, create: async row => { created.push(row.sessionId); throw Error('interrupted') } }, () => 'durable-teacher')
    await assert.rejects(interrupted.ensure(key), /interrupted/)
    await assert.rejects(first.facility.open(roleBindingsDomain), /open/)
    await interrupted.dispose(); await first.close(); first = undefined
    second = await boot()
    const restored = new RoleBindings(second.domain.table('bindings'), { presetId: 'teacher', validate: async () => {}, create: async row => { created.push(row.sessionId); return row.sessionId } }, () => assert.fail('Restart must not allocate'))
    const intent = await restored.read(key)
    assert.equal(intent.phase, 'intent')
    assert.equal((await restored.retry(key, intent.sessionId)).sessionId, 'durable-teacher')
    assert.deepEqual(created, ['durable-teacher', 'durable-teacher'])
    await restored.dispose()
  } finally { await first?.close(); await second?.close(); await rm(root, { recursive: true, force: true }) }
})
