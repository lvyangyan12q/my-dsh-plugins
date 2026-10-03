import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

test('built plugin and optional consumer clean up and reactivate through real Cordis and official SlotRegistry', async () => {
  assert.ok(process.env.DSH_SOURCE, 'Set DSH_SOURCE to the built official checkout')
  const source = process.env.DSH_SOURCE
  const require = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
  const { Context } = require('@deepseek-ai/cordis')
  function load(code) {
    let exports
    runInNewContext(code, { console, AbortController,
      window: { localStorage: { getItem: () => null, setItem: () => {} }, __ModuleLoader__: { load: ({ factory }) => { exports = factory(require) } } },
      fetch: async url => { assert.equal(url, '/api/personal-workbench/apps'); return {ok:true,json:async()=>({version:1,states:[]})} },
    })
    return exports
  }
  const renderer = load(await readFile(resolve(source, 'packages/client/ui-renderer/lib/client.js'), 'utf8'))
  const plugin = load(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'))
  const ctx = new Context()
  let acquisitions = 0, activations = 0
  const registry = ctx.plugin(renderer.SlotRegistry)
  await registry
  const seed = ctx.plugin({ inject: ['slots'], apply: child => {
    child.slots.register({ name: 'root', children: {
      'shell.overlay': { kind: 'list', scope: 'root' }, 'sidebar.footer.action': { kind: 'list', scope: 'root' },
    } }, () => null)
    for (const [name, service] of Object.entries({
      sessions: { retain: () => { acquisitions++; assert.fail('No Session acquisition') } },
      workspaces: { list: { getSnapshot: () => ({ phase: 'ready', state: 'idle', archivedSessionIds: [] }), subscribe: () => () => {} } },
      uiSession: {}, uiConversation: {}, locale: { register: () => () => {} },
    })) child.effect(() => child.reflect.provide(name, service))
  } })
  await seed
  const consumer = ctx.inject(['personalWorkbench', 'slots'], child => {
    activations++
    child.slots.inject('personal-workbench.app', () => {
      const removeView = child.slots.register({ name: 'personal-workbench.app', key: 'test.lifecycle' }, () => null)
      const removeApp = child.personalWorkbench.registerApp({ id: 'test.lifecycle', name: 'Lifecycle fixture', version: '1', source: 'test', icon: 'book-open',
        pages: [{ id: 'page', label: 'Page' }], defaultLayout: { width: 600, height: 400, pageId: 'page' } })
      return () => { removeApp(); removeView() }
    })
  })
  let owner
  try {
    assert.equal(activations, 0)
    owner = ctx.plugin(plugin)
    await owner
    await consumer
    assert.equal(activations, 1)
    assert.equal(ctx.slots.entries('personal-workbench.app').length, 1)
    assert.equal(ctx.slots.entries('shell.overlay').length, 3, 'launcher, workspace and independent management overlays')
    const old = ctx.personalWorkbench
    assert.equal(old.getSnapshot().definitions.length, 1)
    await old.loadLifecycle()
    old.openApp('test.lifecycle')
    await owner.dispose()
    assert.equal(ctx.get('personalWorkbench'), undefined)
    assert.equal(ctx.slots.entries('personal-workbench.app').length, 0)
    assert.equal(ctx.slots.entries('shell.overlay').length, 0)
    assert.equal(ctx.slots.entries('sidebar.footer.action').length, 0)
    assert.equal(old.getSnapshot().definitions.length, 0)
    owner = ctx.plugin(plugin)
    await owner
    await consumer
    assert.equal(activations, 2)
    assert.equal(ctx.slots.entries('personal-workbench.app').length, 1)
    assert.equal(ctx.personalWorkbench.getSnapshot().definitions.length, 1)
    await consumer.dispose()
    assert.equal(ctx.personalWorkbench.getSnapshot().definitions.length, 0)
    assert.equal(ctx.slots.entries('personal-workbench.app').length, 0)
    assert.equal(acquisitions, 0)
  } finally {
    await consumer.dispose()
    await owner?.dispose()
    await seed.dispose()
    await registry.dispose()
    await ctx.fiber.dispose()
  }
})
