import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { installRecipes } from '../../personal-workbench/src/recipe-host.ts'
import { installAppLifecycle } from '../../personal-workbench/src/app-lifecycle-host.ts'
import { installReading } from '../src/reading-host.ts'
const source = process.env.DSH_SOURCE; assert.ok(source)
const official = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
const { Context } = official('@deepseek-ai/cordis')
const built = p => import(pathToFileURL(resolve(source, p, 'lib/index.js')).href)
const { default: Storage } = await built('packages/storage/storage')
const { JsonStorageBackend } = await built('packages/storage/storage-json')
const { DomainFacility } = await built('packages/storage/storage-domain')
const require = createRequire(import.meta.url), React = require('react'), { act } = React, h = React.createElement

async function host(root) {
  const ctx = new Context(); await ctx.plugin(Storage)
  ctx.storage.backend.register('json', new JsonStorageBackend(root))
  const facility = new DomainFacility(ctx, { backend: 'json', routes: {} }); ctx.storage.mount('domain', facility)
  let rejection
  const face = { storageDomain: facility, connection: { requestRejection: () => rejection }, reflect: { provide: () => () => {} }, get: () => undefined }
  const recipes = await installRecipes(face), apps = await installAppLifecycle(face), reading = await installReading({ ...face, personalWorkbenchRecipes: recipes.service })
  const call = async (url, data, method = 'POST') => {
    const owner = url.endsWith('/recipes') ? recipes : url.endsWith('/apps') ? apps : reading
    const req = Readable.from([typeof data === 'string' ? data : JSON.stringify(data)]); req.method = method; req.headers = { 'content-type': 'application/json' }
    let status, value
    await owner.handle(req, { setHeader: () => {}, writeHead: code => { status = code }, end: text => { value = text ? JSON.parse(text) : undefined } })
    return { status, value }
  }
  return { recipes, apps, reading, call, deny: code => { rejection = code }, close: async () => { await reading.dispose(); await apps.dispose(); await recipes.dispose(); await ctx.fiber.dispose() } }
}
async function client(host) {
  const dom = new JSDOM('<div id="mount"></div>', { url: 'http://localhost' }), original = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) { original.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }) }
  let platform, reading, workbench, forbidden = 0, fail = false
  const fetch = async (url, options) => { if (url === '/api/personal-workbench/annotations' && JSON.parse(options.body).action === 'list') return { ok: true, json: async () => ({ records: [] }) };  if (url === '/api/reading-statistics/data' && fail) throw new Error('Reading backend failed'); if (!['/api/reading-statistics/data', '/api/personal-workbench/recipes', '/api/personal-workbench/apps'].includes(url)) { forbidden++; throw new Error('AI/Session request forbidden') } const result = await host.call(url, JSON.parse(options.body)); return { ok: result.status === 200, json: async () => result.value } }
  const load = async (file, dependency) => { let api; const window = Object.assign(dom.window, { __ModuleLoader__: { load: ({ factory }) => { api = factory(name => name === '@deepseek-ai/dsh-personal-workbench/client' ? dependency : require(name)) } } }); runInNewContext(await readFile(file, 'utf8'), { window, document: dom.window.document, console, AbortController, structuredClone, crypto: globalThis.crypto, fetch }); return api }
  platform = await load(new URL('../../personal-workbench/lib/client.js', import.meta.url)); reading = await load(new URL('../lib/client.js', import.meta.url), platform)
  const entries = [], cleanups = [], provided = new Map()
  const ctx = { get: name => provided.get(name), inject: (services, install) => { if (services.every(name => provided.has(name))) install(ctx) }, effect: run => { const dispose = run(); if (typeof dispose === 'function') cleanups.push(dispose); return dispose }, reflect: { provide: (name, value) => { provided.set(name, value); if (name === 'personalWorkbench') workbench = value; return () => { provided.delete(name) } } }, sessions: { retain: () => { forbidden++; throw new Error('No Sessions') } }, workspaces: { list: { getSnapshot: () => ({ phase: 'ready', state: 'idle', archivedSessionIds: [] }), subscribe: () => () => {} } }, locale: { register: () => () => {} }, slots: { inject: (_key, install) => { const dispose = install(); if (dispose) cleanups.push(dispose) }, register: (options, component) => { const entry = { options, component }; entries.push(entry); return () => { entries.splice(entries.indexOf(entry), 1) } } } }
  platform.apply(ctx); reading.apply(ctx)
  await workbench.loadLifecycle()
  const commands = entries.find(entry => entry.options.name === 'main' && entry.options.key === 'personal-workbench').options.inject()
  const { createRoot } = require('react-dom/client'), root = createRoot(dom.window.document.getElementById('mount'))
  const render = async element => { await act(async () => { root.render(element) }) }
  const flush = async () => {
    const deadline = Date.now() + 5000
    do {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)) })
      if (!dom.window.document.querySelector('[data-reading-editor][aria-busy="true"]')) return
    } while (Date.now() < deadline)
    assert.fail('Reading editor did not finish its visible load or mutation')
  }
  const click = async text => { const button = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === text); assert.ok(button, text); assert.equal(button.disabled, false, text); await act(async () => button.click()); await flush() }
  const select = async (label, value) => { const element = dom.window.document.querySelector('select[aria-label="' + label + '"]'); assert.ok(element, label); await act(async () => { element.value = value; element.dispatchEvent(new dom.window.Event('change', { bubbles: true })) }); await flush() }
  return { platform, reading, workbench, commands, document: dom.window.document, render, flush, click, select, fail: value => { fail = value }, forbidden: () => forbidden, close: async () => { await flush(); await act(async () => root.unmount()); for (const dispose of cleanups.reverse()) dispose(); dom.window.close(); for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] } } }
}

test('reading domain persists own instances; previews are read-only and unavailable connections refuse activation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reading-host-')); let first, second
  try {
    first = await host(root); assert.equal(first.reading.read('default').records.length, 0)
    const initialized = await first.reading.initialize('default'); assert.equal(initialized.records.length, 3)
    await first.reading.initialize('empty', 'empty'); assert.equal(first.reading.read('empty').records.length, 0)
    await first.reading.initialize('default', 'empty'); assert.equal(first.reading.read('default').records.length, 3)
    const denied = await first.call('/api/reading-statistics/data', { action: 'initialize', instanceId: 'preview.test', preview: true }); assert.equal(denied.status, 409); assert.equal(first.reading.read('preview.test').initialized, false)
    first.deny(401); assert.equal((await first.call('/api/reading-statistics/data', { action: 'read', instanceId: 'default' })).status, 401); first.deny(undefined)
    assert.equal((await first.call('/api/reading-statistics/data', { action: 'read', instanceId: '../private' })).status, 400)
    await first.apps.service.setEnabled('reading-statistics', false, 0)
    await first.close(); first = undefined; second = await host(root)
    assert.equal(second.reading.read('default').records.length, 3); assert.equal(second.reading.read('empty').records.length, 0); assert.equal(second.apps.service.read('reading-statistics').enabled, false)
    await second.apps.service.setEnabled('reading-statistics', true, 1); assert.equal(second.reading.read('default').records.length, 3)
    const recipe = { schemaVersion: 1, appId: 'reading-statistics', version: 1, name: 'Reading', description: '', pages: [{ id: 'library', label: 'Library', layout: 'grid', modules: [{ id: 'books', type: 'list', connectionId: 'owned', title: 'Books', config: {} }] }], connections: [{ id: 'owned', sourceAppId: 'reading-statistics', resource: 'reading-records' }], roles: [] }
    await second.recipes.service.save(recipe, 0); await second.recipes.service.preview(recipe.appId, 1); await second.recipes.service.activate(recipe.appId, 1)
    await second.recipes.service.save({ ...recipe, version: 2, connections: [{ ...recipe.connections[0], resource: 'unknown-private-resource' }] }, 2)
    await assert.rejects(second.recipes.service.preview(recipe.appId, 3), /Unavailable data connection/); await assert.rejects(second.recipes.service.activate(recipe.appId, 3), /Unavailable data connection/); assert.equal(second.recipes.service.list()[0].running.version, 1)
  } finally { await first?.close(); await second?.close(); await rm(root, { recursive: true, force: true }) }
})

test('built reading adapter and public renderer share filters/selection, isolate instances and expose loading/empty/failure without AI', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'reading-ui-')); const server = await host(folder); let ui
  try {
    await server.reading.initialize('default'); await server.reading.initialize('second', 'empty')
    ui = await client(server); const recipe = ui.reading.readingRecipe()
    const page = (instanceId, preview = false) => h(ui.platform.RecipePage, { recipe, pageId: 'library', appId: recipe.appId, instanceId, preview, t: key => key })
    await ui.render(h(React.Fragment, null, h('div', { id: 'first' }, page('default')), h('div', { id: 'second' }, page('second')), h('div', { id: 'preview' }, page('preview.test', true))))
    await ui.flush(); assert.equal(ui.document.querySelector('#first [data-stat="books"]').textContent, '3'); assert.match(ui.document.querySelector('#second').textContent, /displayEmpty/)
    const originalRecords = server.reading.read('default').records
    await ui.select('分类 / Category', '科学 Science'); assert.equal(ui.document.querySelector('#first [data-stat="books"]').textContent, '1'); assert.equal(ui.document.querySelector('#first [data-stat="minutes"]').textContent, '60'); assert.equal(ui.document.querySelector('#preview [data-stat="books"]').textContent, '3')
    assert.deepEqual(server.reading.read('default').records, originalRecords); assert.equal(server.reading.read('second').records.length, 0); assert.equal(server.reading.read('preview.test').initialized, false)
    await ui.click('On the Origin of Species / 物种起源'); assert.match(ui.document.querySelector('#first article').textContent, /整理自然选择/)
    await ui.select('分类 / Category', '文学 Literature'); assert.equal(ui.document.querySelector('#first article'), null); assert.match(ui.document.querySelector('#first').textContent, /displaySelect/)
    await ui.select('状态 / Status', 'finished'); assert.equal(ui.document.querySelector('#first [data-stat="books"]').textContent, '1')
    await ui.select('分类 / Category', '科学 Science'); assert.match(ui.document.querySelector('#first').textContent, /displayNoMatches/)
    ui.fail(true); await ui.render(page('failed')); await ui.flush(); assert.match(ui.document.body.textContent, /displayFailed/); assert.match(ui.document.body.textContent, /Reading backend failed/)
    ui.fail(false); await ui.click('retry'); assert.match(ui.document.body.textContent, /displayEmpty/)
    let settle; const store = new ui.platform.DisplayStore({ appId: 'slow', resource: 'slow', label: 'slow', load: () => new Promise(resolve => { settle = resolve }) }, { appId: 'slow', instanceId: 'default', preview: false })
    void store.reload(); await ui.render(h(ui.platform.DisplayModule, { type: 'list', store, t: key => key })); assert.match(ui.document.body.textContent, /displayLoading/)
    await act(async () => settle({ records: [], filters: [], stats: [] })); assert.match(ui.document.body.textContent, /displayEmpty/); store.dispose()
    const withdraw = ui.platform.registerDisplaySource({ appId: 'special', resource: 'owned', label: 'Special', load: async () => ({ records: [], filters: [], stats: [] }) })
    const special = { ...recipe, appId: 'special', connections: [{ id: 'reading-data', sourceAppId: 'special', resource: 'owned' }] }
    await ui.render(h(ui.platform.RecipePage, { recipe: special, appId: special.appId, instanceId: 'default', pageId: 'library', t: key => key })); await ui.flush(); assert.match(ui.document.body.textContent, /displayEmpty/)
    await act(async () => withdraw()); assert.match(ui.document.body.textContent, /displayUnavailable/)
    assert.equal(ui.forbidden(), 0)
  } finally { await ui?.close(); await server.close(); await rm(folder, { recursive: true, force: true }) }
})

test('ordinary template and connection form save a draft, preview without replacing running app, explicitly activate, disable and restore after restart', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'reading-editor-')); let server = await host(folder), ui
  try {
    ui = await client(server)
    await ui.render(h(ui.platform.RecipeEditor, { t: key => key, refresh: ui.commands.refreshRecipes })); await ui.flush()
    await ui.click('阅读统计应用 / Reading statistics app')
    assert.equal(server.reading.read('default').records.length, 3); assert.equal(server.recipes.service.list().length, 0); assert.equal(ui.workbench.getSnapshot().definitions.length, 0)
    assert.equal(ui.document.querySelector('.pwb-recipe-canvas select[aria-label="recipeModuleConnection: reading.stats"]'), null)
    await act(async () => ui.document.querySelector('button[aria-label="canvasConfigure: reading.stats"]').click()); await ui.flush()
    assert.ok(ui.document.querySelector('.pwb-recipe-canvas select[aria-label="recipeModuleConnection: reading.stats"]'))
    await ui.select('recipeModuleConnection: reading.stats', '')
    await ui.select('recipeModuleConnection: reading.stats', 'reading-data')
    await ui.click('recipeSave'); assert.equal(server.recipes.service.list()[0].running, undefined)
    await ui.click('recipePreview'); assert.equal(server.recipes.service.list()[0].running, undefined); assert.equal(ui.workbench.getSnapshot().definitions.length, 0)
    assert.equal(ui.document.querySelector('[data-preview="true"] [data-stat="books"]').textContent, '3')
    await ui.select('分类 / Category', '科学 Science'); assert.equal(ui.document.querySelector('[data-preview="true"] [data-stat="books"]').textContent, '1')
    await ui.click('recipeActivate'); assert.equal(server.recipes.service.list()[0].running.appId, 'reading-statistics'); assert.equal(ui.workbench.getSnapshot().definitions[0].id, 'reading-statistics')
    const recipe = server.recipes.service.list()[0].running
    assert.ok(recipe)
    const page = h(ui.platform.RecipePage, { recipe, appId: recipe.appId, instanceId: 'default', pageId: 'library', t: key => key })
    await ui.render(page); await ui.flush(); assert.equal(ui.document.querySelector('[data-stat="books"]').textContent, '3')
    await ui.commands.setAppEnabled('reading-statistics', false); ui.workbench.openApp('reading-statistics'); assert.equal(ui.workbench.getSnapshot().windows.length, 0)
    assert.equal(server.reading.read('default').records.length, 3); assert.equal(server.recipes.service.list()[0].running.version, 1)
    assert.equal(ui.forbidden(), 0); await ui.close(); ui = undefined; await server.close(); server = await host(folder)
    assert.equal(server.apps.service.read('reading-statistics').enabled, false); assert.equal(server.recipes.service.list()[0].running.version, 1); assert.equal(server.reading.read('default').records.length, 3)
    ui = await client(server); await ui.commands.refreshRecipes(); await ui.workbench.loadLifecycle(); ui.workbench.openApp('reading-statistics'); assert.equal(ui.workbench.getSnapshot().windows.length, 0)
    await ui.commands.setAppEnabled('reading-statistics', true); ui.workbench.openApp('reading-statistics'); assert.equal(ui.workbench.getSnapshot().windows.length, 1); assert.equal(ui.forbidden(), 0)
  } finally { await ui?.close(); await server.close(); await rm(folder, { recursive: true, force: true }) }
})

test('public reading records create/edit/delete persist per instance, refuse preview and unconfirmed deletion', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'reading-records-')); let server = await host(folder)
  const record = { title: 'My reading journal', author: 'Reader', category: 'My books', status: 'reading', minutes: 45, notes: 'Own notes' }
  try {
    assert.equal((await server.call('/api/reading-statistics/data', { action: 'create', instanceId: 'personal', preview: true, record })).status, 409)
    assert.equal(server.reading.read('personal').initialized, false)
    const created = await server.call('/api/reading-statistics/data', { action: 'create', instanceId: 'personal', record })
    assert.equal(created.status, 200); const id = created.value.instance.records[0].id
    assert.deepEqual(created.value.instance.records[0], { id, ...record }); assert.equal(server.reading.read('default').records.length, 0)
    const changed = { ...record, minutes: 75, status: 'finished', notes: 'Completed' }
    const edited = await server.call('/api/reading-statistics/data', { action: 'update', instanceId: 'personal', recordId: id, record: changed })
    assert.equal(edited.status, 200); assert.deepEqual(edited.value.instance.records[0], { id, ...changed })
    assert.equal((await server.call('/api/reading-statistics/data', { action: 'delete', instanceId: 'personal', recordId: id })).status, 409)
    await server.close(); server = await host(folder)
    const reopened = await server.call('/api/reading-statistics/data', { action: 'read', instanceId: 'personal' }); assert.deepEqual(reopened.value.instance.records, [{ id, ...changed }])
    assert.equal((await server.call('/api/reading-statistics/data', { action: 'update', instanceId: 'another', recordId: id, record: changed })).status, 409)
    const removed = await server.call('/api/reading-statistics/data', { action: 'delete', instanceId: 'personal', recordId: id, confirmed: true }); assert.equal(removed.status, 200); assert.equal(removed.value.instance.records.length, 0)
    await server.close(); server = await host(folder); assert.equal((await server.call('/api/reading-statistics/data', { action: 'read', instanceId: 'personal' })).value.instance.records.length, 0)
  } finally { await server.close(); await rm(folder, { recursive: true, force: true }) }
})
test('built reading editor adds own records, edits, confirms delete and retries failed dependency without AI', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'reading-record-editor-ui-')); const server = await host(folder); let ui
  try {
    await server.reading.initialize('default'); ui = await client(server); const recipe = ui.reading.readingRecipe()
    const page = (preview = false) => h(ui.platform.RecipePage, { recipe, pageId: 'library', appId: recipe.appId, instanceId: 'default', preview, t: key => key })
    await ui.render(page()); await ui.flush(); await ui.click('新增阅读记录')
    const fill = async (label, value) => { const el = ui.document.querySelector('[aria-label="'+label+'"]'); assert.ok(el,label); const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype; await act(async () => { Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value); el.dispatchEvent(new window.Event('input',{bubbles:true})) }); }
    await fill('书名','User owned book'); await fill('阅读分钟','25'); await fill('阅读笔记','My actual notes'); await ui.click('保存阅读记录')
    await ui.flush(); assert.match(ui.document.querySelector('[data-reading-editor]').textContent,/User owned book/); assert.equal(ui.document.querySelector('[data-stat=books]').textContent,'4'); assert.ok([...ui.document.querySelectorAll('.pwb-display-list button')].some(button=>button.textContent==='User owned book'))
    const own = server.reading.read('default').records.find(r=>r.title==='User owned book'); assert.equal(own.minutes,25); assert.equal(server.reading.read('other').records.length,0)
    await act(async()=>ui.document.querySelector('[aria-label="编辑阅读记录: '+own.id+'"]').click()); await fill('阅读分钟','40'); await ui.click('保存阅读记录'); assert.equal(server.reading.read('default').records.find(r=>r.id===own.id).minutes,40)
    await ui.render(page(true)); await ui.flush(); assert.equal(ui.document.querySelector('[data-reading-editor] button[aria-label="编辑阅读记录: '+own.id+'"]'),null); assert.match(ui.document.querySelector('[data-reading-editor]').textContent,/预览只读/)
    await ui.render(page()); await ui.flush(); await act(async()=>ui.document.querySelector('[aria-label="删除阅读记录: '+own.id+'"]').click()); await ui.click('取消删除'); assert.equal(server.reading.read('default').records.length,4)
    await act(async()=>ui.document.querySelector('[aria-label="删除阅读记录: '+own.id+'"]').click()); ui.fail(true); await ui.click('确认删除阅读记录'); assert.match(ui.document.querySelector('[data-reading-editor]').textContent,/Reading backend failed/); assert.equal(server.reading.read('default').records.length,4)
    ui.fail(false); await ui.click('重试加载阅读记录'); await act(async()=>ui.document.querySelector('[aria-label="删除阅读记录: '+own.id+'"]').click()); await ui.click('确认删除阅读记录'); assert.equal(server.reading.read('default').records.length,3); await ui.flush(); assert.equal(ui.document.querySelector('[data-stat=books]').textContent,'3'); assert.equal([...ui.document.querySelectorAll('.pwb-display-list button')].some(button=>button.textContent==='User owned book'),false); assert.equal(ui.forbidden(),0)
  } finally { await ui?.close(); await server.close(); await rm(folder,{recursive:true,force:true}) }
})

test('built reading app exposes validated instance opening and keeps new instance empty and preview locked', async () => {
  const folder=await mkdtemp(join(tmpdir(),'reading-instance-ui-')); const server=await host(folder);let ui
  try {
    ui=await client(server);const recipe=ui.reading.readingRecipe(),opened=[]
    const ctx={personalWorkbench:{openApp:(app,id)=>{opened.push([app,id])}}}
    const page=(id='default',preview=false)=>h(ui.platform.RecipePage,{recipe,pageId:'library',appId:recipe.appId,instanceId:id,preview,ctx,t:key=>key})
    const fill=async(label,value)=>{const el=ui.document.querySelector('[aria-label="'+label+'"]');assert.ok(el,label);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}))})}
    await ui.render(page());await ui.flush();assert.equal(server.reading.read('default').records.length,0)
    await fill('阅读实例 ID','../invalid');assert.equal([...ui.document.querySelectorAll('button')].find(b=>b.textContent==='打开阅读实例').disabled,true);assert.equal(opened.length,0)
    await fill('阅读实例 ID','second');await ui.click('打开阅读实例');assert.deepEqual(opened,[['reading-statistics','second']]);assert.equal(server.reading.read('second').initialized,false)
    await ui.render(page('second'));await ui.flush();assert.match(ui.document.querySelector('[data-reading-editor]').textContent,/实例：second/);assert.match(ui.document.body.textContent,/displayEmpty/)
    await ui.click('新增阅读记录');await fill('书名','Second instance personal book');await fill('阅读分钟','12');await ui.click('保存阅读记录');assert.equal(server.reading.read('second').records.length,1);assert.equal(server.reading.read('default').records.length,0)
    await fill('阅读实例 ID','default');await ui.click('打开阅读实例');assert.deepEqual(opened[1],['reading-statistics','default']);assert.equal(server.reading.read('default').initialized,false)
    await ui.render(page('second',true));await ui.flush();assert.equal(ui.document.querySelector('[aria-label="阅读实例 ID"]'),null);assert.equal([...ui.document.querySelectorAll('button')].some(b=>b.textContent==='打开阅读实例'),false);assert.equal(opened.length,2);assert.equal(ui.forbidden(),0)
  }finally{await ui?.close();await server.close();await rm(folder,{recursive:true,force:true})}
})

test('existing enabled v4 reading recipe adds its own manager through visual module choices before explicit activation',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'reading-visual-upgrade-'));const server=await host(folder);let ui
 try{
  ui=await client(server);const old=JSON.parse(JSON.stringify(ui.reading.readingRecipe()));old.version=4;old.pages[0].modules=old.pages[0].modules.filter(module=>module.type!=='reading-record-editor')
  const saved=await server.call('/api/personal-workbench/recipes',{action:'save',expectedRevision:0,recipe:old});assert.equal(saved.status,200)
  assert.equal((await server.call('/api/personal-workbench/recipes',{action:'activate',appId:old.appId,expectedRevision:saved.value.record.revision})).status,200)
  await ui.commands.refreshRecipes();await ui.render(h(ui.platform.RecipeEditor,{t:key=>key,refresh:ui.commands.refreshRecipes}));await ui.flush();await ui.select('recipeSelect',old.appId)
  await ui.click('moduleAdd');await ui.click('阅读记录管理');await ui.click('recipeSave')
  let record=(await server.call('/api/personal-workbench/recipes',{action:'catalog'})).value.recipes[0];assert.equal(record.running.version,4);assert.equal(record.draft.version,5);assert.deepEqual(record.draft.connections,old.connections);assert.deepEqual(record.draft.roles,old.roles);assert.deepEqual(record.draft.pages[0].modules.slice(0,4),old.pages[0].modules)
  const added=record.draft.pages[0].modules.at(-1);assert.equal(added.type,'reading-record-editor');assert.equal(added.title,'阅读记录管理')
  await ui.click('recipePreview');assert.match(ui.document.querySelector('[data-preview="true"] [data-reading-editor]').textContent,/预览只读/);assert.equal(ui.document.querySelector('[data-preview="true"] [data-reading-editor] button'),null)
  record=(await server.call('/api/personal-workbench/recipes',{action:'catalog'})).value.recipes[0];assert.equal(record.running.version,4)
  await ui.click('recipeActivate');record=(await server.call('/api/personal-workbench/recipes',{action:'catalog'})).value.recipes[0];assert.equal(record.running.version,5);assert.equal(record.running.pages[0].modules.at(-1).type,'reading-record-editor');assert.deepEqual(record.running.connections,old.connections);assert.deepEqual(record.running.roles,old.roles);assert.equal(ui.forbidden(),0)
 }finally{await ui?.close();await server.close();await rm(folder,{recursive:true,force:true})}
})
