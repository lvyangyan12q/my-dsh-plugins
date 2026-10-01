import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const React = require('react'), { act } = React
const h = React.createElement
const key = { appId: 'example', instanceId: 'default', roleId: 'teacher', subject: 'math' }
const skill = { name: 'existing-skill', description: 'Actual registry fixture', source: 'bundled', provider: 'example', userInvocable: true, modelInvocable: false, appIds: ['example'] }
const role = { key, presetId: 'example.teacher', name: 'Teacher', source: 'app-declaration', available: true, binding: null,
  assignment: { version: 1, key, names: [], revision: 0 }, skills: [skill], missingNames: [], tools: [{ name: 'read_file', description: 'Read' }], scope: 'preset', model: null,
  permissions: { currentValue: null, sandboxMode: null, approvalPolicy: null, workspaceRoot: null, provenance: 'unavailable' }, loaded: [] }

test('built shared catalog displays app-owned roles once, saves existing names by revision, and keeps discovered/assigned/native history distinct', async () => {
  const dom = new JSDOM('<div id="mount"></div>', { url: 'http://localhost' })
  const globals = new Map()
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  const declarations = [], cleanups = [], calls = [], navigations = []
  let exported, workbench, current = structuredClone(role)
  class ResizeObserver { constructor(callback) { this.callback = callback } observe() { this.callback() } disconnect() {} }
  runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    console, AbortController, ResizeObserver, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    window: Object.assign(dom.window, { __ModuleLoader__: { load: ({ factory }) => { exported = factory(require) } } }),
    fetch: async (path, options) => {
      assert.equal(path, '/api/personal-workbench/management'); assert.equal(options.credentials, 'same-origin')
      const request = JSON.parse(options.body); calls.push(request)
      if (request.action === 'catalog') return { ok: true, json: async () => ({ version: 1, roles: [current], presets: [], skills: [skill], models: null, runtimeAvailable: true }) }
      assert.equal(request.action, 'assign'); assert.deepEqual(request.key, key); assert.equal(request.expectedRevision, current.assignment.revision)
      current = { ...current, assignment: { ...current.assignment, names: request.names, revision: current.assignment.revision + 1 } }
      return { ok: true, json: async () => ({ assignment: current.assignment }) }
    },
  })
  const ctx = {
    inject: () => {}, get: name => name === 'pluginNavigation' ? { openBundle: name => navigations.push(name) } : undefined,
    effect: execute => { const dispose = execute(); if (typeof dispose === 'function') cleanups.push(dispose); return dispose },
    reflect: { provide: (name, value) => { if (name === 'personalWorkbench') workbench = value; return () => {} } },
    sessions: { retain: () => assert.fail('Management must not acquire chat') }, workspaces: { list: { getSnapshot: () => ({ phase: 'ready', state: 'idle', archivedSessionIds: [] }), subscribe: () => () => {} } },
    locale: { register: () => () => {} },
    slots: { inject: (_name, execute) => cleanups.push(execute()), register: (options, component) => { declarations.push({ options, component }); return () => {} } },
  }
  exported.apply(ctx)
  assert.equal(calls.length, 0)
  const withdraw = workbench.registerApp({ id: 'example', name: 'Example App', version: '1', source: 'test registration', icon: 'book-open', pages: [{ id: 'page', label: 'Page' }], defaultLayout: { width: 800, height: 600, pageId: 'page' }, roles: [{ id: 'teacher', name: 'Teacher' }] })
  workbench.openWorkspace()
  const entry = declarations.find(row => row.options.id === 'personal-workbench.workspace')
  const injected = entry.options.inject(), { hooks, ...commands } = injected
  const { createRoot } = require('react-dom/client'), root = createRoot(dom.window.document.getElementById('mount'))
  const click = async label => {
    const button = [...dom.window.document.querySelectorAll('button')].find(row => !row.closest('[hidden]') && (row.getAttribute('aria-label') === label || row.textContent === label))
    assert.ok(button, `Missing button ${label}`); await act(async () => button.click())
  }
  try {
    await act(async () => root.render(h(entry.component, { ...commands, t: value => value,
      useWorkbench: selector => selector(React.useSyncExternalStore(hooks.workbench.subscribe, hooks.workbench.getSnapshot)), renderSlot: () => null })))
    await click('agents')
    assert.equal(calls.length, 1)
    assert.equal(dom.window.document.querySelectorAll('.pwb-role-row').length, 1)
    assert.match(dom.window.document.body.textContent, /Example App/)
    await act(async () => dom.window.document.querySelector('.pwb-role-row').click())
    assert.match(dom.window.document.body.textContent, /nativeDefault/)
    assert.match(dom.window.document.body.textContent, /nativeLoadEvidence/)
    assert.equal(dom.window.document.querySelector('.pwb-role-detail ul'), null)
    await act(async () => dom.window.document.querySelector('.pwb-skill-row input').click())
    await click('saveAssignment')
    assert.deepEqual(current.assignment.names, ['existing-skill'])
    assert.equal(current.assignment.revision, 1)
    assert.equal(dom.window.document.querySelector('.pwb-role-detail ul'), null, 'Saving assignment must not claim native body load')
    await click('nativeConfiguration')
    assert.deepEqual(navigations, ['@deepseek-ai/dsh-personal-workbench'])
    await click('skills')
    assert.match(dom.window.document.body.textContent, /roleScope/)
    await click('applications')
    assert.equal(dom.window.document.querySelector('.pwb-workarea').hidden, false)
    assert.equal(calls.some(row => ['ensure', 'teach', 'send'].includes(row.action)), false)
  } finally {
    await act(async () => root.unmount()); withdraw()
    for (const dispose of cleanups.reverse()) if (typeof dispose === 'function') await dispose()
    dom.window.close()
    for (const [name, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name] }
  }
})
