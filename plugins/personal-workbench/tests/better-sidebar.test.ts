import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { workspaceStyles } from '../src/workbench-styles.ts'
import { SidebarFixture, provideSidebar } from './better-sidebar-fixture.ts'
import type { Workbench } from '../src/workbench.ts'
import type { WorkbenchAppId } from '../src/workbench-api.ts'
import type { ReactNode } from 'react'

test('built optional adapter shares the owner and cleans scopes across absent, unsupported, unload and reload with real Cordis', async () => {
  assert.ok(process.env.DSH_SOURCE, 'Set DSH_SOURCE to the built official checkout')
  const require = createRequire(resolve(process.env.DSH_SOURCE, 'packages/client/ui-renderer/package.json'))
  const { Context } = require('@deepseek-ai/cordis')
  const React = require('react')
  const { JSDOM } = createRequire(import.meta.url)('jsdom')
  const dom = new JSDOM('<div id="mount"></div>', { url: 'http://localhost' })
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })
  }
  function load(code: string, restrictImports = false) {
    let exports: { apply: Function; SlotRegistry: Function }
    runInNewContext(code, { console, AbortController,
      window: Object.assign(dom.window, { __ModuleLoader__: { load: ({ factory }: { factory: (require: (name: string) => unknown) => typeof exports }) => {
        exports = factory(name => { if (restrictImports) assert.ok(['react', 'react/jsx-runtime', 'react-dom'].includes(name)); return require(name) })
      } } }),
      fetch: (path: string) => {
        // The current Workbench reads independent recipe/app availability catalogs.
        if (path.endsWith('/recipes')) return Promise.resolve({ ok: true, json: async () => ({ version: 1, recipes: [] }) })
        if (path.endsWith('/apps')) return Promise.resolve({ ok: true, json: async () => ({ version: 1, states: [] }) })
        assert.fail('No association reads or Session creation')
      },
    })
    return exports!
  }
  const renderer = load(await readFile(resolve(process.env.DSH_SOURCE, 'packages/client/ui-renderer/lib/client.js'), 'utf8'))
  const plugin = load(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), true)
  const ctx = new Context()
  const localeListeners = new Set<() => void>()
  const registry = ctx.plugin(renderer.SlotRegistry)
  await registry
  const seed = ctx.plugin({ inject: ['slots'], apply: (child: typeof ctx) => {
    child.slots.register({ name: 'root', children: {
      'shell.overlay': { kind: 'list', scope: 'root' }, 'sidebar.footer.action': { kind: 'list', scope: 'root' },
    } }, () => null)
    const localeSnapshot = { revision: 0 }
    for (const [name, service] of Object.entries({
      sessions: { retain: () => assert.fail('No Session acquisition') },
      workspaces: { list: { getSnapshot: () => ({ phase: 'ready', state: 'idle', archivedSessionIds: [] }), subscribe: () => () => {} } },
      uiSession: {}, uiConversation: {}, locale: { register: () => () => {}, bind: () => (key: string) => key,
        getSnapshot: () => localeSnapshot, subscribe: (fn: () => void) => { localeListeners.add(fn); return () => localeListeners.delete(fn) } },
    })) child.effect(() => child.reflect.provide(name, service))
  } })
  await seed
  let owner = ctx.plugin(plugin)
  await owner
  const root = require('react-dom/client').createRoot(dom.window.document.getElementById('mount'))
  let provider: ReturnType<typeof provideSidebar> | undefined
  const sidebar = new SidebarFixture()
  const id = 'test.real-app' as WorkbenchAppId
  const api: Workbench = ctx.personalWorkbench
  const status = () => {
    const entry = ctx.slots.entries('sidebar.footer.action').find((row: { options: { id?: string } }) => row.options.id === 'personal-workbench.sidebar-status')
    assert.ok(entry)
    return entry.inject().hooks.betterSidebarAdapter.getSnapshot()
  }
  try {
    assert.equal(sidebar.registrations, 0)
    assert.equal(status(), null)
    assert.deepEqual(ctx.slots.entries('shell.overlay').map((row: { options: { id?: string } }) => row.options.id).sort(), ['personal-workbench', 'personal-workbench.workspace', 'personal-workbench.management'].sort())
    api.registerApp({ id, version: '1', name: 'Registered app', icon: 'book-open', source: 'fixture',
      pages: [{ id: 'lesson', label: 'Lesson' }, { id: 'practice', label: 'Practice' }], defaultLayout: { width: 600, height: 400, pageId: 'lesson' },
      dependencies: [{ id: 'optional.teacher-skill', available: false, reason: 'Skill unavailable' }] })
    provider = provideSidebar(ctx, sidebar)
    await provider
    assert.equal(sidebar.registrations, 1)
    assert.equal(sidebar.listeners.size, 1)
    const descriptor = sidebar.descriptors.get('personal-workbench.catalog')!
    assert.equal(descriptor.single, true)
    assert.equal(descriptor.urlTarget, undefined)
    sidebar.openTab({ type: descriptor.id })
    sidebar.openTab({ type: descriptor.id })
    const main = sidebar.state('main').bottomSplits
    assert.equal(main.kind === 'leaf' && main.tabs.length, 1)
    const render = async (visible: boolean) => {
      // The adapter consumes visibility and public tab identity, without borrowing its store.
      const component = descriptor.component as (props: { visible: boolean; scope: { sessionId: string }; tab: { id: string; type: string; title: string } }) => ReactNode
      await React.act(async () => root.render(component({ visible, scope: { sessionId: sidebar.sessionId }, tab: { id: descriptor.id, type: descriptor.id, title: 'Catalog' } })))
    }
    // The component uses only visibility, not the sidebar's Session/store as app state.
    await render(false)
    assert.equal(dom.window.document.querySelectorAll('button').length, 0)
    assert.equal(localeListeners.size, 0)
    await render(true)
    assert.equal(localeListeners.size, 1)
    // The real overlay CSS stays mounted even when the workspace is closed.
    const overlayStyles = dom.window.document.createElement('style')
    overlayStyles.textContent = workspaceStyles
    dom.window.document.head.append(overlayStyles)
    const catalog = dom.window.document.querySelector('section[aria-label="applications"]')!
    assert.notEqual(dom.window.getComputedStyle(catalog).position, 'fixed', 'Catalog must remain inside the Better Sidebar tab, without covering its toolbar')
    overlayStyles.remove()
    assert.ok(dom.window.document.querySelector('[role="status"]')?.textContent.includes('Skill unavailable'))
    const click = async (text: string) => {
      const button = [...dom.window.document.querySelectorAll('button')].find((row: HTMLButtonElement) => row.textContent === text)
      assert.ok(button)
      await React.act(async () => button.click())
    }
    await click('workspace')
    assert.equal(api.getSnapshot().visible, true)
    await React.act(async () => api.openApp(id))
    const key = api.getSnapshot().focused!
    await React.act(async () => {
      api.selectPage(key, 'practice')
      api.setGeometry(key, { x: 20, y: 30, width: 500, height: 350 })
      api.setMode(key, 'minimized')
    })
    await click('Registered app')
    assert.equal(dom.window.document.querySelector('button[disabled]'), null, 'Missing optional dependencies preserve app recovery access')
    assert.equal(ctx.personalWorkbench, api)
    assert.equal(api.getSnapshot().windows.length, 1)
    assert.equal(api.getSnapshot().windows[0].pageId, 'practice')
    assert.equal(api.getSnapshot().windows[0].width, 500)
    const staleApp = [...dom.window.document.querySelectorAll('button')].find(row => row.textContent === 'Registered app')!
    sidebar.prefs.tabsEnabled[descriptor.id] = false
    await React.act(async () => sidebar.emit())
    assert.equal(dom.window.document.querySelectorAll('button').length, 0, 'Disabled catalog retires visible controls immediately')
    await render(false)
    await render(true)
    assert.equal(dom.window.document.querySelectorAll('button').length, 0, 'A catalog mounted while disabled still observes later re-enabling')
    await React.act(async () => api.closeWorkspace())
    await React.act(async () => staleApp.click())
    assert.equal(api.getSnapshot().visible, false)
    sidebar.prefs.tabsEnabled[descriptor.id] = true
    await React.act(async () => sidebar.emit())
    assert.ok(dom.window.document.querySelector('button'), 'Re-enabling restores the same catalog')
    const staleWorkspace = [...dom.window.document.querySelectorAll('button')].find(row => row.textContent === 'workspace')!
    sidebar.sessionId = 'other'
    sidebar.openTab({ type: descriptor.id })
    await React.act(async () => provider!.dispose())
    assert.equal(sidebar.listeners.size, 0)
    assert.equal(sidebar.descriptors.size, 0)
    assert.equal(sidebar.closed.length, 2)
    await React.act(async () => staleWorkspace.click()) // Stale callbacks are inert after child disposal.
    assert.equal(api.getSnapshot().visible, false)
    assert.equal(api.getSnapshot().windows.length, 1)
    await render(false)
    assert.equal(localeListeners.size, 0)
    provider = provideSidebar(ctx, sidebar)
    await provider
    assert.equal(sidebar.descriptors.size, 1)
    assert.equal(sidebar.listeners.size, 1)
    sidebar.openTab({ type: descriptor.id })
    await React.act(async () => owner.dispose())
    assert.equal(sidebar.listeners.size, 0)
    assert.equal(sidebar.descriptors.size, 0)
    owner = ctx.plugin(plugin)
    await owner
    assert.equal(sidebar.descriptors.size, 1)
    sidebar.state('other').bottomSplits = { kind: 'split', id: 'restored', dir: 'row', sizes: [0.5, 0.5], children: [
      { kind: 'leaf', id: 'one', active: 'restored-catalog', tabs: [{ id: 'restored-catalog', type: descriptor.id, title: 'Catalog' }] },
      { kind: 'leaf', id: 'two', active: 'unrelated', tabs: [{ id: 'unrelated', type: 'fixture.other', title: 'Other' }] },
    ] }
    sidebar.emit()
    await provider.dispose()
    assert.equal(sidebar.listeners.size, 0)
    assert.equal(sidebar.closed.includes('other:restored-catalog'), true)
    assert.equal(sidebar.closed.includes('other:unrelated'), false)
    // Native Sidebar 0.24.1 calls onOpen with a synthetic type id, while
    // component props carry the real tab id. Native tabs are not in bottomSplits.
    const nativeSidebar = new SidebarFixture()
    const nativeTabs = new Set(['native-catalog-tab', 'native-unrelated-tab'])
    nativeSidebar.closeTab = (tabId, scope) => {
      if (nativeTabs.delete(tabId)) nativeSidebar.closed.push(`${scope?.sessionId}:${tabId}`)
    }
    provider = provideSidebar(ctx, nativeSidebar)
    await provider
    const nativeDescriptor = nativeSidebar.descriptors.get(descriptor.id)!
    nativeDescriptor.onOpen?.({ id: descriptor.id, type: descriptor.id, title: 'Catalog' }, { sessionId: 'main' })
    await React.act(async () => root.render((nativeDescriptor.component as (props: { visible: boolean; scope: { sessionId: string }; tab: { id: string; type: string; title: string } }) => ReactNode)({
      visible: false, scope: { sessionId: 'main' },
      tab: { id: 'native-catalog-tab', type: descriptor.id, title: 'Catalog' },
    })))
    // The provider has already retired its view records when dependency cleanup
    // runs. The published native inventory and scoped command remain available.
    let inventory = [
      { sessionId: 'main', tabId: 'native-catalog-tab', kind: descriptor.id, contentId: 'catalog' },
      { sessionId: 'main', tabId: 'native-unrelated-tab', kind: 'fixture.other', contentId: 'other' },
      { sessionId: 'dormant', tabId: 'saved-catalog', kind: descriptor.id, contentId: 'saved' },
    ]
    let mounted: string | undefined
    const inventoryListeners = new Set<() => void>()
    const mountedListeners = new Set<() => void>()
    const adopted = new Set(['main'])
    const nativeProvider = ctx.plugin({ apply: (child: typeof ctx) => child.effect(() => child.reflect.provide('sidebarRight', {
      openTabs: { getSnapshot: () => inventory, subscribe: (fn: () => void) => { inventoryListeners.add(fn); return () => inventoryListeners.delete(fn) } },
      mounted: { getSnapshot: () => mounted, subscribe: (fn: () => void) => { mountedListeners.add(fn); return () => mountedListeners.delete(fn) } },
      closeIn: (sessionId: string, tabId: string) => {
        if (!adopted.has(sessionId)) return
        nativeTabs.delete(tabId)
        inventory = inventory.filter(row => row.sessionId !== sessionId || row.tabId !== tabId)
        for (const fn of inventoryListeners) fn()
      },
    })) })
    await nativeProvider
    nativeSidebar.closeTab = () => {} // Actual provider record-loss failure boundary.
    await React.act(async () => provider!.dispose())
    assert.equal(nativeTabs.has('native-catalog-tab'), false, 'Unload closes the real native tab, not only the synthetic onOpen id')
    assert.equal(nativeTabs.has('native-unrelated-tab'), true)
    assert.equal(inventory.some(row => row.tabId === 'saved-catalog'), true, 'Dormant saved layouts cannot be written before adoption')
    assert.equal(status(), 'sidebarCleanupPending')
    // Recreating the owner replays only its own durable retirement markers;
    // a freshly enabled provider's newly opened catalog must survive.
    await owner.dispose()
    owner = ctx.plugin(plugin)
    await owner
    assert.equal(status(), 'sidebarCleanupPending')
    provider = provideSidebar(ctx, nativeSidebar)
    await provider
    nativeTabs.add('new-catalog-tab')
    inventory.push({ sessionId: 'main', tabId: 'new-catalog-tab', kind: descriptor.id, contentId: 'new' })
    adopted.add('dormant')
    mounted = 'dormant'
    for (const fn of mountedListeners) fn()
    assert.deepEqual(inventory.map(row => row.tabId), ['native-unrelated-tab', 'new-catalog-tab'], 'Future public adoption cleans only retired catalog records, preserving newly opened catalogs')
    assert.equal(status(), null)
    await provider.dispose()
    assert.deepEqual(inventory.map(row => row.tabId), ['native-unrelated-tab'])
    await nativeProvider.dispose()
    assert.equal(inventoryListeners.size, 0)
    assert.equal(mountedListeners.size, 0)
    await render(false)
    const incompatible: [string, unknown][] = [['version', '0.24.2'], ['version', '0.25.0'], ['features', []], ['openTab', undefined]]
    for (const [key, value] of incompatible) {
      const unsupported = new SidebarFixture()
      Reflect.set(unsupported, key, value)
      provider = provideSidebar(ctx, unsupported)
      await provider
      assert.equal(unsupported.registrations, 0)
      assert.equal(unsupported.listeners.size, 0)
      assert.equal(status(), 'sidebarUnsupported')
      ctx.personalWorkbench.openWorkspace()
      assert.equal(ctx.personalWorkbench.getSnapshot().visible, true)
      await provider.dispose()
      assert.equal(status(), null)
    }
    assert.equal(sidebar.registrations, sidebar.removals)
  } finally {
    await React.act(async () => root.unmount())
    await provider?.dispose()
    await owner.dispose()
    await seed.dispose()
    await registry.dispose()
    await ctx.fiber.dispose()
    dom.window.close()
    for (const [name, value] of previous) {
      if (value) Object.defineProperty(globalThis, name, value)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
