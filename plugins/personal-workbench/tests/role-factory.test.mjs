import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

test('actual Cordis/SlotRegistry optional role factory delegates native content and unloads without base registration loss', async () => {
  const source = process.env.DSH_SOURCE
  assert.ok(source)
  const require = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
  const { Context } = require('@deepseek-ai/cordis')
  function load(code) {
    let exports
    runInNewContext(code, { console, AbortController, fetch: () => assert.fail('No request at registration'),
      window: { localStorage: { getItem: () => null, setItem: () => {} }, __ModuleLoader__: { load: ({ factory }) => { exports = factory(require) } } } })
    return exports
  }
  const renderer = load(await readFile(resolve(source, 'packages/client/ui-renderer/lib/client.js'), 'utf8'))
  const plugin = load(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'))
  const ctx = new Context()
  const registry = ctx.plugin(renderer.SlotRegistry); await registry
  const seed = ctx.plugin({ inject: ['slots'], apply: child => {
    child.slots.register({ name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' }, 'sidebar.footer.action': { kind: 'list', scope: 'root' } } }, () => null)
    for (const [name, value] of Object.entries({ sessions: { retain: () => assert.fail('No Session at registration'), using: () => assert.fail('No command') }, workspaces: { list: {} }, uiSession: {}, uiConversation: {}, locale: { register: () => () => {} } })) child.effect(() => child.reflect.provide(name, value))
  } }); await seed
  let native, owner
  try {
    owner = ctx.plugin(plugin); await owner
    assert.ok(ctx.personalWorkbench)
    assert.equal(ctx.get('personalWorkbenchRoles'), undefined)
    assert.deepEqual(ctx.slots.snapshot('factory:personal-workbench.role-conversation'), [])
    const enable = async () => {
      native = ctx.plugin({ apply: child => { child.effect(() => child.reflect.provide('conversation', {})) } }); await native
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    await enable()
    assert.ok(ctx.personalWorkbenchRoles)
    const tree = ctx.slots.snapshot('factory:personal-workbench.role-conversation')
    assert.equal(tree.length, 1)
    assert.equal(tree[0].scope, 'root')
    const rows = ctx.slots.entries('personal-workbench.role-native')
    assert.equal(rows.length, 1)
    let factory
    const result = rows[0].component({ renderFactorySlot: (name, props) => { factory = { name, props }; return 'native-boundary' } })
    assert.equal(result, 'native-boundary')
    assert.equal(factory.name, 'conversation.content')
    assert.equal(factory.props.variant, 'embedded')
    assert.equal(factory.props.hero, false)
    await native.dispose()
    assert.equal(ctx.get('personalWorkbenchRoles'), undefined)
    assert.equal(ctx.slots.entries('personal-workbench.app').length, 0)
    assert.equal(ctx.slots.entries('shell.overlay').length, 2)
    assert.deepEqual(ctx.slots.snapshot('factory:personal-workbench.role-conversation'), [])
    await enable()
    assert.equal(ctx.slots.entries('personal-workbench.role-native').length, 1)
    await owner.dispose()
    assert.equal(ctx.get('personalWorkbenchRoles'), undefined)
    assert.deepEqual(ctx.slots.snapshot('factory:personal-workbench.role-conversation'), [])
  } finally { await native?.dispose(); await owner?.dispose(); await seed.dispose(); await registry.dispose(); await ctx.fiber.dispose() }
})
