import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const React = require('react')
const { act } = React
const h = React.createElement

// Test-only hook adapter for the documented inject-observable face. This is not a
// native Session renderer and supplies no chat, model, Session or transcript fixture.
function boundHook(source) {
  return selector => selector(React.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot))
}
async function fixture({ width = 960, height = 640 } = {}) {
  const dom = new JSDOM('<button id="origin">Origin</button><div id="mount"></div>', { url: 'http://localhost' })
  const globals = new Map()
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  class ResizeObserver {
    constructor(callback) { this.callback = callback }
    observe() { this.callback() }
    disconnect() {}
  }
  const { createRoot } = require('react-dom/client')
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { get: () => width })
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', { get: () => height })
  const declarations = [], cleanups = []
  let service, exports, fetches = 0, retained = 0, mounts = 0, unmounts = 0
  runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: Object.assign(dom.window, { __ModuleLoader__: { load: ({ factory }) => { exports = factory(require) } } }),
    document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver, AbortController, console,
    fetch: () => { fetches++; throw new Error('No Session acquisition authorized by this test') },
  })
  const ctx = {
    get: () => undefined, // Optional official plugin configuration navigation is absent.
    inject: () => {}, // Optional Better Sidebar is absent in this UI fixture.
    effect: execute => { const dispose = execute(); if (typeof dispose === 'function') cleanups.push(dispose); return dispose },
    reflect: { provide: (name, value) => { assert.equal(name, 'personalWorkbench'); service = value; return () => { service = undefined } } },
    sessions: { retain: () => { retained++; throw new Error('No Session call authorized') } },
    workspaces: { list: { getSnapshot: () => ({ phase: 'ready', state: 'idle', archivedSessionIds: [] }), subscribe: () => () => {} } },
    locale: { register: () => () => {} },
    slots: {
      inject: (_key, install) => { cleanups.push(install()) },
      register: (options, component) => {
        const entry = { options, component }
        declarations.push(entry)
        return () => { const index = declarations.indexOf(entry); if (index >= 0) declarations.splice(index, 1) }
      },
    },
  }
  exports.apply(ctx)
  const overlay = declarations.find(row => row.options.name === 'shell.overlay' && row.options.id === 'personal-workbench.workspace')
  const launcher = declarations.find(row => row.options.name === 'sidebar.footer.action' && row.options.id === 'personal-workbench.workspace')
  assert.deepEqual(JSON.parse(JSON.stringify(overlay.options.children)), { 'personal-workbench.app': { kind: 'keyed', scope: 'root' } })
  function Exercise({ active, pageId }) {
    const [answer, setAnswer] = React.useState('')
    const [submitted, setSubmitted] = React.useState(false)
    React.useEffect(() => { mounts++; return () => { unmounts++ } }, [])
    return h('section', null,
      h('output', { 'aria-label': 'Activity' }, String(active)), h('output', { 'aria-label': 'Selected page' }, pageId),
      h('input', { 'aria-label': 'Answer draft', value: answer, onChange: event => setAnswer(event.target.value) }),
      h('button', { onClick: () => setAnswer('retained answer') }, 'Enter answer'),
      h('button', { onClick: () => setSubmitted(true) }, 'Submit exercise'),
      h('output', { 'aria-label': 'Result' }, submitted ? 'Submitted' : 'In progress'))
  }
  const app = { id: 'test.exercise', version: '1', name: 'Exercise', source: 'UI test registration', icon: 'book-open',
    pages: [{ id: 'lesson', label: 'Lesson' }, { id: 'practice', label: 'Practice' }], defaultLayout: { width: 700, height: 500, pageId: 'lesson' } }
  const removeApp = service.registerApp(app)
  const removeView = ctx.slots.register({ name: 'personal-workbench.app', key: app.id }, Exercise)
  function Root() {
    const injected = overlay.options.inject()
    const { hooks, ...callbacks } = injected
    return h(React.Fragment, null,
      h(launcher.component, { wide: true, t: key => key, ...launcher.options.inject() }),
      h(overlay.component, { ...callbacks, useWorkbench: boundHook(hooks.workbench), t: key => key,
        renderSlot: (name, owner, options) => {
          assert.equal(name, 'personal-workbench.app')
          const entry = declarations.find(row => row.options.name === name && row.options.key === options.entryKey)
          return entry ? h(entry.component, owner) : options.fallback
        } }))
  }
  const root = createRoot(dom.window.document.getElementById('mount'))
  await act(async () => root.render(h(Root)))
  const button = label => [...dom.window.document.querySelectorAll('button')].find(element =>
    !element.closest('[hidden]') && (element.getAttribute('aria-label') === label || element.textContent === label))
  const click = async label => { const target = button(label); assert.ok(target, `Missing visible button: ${label}`); await act(async () => target.click()); return target }
  return { dom, ctx, declarations, service, root, removeApp, removeView, click, button,
    counts: () => ({ fetches, retained, mounts, unmounts }),
    async dispose() {
      await act(async () => root.unmount())
      for (const dispose of cleanups.reverse()) await dispose()
      dom.window.close()
      for (const [name, descriptor] of globals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete globalThis[name]
      }
    } }
}

test('packaged UI retains actual registered exercise state through pages, hide, minimize and close/reopen', async () => {
  const f = await fixture()
  try {
    await f.click('workspace')
    await f.click('Exercise')
    await f.click('Enter answer')
    await f.click('Practice')
    const input = f.dom.window.document.querySelector('input[aria-label="Answer draft"]')
    assert.equal(input.value, 'retained answer')
    await f.click('Submit exercise')
    await f.click('minimize: Exercise')
    assert.equal(input.isConnected, true)
    await f.click('Exercise')
    assert.equal(f.dom.window.document.querySelector('input[aria-label="Answer draft"]'), input)
    await f.click('maximize: Exercise')
    const frame = f.dom.window.document.querySelector('[role="region"]')
    assert.equal(frame.style.width, '960px')
    await f.click('closeWorkspace')
    assert.equal(input.isConnected, true)
    assert.equal(f.dom.window.document.querySelector('output[aria-label="Activity"]').textContent, 'false')
    await f.click('workspace')
    await f.click('restore: Exercise')
    await f.click('close: Exercise')
    assert.equal(input.isConnected, true)
    assert.equal(f.dom.window.document.querySelector('output[aria-label="Activity"]').textContent, 'false')
    await f.click('Exercise')
    assert.equal(f.dom.window.document.querySelector('input[aria-label="Answer draft"]'), input)
    assert.equal(input.value, 'retained answer')
    assert.equal(f.dom.window.document.querySelector('output[aria-label="Result"]').textContent, 'Submitted')
    assert.deepEqual(f.counts(), { fetches: 0, retained: 0, mounts: 1, unmounts: 0 })
  } finally { await f.dispose() }
})

test('packaged registry disposal removes the app UI, focus returns, and native proof stays independently registered', async () => {
  const f = await fixture()
  try {
    const origin = f.dom.window.document.getElementById('origin')
    origin.focus()
    await f.click('workspace')
    await f.click('Exercise')
    assert.equal(f.dom.window.document.activeElement.getAttribute('role'), 'region')
    const revision = f.service.getSnapshot().focusRevision
    await act(async () => f.service.openApp('test.exercise'))
    assert.ok(f.service.getSnapshot().focusRevision > revision)
    assert.equal(f.dom.window.document.querySelectorAll('[role="region"]').length, 1)
    await f.click('close: Exercise')
    assert.equal(f.dom.window.document.activeElement.textContent, 'Exercise')
    await f.click('Exercise')
    await act(async () => { f.removeView(); f.removeApp(); f.removeApp() })
    assert.equal(f.dom.window.document.querySelectorAll('[role="region"]').length, 0)
    assert.equal(f.counts().unmounts, 1)
    assert.ok(f.declarations.some(row => row.options.name === 'personal-workbench.teacher'))
    await f.click('closeWorkspace')
    assert.equal(f.dom.window.document.activeElement, origin)
    assert.equal(f.counts().fetches, 0)
    assert.equal(f.counts().retained, 0)
  } finally { await f.dispose() }
})

test('keyboard focus cycling and title movement preserve each registered app draft and delegate application Escape', async () => {
  const f = await fixture()
  try {
    const second = { id: 'test.notes', version: '1', name: 'Notes', source: 'UI test registration', icon: 'notebook',
      pages: [{ id: 'note', label: 'Note' }], defaultLayout: { width: 500, height: 400, pageId: 'note' } }
    function Notes() { return h('textarea', { 'aria-label': 'Note draft', defaultValue: 'note in progress' }) }
    await act(async () => { f.service.registerApp(second); f.ctx.slots.register({ name: 'personal-workbench.app', key: second.id }, Notes) })
    await f.click('workspace')
    await f.click('Exercise')
    await f.click('Enter answer')
    const draft = f.dom.window.document.querySelector('input[aria-label="Answer draft"]')
    await f.click('Notes')
    const note = f.dom.window.document.querySelector('textarea')
    note.value = 'unsent note'
    await act(async () => note.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(f.dom.window.document.querySelector('[role="dialog"]').hidden, false)
    await act(async () => note.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'F6', ctrlKey: true, bubbles: true })))
    assert.equal(f.dom.window.document.activeElement.getAttribute('aria-label'), 'Exercise · default')
    assert.equal(draft.value, 'retained answer')
    const handle = f.button('moveWindow: Exercise')
    const before = Number.parseFloat(handle.closest('[role="region"]').style.left)
    await act(async () => handle.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
    assert.equal(Number.parseFloat(handle.closest('[role="region"]').style.left), before - 16)
    await f.click('Notes')
    assert.equal(note.value, 'unsent note')
    const dialog = f.dom.window.document.querySelector('[role="dialog"]')
    await act(async () => dialog.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(dialog.hidden, true)
  } finally { await f.dispose() }
})

test('narrow UI constrains the registered window and catalog controls expose persisted display preferences', async () => {
  const f = await fixture({ width: 390, height: 540 })
  try {
    await f.click('workspace')
    await f.click('Exercise')
    const region = f.dom.window.document.querySelector('[role="region"]')
    assert.equal(region.style.width, '390px')
    assert.equal(region.style.height, '540px')
    assert.equal(region.style.left, '0px')
    assert.equal(f.dom.window.document.querySelector('input[type="range"]'), null)
    await f.click('favorite: Exercise')
    assert.equal(f.button('favorite: Exercise').getAttribute('aria-pressed'), 'true')
    await f.click('hideApp: Exercise')
    assert.equal(f.button('hideApp: Exercise'), undefined)
    const showHidden = f.dom.window.document.querySelector('input[type="checkbox"]')
    await act(async () => showHidden.click())
    await f.click('showApp: Exercise')
    assert.equal(f.service.getSnapshot().apps['test.exercise'].hidden, false)
    assert.equal(f.service.getSnapshot().apps['test.exercise'].favorite, true)
    const input = f.dom.window.document.querySelector('input[type="search"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(f.dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'missing app')
      input.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }))
    })
    assert.equal(f.dom.window.document.querySelector('.pwb-list [role="status"]').textContent, 'noMatches')
  } finally { await f.dispose() }
})
