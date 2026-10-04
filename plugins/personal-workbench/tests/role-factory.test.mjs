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
    for (const [name, value] of Object.entries({ sessions: { retain: () => assert.fail('No Session at registration'), using: () => assert.fail('No command') }, workspaces: { list: {} }, uiSession: {}, locale: { register: () => () => {} } })) child.effect(() => child.reflect.provide(name, value))
  } }); await seed
  let native, owner
  try {
    owner = ctx.plugin(plugin); await owner
    assert.ok(ctx.personalWorkbench)
    // Exercise the actual registered independent-teacher occupant, not a local
    // replica of its JSX. The current Session comes from its owning Provider;
    // inspect the requested native factories before rendering either assembly.
    const independentTeacher = ctx.slots.entries('personal-workbench.teacher')[0]
    assert.ok(independentTeacher)
    const teacherFactories = []
    independentTeacher.component({
      useSession: selector => selector({ removed: false, openState: 'open' }),
      renderFactorySlot: (name, props) => { teacherFactories.push({ name, props }); return null },
      t: key => key, retry: () => assert.fail('Mount must not retry or create a Session'),
    })
    assert.deepEqual(teacherFactories.map(row => row.name).sort(), ['conversation.content', 'conversation.session.chrome'], 'Independent study window must mount the native Session title, lineage, actions and view tabs beside the body')
    assert.equal(teacherFactories.find(row => row.name === 'conversation.session.chrome').props.hideChrome, false)
    const inaccessible = independentTeacher.component({
      useSession: selector => selector({ removed: false, openState: 'closed' }),
      renderFactorySlot: () => assert.fail('Closed Session must not mount native surfaces'),
      t: key => key, retry: () => Promise.resolve(),
    })
    assert.equal(inaccessible.props.role, 'alert')
    const unavailable = independentTeacher.component({
      useSession: selector => selector({ removed: false, openState: 'open', lastAgentError: 'Teacher request failed' }),
      renderFactorySlot: (_name, _props, options) => options.fallback,
      t: key => key, retry: () => Promise.resolve(),
    })
    assert.equal(unavailable.props.style.display, 'flex')
    assert.equal(unavailable.props.children[0].props.children.props.role, 'alert', 'A missing native factory must be visible, never silently hide the title')
    assert.equal(unavailable.props.children[1].props.children, 'Teacher request failed')
    assert.equal(unavailable.props.children[2].props.style.minHeight, 0)
    assert.equal(ctx.get('personalWorkbenchRoles'), undefined)
    assert.deepEqual(ctx.slots.snapshot('factory:personal-workbench.role-conversation'), [])
    const enable = async () => {
      native = ctx.plugin({ apply: child => { child.effect(() => child.reflect.provide('uiConversation', {})) } }); await native
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    await enable()
    assert.ok(ctx.personalWorkbenchRoles)
    const tree = ctx.slots.snapshot('factory:personal-workbench.role-conversation')
    assert.equal(tree.length, 1)
    assert.equal(tree[0].scope, 'root')
    const rows = ctx.slots.entries('personal-workbench.role-native')
    assert.equal(rows.length, 1)
    let factory, chrome
    const result = rows[0].component({ useSession: selector => selector({}), renderFactorySlot: (name, props) => { if (name === 'conversation.session.chrome') chrome = { name, props }; else factory = { name, props }; return 'native-boundary' } })
    assert.equal(result.type, 'div')
    assert.equal(result.props.style.display, 'flex', 'Native flex body needs a bounded flex parent')
    assert.equal(result.props.style.flexDirection, 'column')
    assert.equal(result.props.style.height, '100%')
    assert.equal(result.props.style.minHeight, 0)
    assert.equal(result.props.style.overflow, 'hidden')
    const seat = result.props.children[2]
    assert.equal(seat.props.style.display, 'flex')
    assert.equal(seat.props.style.flex, 1)
    assert.equal(seat.props.style.minHeight, 0)
    assert.equal(seat.props.children, 'native-boundary')
    const failed = rows[0].component({ useSession: selector => selector({ lastAgentError: 'synthetic error' }), renderFactorySlot: () => 'native-boundary' })
    assert.equal(failed.props.children[1].props.role, 'alert')
    assert.equal(failed.props.children[1].props.style.flexShrink, 0)
    assert.equal(failed.props.children[2].props.style.minHeight, 0, 'Error must not push the composer outside the bounded pane')
    assert.equal(chrome.name, 'conversation.session.chrome')
    assert.equal(chrome.props.hideChrome, false)
    assert.equal(factory.name, 'conversation.content')
    assert.equal(factory.props.variant, 'embedded')
    assert.equal(factory.props.hero, false)
    await native.dispose()
    assert.equal(ctx.get('personalWorkbenchRoles'), undefined)
    assert.equal(ctx.slots.entries('personal-workbench.app').length, 0)
    assert.equal(ctx.slots.entries('shell.overlay').length, 3, 'launcher, workspace and independent management overlays')
    assert.deepEqual(ctx.slots.snapshot('factory:personal-workbench.role-conversation'), [])
    await enable()
    assert.equal(ctx.slots.entries('personal-workbench.role-native').length, 1)
    await owner.dispose()
    assert.equal(ctx.get('personalWorkbenchRoles'), undefined)
    assert.deepEqual(ctx.slots.snapshot('factory:personal-workbench.role-conversation'), [])
  } finally { await native?.dispose(); await owner?.dispose(); await seed.dispose(); await registry.dispose(); await ctx.fiber.dispose() }
})
