import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { ResourceDirectory } from '../../worktable/01_content/src/framework/resources.mjs'
import {describeProtocol} from '../../worktable/01_content/src/sdk.mjs'
import { installReading } from '../src/reading-host.ts'
const source = process.env.DSH_SOURCE; assert.ok(source)
const official = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
const { Context } = official('@deepseek-ai/cordis')
const built = p => import(pathToFileURL(resolve(source, p, 'lib/index.js')).href)
const { default: Storage } = await built('packages/storage/storage')
const { JsonStorageBackend } = await built('packages/storage/storage-json')
const { DomainFacility } = await built('packages/storage/storage-domain')
async function host(folder) {
  const ctx = new Context(); await ctx.plugin(Storage)
  ctx.storage.backend.register('json', new JsonStorageBackend(folder))
  const facility = new DomainFacility(ctx, { backend: 'json', routes: {} }); ctx.storage.mount('domain', facility)
  const owner = await installReading({ storageDomain: facility, connection: { requestRejection: () => undefined } })
  const apps=new ApplicationDirectory(join(folder,'apps.json'));
  await apps.contribute({id:'reading-statistics',title:'Reading',version:'1',protocolVersion:1,kind:'deep',views:['page','stats','list'].map(id=>({id,title:id}))});
  const grants=new ResourceDirectory(join(folder,'grants.json'),apps);grants.register(owner.resource);const rows=new Map();
  for(const alias of ['default','new-project','other-project','first','other','fresh','departing','arriving']){
    const instance=await apps.latest('reading-statistics',alias)??await apps.createInstance('reading-statistics',alias),views={};
    for(const type of ['page','stats','list'])views[type]=await apps.createView(instance.id,type);
    rows.set(alias,{instance,views});
  }
  const call=async data=>{
    if(data.operation==='snapshot')return grants.snapshot();
    if(data.operation==='call')return (await grants.call(data)).value;
    const {action,instanceId,...payload}=data,view=rows.get(instanceId).views.page;
    const expectedRevision=action==='read'?undefined:(await grants.call({viewId:view.id,resourceId:'reading-records',action:'read'})).value.revision;
    return (await grants.call({viewId:view.id,resourceId:'reading-records',action,payload,expectedRevision})).value;
  };
  return {call,rows,apps,grants,close:async()=>{await grants.close();await apps.close();await owner.dispose();await ctx.fiber.dispose()}}

}
test('reading owns records without the legacy recipe service and new instances stay empty', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'reading-deep-')); let server
  try {
    server = await host(folder)
    await server.call({ action: 'initialize', instanceId: 'default', seed: 'examples' })
    assert.equal((await server.call({ action: 'read', instanceId: 'new-project' })).records.length, 0)
    const record = { title: 'My book', author: '', category: 'Personal', status: 'reading', minutes: 12, notes: '' }
    await server.call({ action: 'create', instanceId: 'new-project', record })
    await server.close(); server = await host(folder)
    assert.equal((await server.call({ action: 'read', instanceId: 'new-project' })).records[0].title, 'My book')
    assert.equal((await server.call({ action: 'read', instanceId: 'other-project' })).initialized, false)
  } finally { await server?.close(); await rm(folder, { recursive: true, force: true }) }
})

import { JSDOM } from 'jsdom'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url), React = require('react'), { act } = React, h = React.createElement
async function deepClient(server) {
  const dom = new JSDOM('<div id="mount"></div>', { url: 'http://localhost' }), originals = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }) }
  const { build } = require('esbuild')
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/client.tsx', import.meta.url))], bundle: true, write: false, format: 'cjs', platform: 'browser', external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-personal-workbench/client'] })
  const module = { exports: {} }, registrations = new Map(), cleanups = []
  let network = body => server.call(body)
  const requests = []
  const fetch=async(url,options={})=>{if(url==='/api/worktable/applications')return {ok:true,json:async()=>server.apps.snapshot()};const body=JSON.parse(options.body);requests.push({body,signal:options.signal});try{const value=await network(body,options.signal);return {ok:true,json:async()=>body.operation==='call'?{value,connection:null}:value}}catch(error){return {ok:false,json:async()=>({error:error.message})}}}
  runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, require: name => { assert.notEqual(name, '@deepseek-ai/dsh-personal-workbench/client'); return require(name) }, console, window: dom.window, document: dom.window.document, fetch, AbortController, structuredClone })
  const services = { worktableApplicationViews: { describe:describeProtocol, register(id, views) { assert.equal(registrations.has(id), false); registrations.set(id, views); return () => registrations.delete(id) } } }
  const ctx = { get: id => services[id], inject: (names, install) => { if (names.every(id => services[id])) install(ctx) }, effect: install => { const dispose = install(); if (typeof dispose === 'function') cleanups.push(dispose) } }
  module.exports.apply(ctx)
  const views = registrations.get('reading-statistics')
  assert.ok(views, 'reading registers public deep views without legacy UI')
  const root = require('react-dom/client').createRoot(dom.window.document.getElementById('mount'))
  const render=async element=>{await act(async()=>{root.render(element);await new Promise(resolve=>setTimeout(resolve,10))});for(let attempt=0;attempt<50;attempt++){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10))});if(!dom.window.document.body.textContent.includes('正在加载阅读记录'))break}}
  const view=(kind,id,key=kind+id)=>h(views[kind],{key,application:{id:'reading-statistics'},instance:server.rows.get(id).instance,view:server.rows.get(id).views[kind]})
  return { view, render, requests, network: callback => { network = callback }, document: dom.window.document, dom, close: async () => { await act(async () => root.unmount()); for (const dispose of cleanups.reverse()) await dispose(); dom.window.close(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] } } }
}
test('registered page/stats/list share filters and selection, isolate instances and restore after all views close', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'reading-deep-ui-')); const server = await host(folder); let ui
  try {
    await server.call({ action: 'initialize', instanceId: 'first', seed: 'examples' })
    ui = await deepClient(server)
    const views = () => h(React.Fragment, null, h('div', { id: 'page' }, ui.view('page', 'first')), h('div', { id: 'stats' }, ui.view('stats', 'first')), h('div', { id: 'list' }, ui.view('list', 'first')), h('div', { id: 'other' }, ui.view('stats', 'other')))
    await ui.render(views())
    assert.equal(ui.document.querySelector('#stats [data-stat="books"]').textContent, '3')
    assert.equal(ui.document.querySelector('#other [data-stat="books"]').textContent, '0')
    const category = ui.document.querySelector('#page select[aria-label="分类筛选"]')
    await act(async () => { category.value = '科学 Science'; category.dispatchEvent(new ui.dom.window.Event('change', { bubbles: true })) })
    assert.equal(ui.document.querySelector('#stats [data-stat="books"]').textContent, '1')
    const book = [...ui.document.querySelectorAll('#list button')].find(button => button.textContent.includes('物种起源'))
    await act(async () => book.click())
    assert.match(ui.document.querySelector('#page [data-reading-selection]').textContent, /整理自然选择/)
    await ui.render(null); await ui.render(views())
    assert.equal(ui.document.querySelector('#stats [data-stat="books"]').textContent, '1')
    assert.match(ui.document.querySelector('#page [data-reading-selection]').textContent, /整理自然选择/)
    assert.equal(ui.document.querySelector('[aria-label="阅读实例 ID"]'), null)
    assert.equal((await server.call({ action: 'read', instanceId: 'other' })).initialized, false)
  } finally { await ui?.close(); await server.close(); await rm(folder, { recursive: true, force: true }) }
})

import { ApplicationDirectory } from '../../worktable/01_content/src/framework/applications.mjs'
import { apply as applyHost } from '../src/index.ts'
test('public Host registration contributes a deep app without the legacy service and revokes cleanly', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'reading-contribution-')), directory = new ApplicationDirectory(join(folder, 'applications.json'))
  const effects = [], disposers = [], services = {
    webServer: { register: () => () => {} },
    worktableApplications: directory, worktableProtocol:{describe:describeProtocol},
  }
  const ctx = { ...services, get: name => services[name], inject: (names, install) => { if (names.every(name => services[name])) install(ctx) }, effect: install => effects.push(install) }
  applyHost(ctx)
  for (const install of effects) { const result = install(); if (result?.next) { const item = await result.next(); if (typeof item.value === 'function') disposers.push(item.value) } else if (typeof result === 'function') disposers.push(result) }
  assert.deepEqual((await directory.catalog())[0]?.views.map(view => view.id), ['page', 'stats', 'list'])
  const instance = await directory.createInstance('reading-statistics', 'reading-project')
  const view = await directory.createView(instance.id, 'stats')
  for (const dispose of disposers.reverse()) await dispose()
  assert.equal((await directory.catalog()).length, 0)
  applyHost(ctx)
  for (const install of effects.splice(2)) { const result = install(); if (result?.next) await result.next() }
  assert.equal((await directory.resolveView(view.id)).instance.id, instance.id)
  await rm(folder, { recursive: true, force: true })
})

import { requestReading } from '../src/reading-data-client.ts'
test('reading client rejects a successful response belonging to another instance', async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => ({ ok: true, json:async()=>({value:{instanceId:'default',initialized:true,records:[]},connection:null}) })
    await assert.rejects(requestReading({action:'read',instanceId:'project-book',viewId:'registered-view'}), /归属不匹配/)
  } finally { globalThis.fetch = previous }
})

test('unavailable browser preference storage is visible and mounted-instance preferences survive view closure', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'reading-storage-ui-')); const server = await host(folder); let ui
  try {
    await server.call({ action: 'initialize', instanceId: 'first', seed: 'examples' })
    ui = await deepClient(server)
    ui.dom.window.Storage.prototype.setItem = () => { throw new Error('Storage blocked') }
    await ui.render(ui.view('page', 'first'))
    const category = ui.document.querySelector('select[aria-label="分类筛选"]')
    await act(async () => { category.value = '科学 Science'; category.dispatchEvent(new ui.dom.window.Event('change', { bubbles: true })) })
    assert.match(ui.document.body.textContent, /偏好仅在本次运行内保留/)
    await ui.render(null); await ui.render(ui.view('stats', 'first'))
    assert.equal(ui.document.querySelector('[data-stat="books"]').textContent, '1')
  } finally { await ui?.close(); await server.close(); await rm(folder, { recursive: true, force: true }) }
})

test('late earlier reads cannot replace a newer saved same-instance editor snapshot', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'reading-late-editor-')); const server = await host(folder); let ui, release
  try {
    ui = await deepClient(server)
    let reads = 0
    ui.network(async body => { const row = await server.call(body); if (body.action === 'read' && ++reads === 2) return new Promise(resolve => { release = () => resolve(row) }); return row })
    await ui.render(ui.view('page', 'fresh'))
    const initialize = [...ui.document.querySelectorAll('button')].find(button => button.textContent === '初始化示例记录')
    await act(async () => { initialize.click(); await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.match(ui.document.querySelector('[data-reading-editor]').textContent, /物种起源/)
    await act(async () => { release(); await new Promise(resolve => setTimeout(resolve, 10)) })
    assert.match(ui.document.querySelector('[data-reading-editor]').textContent, /物种起源/)
  } finally { release?.(); await ui?.close(); await server.close(); await rm(folder, { recursive: true, force: true }) }
})

test('a late mutation after switching instance cannot publish into the new view or revive released subscriptions', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'reading-late-mutation-')); const server = await host(folder); let ui, release
  try {
    ui = await deepClient(server)
    ui.network(async body => { const row = await server.call(body); if (body.action === 'initialize') return new Promise(resolve => { release = () => resolve(row) }); return row })
    await ui.render(ui.view('page', 'departing', 'same-pane'))
    const initialize = [...ui.document.querySelectorAll('button')].find(button => button.textContent === '初始化示例记录')
    await act(async () => { initialize.click(); await new Promise(resolve => setTimeout(resolve, 10)) })
    await ui.render(ui.view('page', 'arriving', 'same-pane'))
    const before = ui.requests.filter(request => request.body.viewId === server.rows.get('departing').views.page.id && request.body.action === 'read').length
    assert.ok(ui.requests.filter(request => request.body.viewId === server.rows.get('departing').views.page.id && request.body.action === 'read').every(request => request.signal.aborted))
    await act(async () => { release(); await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.equal(ui.document.querySelector('[data-stat="books"]').textContent, '0')
    assert.doesNotMatch(ui.document.querySelector('[data-reading-editor]').textContent, /物种起源|已保存/)
    assert.equal(ui.requests.filter(request => request.body.viewId === server.rows.get('departing').views.page.id && request.body.action === 'read').length, before)
  } finally { release?.(); await ui?.close(); await server.close(); await rm(folder, { recursive: true, force: true }) }
})
