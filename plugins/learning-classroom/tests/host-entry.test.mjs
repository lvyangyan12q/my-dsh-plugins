import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, classroomRoute, inject, name } from '../src/index.ts'
import { request } from './support/http.mjs'

test('Host 入口在公开路径注册路由，并用 learning_classroom v1 提供状态', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'learning-classroom-entry-'))
  const vault = join(folder, 'vault')
  await mkdir(vault)
  let stored = { schemaVersion: 1, vaultPath: null, spaces: [], currentSpaceId: null }
  let opened
  const routes = [], disposers = [], pending = []
  const services = {
    webServer: { register(route) { routes.push(route); return () => {} } },
    storageDomain: {
      open: async spec => {
        opened = spec
        return {
          global: { get: () => stored, set: async value => { stored = value } },
          close: async () => {},
        }
      },
    },
    connection: { requestRejection: () => undefined },
  }
  const ctx = {
    ...services,
    get: id => services[id],
    inject: (names, install) => { if (names.every(id => id in services)) install(ctx) },
    effect: install => {
      const value = install()
      if (typeof value === 'function') disposers.push(value)
      else if (value && typeof value.next === 'function') pending.push(value)
    },
  }

  try {
    assert.equal(name, 'learning-classroom')
    assert.deepEqual(inject, ['webServer'])
    assert.equal(classroomRoute, '/api/learning-classroom')
    apply(ctx)
    for (const generator of pending) {
      const step = await generator.next()
      if (typeof step.value === 'function') disposers.push(step.value)
    }

    assert.equal(routes.length, 1)
    assert.equal(routes[0].kind, 'exact')
    assert.equal(routes[0].path, classroomRoute)
    assert.equal(opened.name, 'learning_classroom')
    assert.equal(opened.version, 1)

    const empty = await request(routes[0].handler, { method: 'GET' })
    assert.equal(empty.status, 200)
    assert.equal(empty.body.vault.status, 'unset')

    const chosen = await request(routes[0].handler, { method: 'POST', body: { action: 'vault-choose', path: vault } })
    assert.equal(chosen.status, 200)
    assert.equal(chosen.body.vault.status, 'ready')
    assert.equal(stored.vaultPath, chosen.body.vault.path)
  } finally {
    for (const dispose of disposers.reverse()) await dispose()
    await rm(folder, { recursive: true, force: true })
  }
})
