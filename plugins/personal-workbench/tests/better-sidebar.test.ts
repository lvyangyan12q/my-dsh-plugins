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

test('built optional adapter requires public durable cleanup for new tabs and preserves main entry on stock native', async () => {
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
  let nativeProvider
  const listeners=new Set<()=>void>();let inventory=[{sessionId:'main',tabId:'legacy',kind:'personal-workbench.catalog',contentId:'old'}]
  const native={openTabs:{getSnapshot:()=>inventory,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn)}},mounted:{getSnapshot:()=>undefined,subscribe:()=>()=>{}},closeIn:(sessionId:string,tabId:string)=>{inventory=inventory.filter(row=>row.sessionId!==sessionId||row.tabId!==tabId);for(const fn of listeners)fn()}}
  try {
    provider=provideSidebar(ctx,sidebar);await provider
    assert.equal(sidebar.registrations,0,'Without public native durable cleanup no new native catalog may be registered')
    nativeProvider=ctx.plugin({apply:(child:typeof ctx)=>child.effect(()=>child.reflect.provide('sidebarRight',native))});await nativeProvider
    assert.equal(sidebar.registrations,0,'Stock native adopted-only close cannot promise safe new catalog persistence')
    api.openWorkspace();assert.equal(api.getSnapshot().visible,true)
    assert.equal(inventory[0].tabId,'legacy','Unknown legacy data remains untouched')
    await nativeProvider.dispose()
    nativeProvider=ctx.plugin({apply:(child:typeof ctx)=>child.effect(()=>child.reflect.provide('sidebarRight',{...native,retirementVersion:1,retireTabsByKind:()=>({outcome:'complete',records:[]})}))});await nativeProvider
    assert.equal(sidebar.descriptors.size,1,'An explicitly advertised durable capability allows the optional catalog')
    await nativeProvider.dispose()
    assert.equal(sidebar.descriptors.size,0,'Loss of durable capability disposes the catalog registration')
    api.openWorkspace();assert.equal(api.getSnapshot().visible,true,'Native main Workbench access remains available')
  } finally {
    await React.act(async()=>root.unmount());await provider?.dispose();await nativeProvider?.dispose();await owner.dispose();await seed.dispose();await registry.dispose();await ctx.fiber.dispose();dom.window.close()
    for(const[name,value]of previous){if(value)Object.defineProperty(globalThis,name,value);else Reflect.deleteProperty(globalThis,name)}
  }
})
