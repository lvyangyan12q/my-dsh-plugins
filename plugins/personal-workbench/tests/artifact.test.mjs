import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

test('built client registers one explicit provider seat and delegates the entire native conversation', async () => {
  const declarations = []
  const cleanups = []
  const retained = []
  let fetches = 0
  let exports
  const require = createRequire(process.env.DSH_SOURCE ? resolve(process.env.DSH_SOURCE, 'packages/client/ui-conversation/package.json') : import.meta.url)
  // No chat substitute: this checks the packaged plugin's registration and factory inputs only.
  runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    AbortController,
    window: { __ModuleLoader__: { load: ({ id, factory }) => {
      assert.equal(id, '@deepseek-ai/dsh-personal-workbench')
      exports = factory(name => {
        assert.ok(['react', 'react/jsx-runtime'].includes(name), `unexpected browser import: ${name}`)
        return require(name)
      })
    } } },
    fetch: async (_path, options) => {
      fetches++
      assert.equal(options.credentials, 'same-origin')
      return { ok: true, json: async () => ({ version: 1, sessionId: 'synthetic-teacher' }) }
    },
  })
  let releases = 0
  const reference = {
    sessionId: 'synthetic-teacher',
    binding: { session: { getSnapshot: () => ({ openState: 'open' }) } },
    ready: Promise.resolve(), release: () => { releases++ },
  }
  const ctx = {
    effect: execute => { const cleanup = execute(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
    sessions: { retain: (id, options) => { retained.push({ id, source: options.source }); return reference } },
    locale: { register: () => () => {} },
    slots: {
      inject: (_name, execute) => { const cleanup = execute(); if (typeof cleanup === 'function') cleanups.push(cleanup) },
      register: (options, component) => { declarations.push({ options, component }); return () => {} },
    },
  }
  exports.apply(ctx)
  assert.equal(fetches, 0, 'registration must not read sessions or call the model')
  assert.equal(retained.length, 0)
  const overlay = declarations.find(row => row.options.name === 'shell.overlay')
  assert.equal(overlay.options.id, 'personal-workbench')
  assert.equal(overlay.options.children['personal-workbench.teacher'].scope, 'session')
  const injected = overlay.options.inject()
  await injected.open()
  assert.deepEqual(retained, [{ id: 'synthetic-teacher', source: 'personalWorkbenchTeacher' }])
  assert.equal(injected.hooks.teacherWindow.getSnapshot().reference, reference)
  const native = declarations.find(row => row.options.name === 'personal-workbench.teacher')
  let factory
  const rendered = native.component({
    sessionId: 'synthetic-teacher', useSession: selector => selector({ openState: 'open' }), t: key => key,
    renderFactorySlot: (name, props) => { factory = { name, props }; return 'native-factory-occurrence' },
  })
  assert.equal(rendered, 'native-factory-occurrence')
  assert.equal(factory.name, 'conversation.content')
  assert.equal(factory.props.variant, 'embedded')
  assert.equal(factory.props.hero, false)
  injected.close()
  assert.equal(releases, 1)
  for (const cleanup of cleanups.reverse()) cleanup()
  assert.equal(releases, 1)
  assert.equal(declarations.length, 3)
})
