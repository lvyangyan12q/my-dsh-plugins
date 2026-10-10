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
async function fixture({ nativeColumns = false, pluginNavigation = false, width = 960, height = 640, recipeCatalog = () => ({version:1,recipes:[]}) } = {}) {
  const dom = new JSDOM('<button id="origin">Origin</button><div id="mount"></div>', { url: 'http://localhost' })
  let sidebarWidth = 280
  const columnObservers = new Map()
  if (nativeColumns) {
    dom.window.document.body.innerHTML = '<button id="origin">Origin</button><div id="frame"><div id="sidebar"></div><div id="center"></div><div id="rightbar"></div><div id="mount" data-shell-overlay></div></div>'
    const rect = (left, width) => ({left,top:0,width,height:768,right:left+width,bottom:768})
    for (const [id, read] of Object.entries({frame:()=>rect(0,768),sidebar:()=>rect(0,sidebarWidth),center:()=>rect(sidebarWidth,400),rightbar:()=>rect(sidebarWidth+400,312)})) dom.window.document.getElementById(id).getBoundingClientRect = read
  }
  const globals = new Map()
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  class ResizeObserver {
    constructor(callback) { this.callback = callback }
    observe(element) { columnObservers.set(element, this.callback); this.callback() }
    disconnect() { for (const [element, callback] of columnObservers) if (callback === this.callback) columnObservers.delete(element) }
  }
  const { createRoot } = require('react-dom/client')
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { get: () => width })
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', { get: () => height })
  const declarations = [], cleanups = [], pluginNavigationCalls = []
  let service, exports, fetches = 0, retained = 0, mounts = 0, unmounts = 0
  runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: Object.assign(dom.window, { __ModuleLoader__: { load: ({ factory }) => { exports = factory(require) } } }),
    document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver, AbortController, console, crypto: globalThis.crypto, structuredClone,
    fetch: async (url, options) => {
      if(url === '/api/personal-workbench/recipes') return {ok:true,json:async()=>recipeCatalog()}
      if(url !== '/api/personal-workbench/apps') { fetches++; throw new Error('No Session acquisition authorized by this test') }
      const data=JSON.parse(options.body)
      if(data.action==='catalog') return {ok:true,json:async()=>({version:1,states:[]})}
      return {ok:true,json:async()=>({state:{appId:data.appId,enabled:data.enabled,revision:data.expectedRevision+1}})}
    },
  })
  const ctx = {
    get: name => name === 'pluginNavigation' && pluginNavigation ? {openBundle:name=>pluginNavigationCalls.push(name)} : undefined, // Optional official plugin configuration navigation is absent.
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
  await service.loadLifecycle()
  const overlay = declarations.find(row => row.options.name === 'shell.overlay' && row.options.id === 'personal-workbench.workspace')
  const management = declarations.find(row => row.options.id === 'personal-workbench.management')
  const launcher = declarations.find(row => row.options.name === 'sidebar.sections' && row.options.id === 'personal-workbench.workspace')
  assert.ok(launcher,'full application navigation must use the additive section seat, not the native footer action row')
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
      h(launcher.component, { wide: true, t: key => key, ...launcher.options.inject(), useWorkbench: boundHook(hooks.workbench) }),
      h(management.component, { ...management.options.inject(), useNavigation: boundHook(management.options.inject().hooks.navigation), useWorkbench: boundHook(hooks.workbench), t: key => key }),
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
  return { dom, ctx, declarations, service, root, pluginNavigationCalls, removeApp, removeView, click, button,
    async collapseNativeSidebar() { await act(async () => {sidebarWidth = 56;columnObservers.get(dom.window.document.getElementById('sidebar'))?.()}) },
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


test('direct project fills the main surface and retains draft through page, exit and reopen', async () => {
  const f = await fixture()
  try {
    await f.click('Exercise')
    assert.equal(f.dom.window.document.querySelector('.pwb-app-home').hidden, true)
    assert.equal(f.dom.window.document.querySelector('.pwb-catalog'), null)
    assert.equal(f.dom.window.document.querySelector('.pwb-window-header'), null)
    assert.equal(f.dom.window.document.querySelector('input[type="range"]'), null)
    await f.click('Enter answer')
    const draft = f.dom.window.document.querySelector('input[aria-label="Answer draft"]')
    await f.click('Practice')
    assert.equal(draft.value, 'retained answer')
    await f.click('Submit exercise')
    await f.click('closeWorkspace')
    assert.equal(draft.isConnected, true)
    assert.equal(f.dom.window.document.querySelector('output[aria-label="Activity"]').textContent, 'false')
    await f.click('Exercise')
    assert.equal(f.dom.window.document.querySelector('input[aria-label="Answer draft"]'), draft)
    assert.equal(f.dom.window.document.querySelector('output[aria-label="Result"]').textContent, 'Submitted')
    assert.deepEqual(f.counts(), {fetches:0,retained:0,mounts:1,unmounts:0})
  } finally { await f.dispose() }
})

test('Agent and Skills open independent root panels and project drafts remain mounted', async () => {
  const f = await fixture()
  try {
    await f.click('Exercise'); await f.click('Enter answer')
    const draft = f.dom.window.document.querySelector('input[aria-label="Answer draft"]')
    await f.click('agents')
    assert.equal(f.dom.window.document.querySelector('.pwb-project-shell:not(.pwb-independent-management)').hidden, true)
    assert.equal(f.dom.window.document.querySelector('.pwb-independent-management').hidden, false)
    assert.equal(f.dom.window.document.querySelector('.pwb-independent-management').getAttribute('aria-label'), 'agents')
    assert.equal(draft.isConnected, true)
    await f.click('skills')
    assert.equal(f.dom.window.document.querySelector('.pwb-independent-management').getAttribute('aria-label'), 'skills')
    await f.click('Exercise')
    assert.equal(f.dom.window.document.querySelector('.pwb-independent-management').hidden, true)
    assert.equal(draft.value, 'retained answer')
    assert.equal(f.counts().retained, 0)
  } finally { await f.dispose() }
})

test('workbench home and sidebar application hierarchy share registration without duplicate app mounting', async () => {
 const f = await fixture()
 try {
   const nav = f.dom.window.document.querySelector('nav[aria-label="catalogTabs"]')
   assert.ok(nav.querySelector('ul button[aria-label="Exercise"]'))
   await f.click('workspace')
   assert.equal(f.dom.window.document.querySelector('.pwb-app-home').hidden, false)
   await f.click('hideApp: Exercise')
   assert.equal(nav.querySelector('ul button[aria-label="Exercise"]'), null)
   const checkbox = f.dom.window.document.querySelector('input[type="checkbox"]')
   await act(async () => checkbox.click())
   await f.click('showApp: Exercise')
   assert.ok(nav.querySelector('ul button[aria-label="Exercise"]'))
   await f.click('Exercise')
   await act(async () => { f.removeView(); f.removeApp() })
   assert.equal(f.dom.window.document.querySelector('.pwb-project'), null)
   assert.equal(f.counts().unmounts, 1)
 } finally { await f.dispose() }
})

test('application availability disables entry without deleting mounted draft or role owner', async()=>{
 const f=await fixture()
 try {
  await f.click('Exercise');await f.click('Enter answer')
  const draft=f.dom.window.document.querySelector('input[aria-label="Answer draft"]')
  await f.click('workspace');await f.click('disableApp: Exercise')
  assert.equal(draft.isConnected,true);assert.equal(f.counts().unmounts,0)
  assert.equal(f.dom.window.document.querySelector('.pwb-app-home').hidden,false)
  assert.equal(f.button('Exercise').disabled,true)
  assert.equal(f.dom.window.document.querySelector('nav ul button[aria-label="Exercise"]'),null)
  await act(async()=>f.service.openApp('test.exercise'))
  assert.match(f.dom.window.document.querySelector('[role="alert"]').textContent,/appDisabledNotice/)
  await f.click('enableApp: Exercise');await f.click('Exercise')
  assert.equal(f.dom.window.document.querySelector('input[aria-label="Answer draft"]'),draft)
  assert.equal(draft.value,'retained answer');assert.equal(f.counts().retained,0)
 } finally {await f.dispose()}
})

test('a second application enters the platform without app-specific platform conditions',async()=>{
 const f=await fixture();let remove
 try {
  await act(async()=>{remove=f.service.registerApp({id:'reading',name:'Reading',version:'1',source:'Independent plugin',icon:'notebook',pages:[{id:'overview',label:'Overview'}],defaultLayout:{pageId:'overview',width:500,height:400}})})
  assert.ok(f.dom.window.document.querySelector('nav ul button[aria-label="Reading"]'))
  await f.click('Reading');assert.equal(f.service.getSnapshot().windows.at(-1).appId,'reading')
  await act(async()=>remove());assert.equal(f.dom.window.document.querySelector('nav ul button[aria-label="Reading"]'),null)
  assert.equal(f.counts().retained,0)
 } finally {await f.dispose()}
})

test('manual recipe form creates stable draft identity and allows layout/modules without JSON editing',async()=>{
 const f=await fixture();try{await act(async()=>f.service.openWorkspace());await f.click('recipeCreate');const document=f.dom.window.document;
 const name=document.querySelector('input[aria-label="recipeName"]');assert.ok(name);assert.equal(name.value,'recipeNewName')
 const textarea=document.querySelector('textarea[aria-label="recipeConfiguration"]');const original=JSON.parse(textarea.value);assert.match(original.appId,/^app\./)
 const description=document.querySelector('textarea[aria-label="recipeDescription"]');assert.ok(description,'Application description needs a direct form field, without editing JSON')
 assert.equal(description.maxLength,2000)
 await act(async()=>{Object.getOwnPropertyDescriptor(f.dom.window.HTMLTextAreaElement.prototype,'value').set.call(description,'Resource application purpose');description.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}))})
 assert.equal(JSON.parse(textarea.value).description,'Resource application purpose');assert.equal(JSON.parse(textarea.value).appId,original.appId)
 assert.equal(JSON.parse(textarea.value).pages[0].modules.length,original.pages[0].modules.length)
 await f.click('canvasPageSettings');const layout=document.querySelector('select[aria-label="recipeLayout: home"]');await act(async()=>{layout.value='stack';layout.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}))});assert.equal(JSON.parse(textarea.value).pages[0].layout,'stack')
 const firstId=original.pages[0].modules[0].id;const choose=document.querySelector('button[aria-label="recipeModulestats: '+firstId+'"]');assert.ok(choose);await act(async()=>choose.click());const details=document.querySelector('select[aria-label^="moduleType:"]');await act(async()=>{details.value='detail';details.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}))});assert.ok(JSON.parse(textarea.value).pages[0].modules.some(module=>module.type==='detail'))
 await f.click('recipeAddPage');const current=JSON.parse(textarea.value);assert.equal(current.pages.length,2);assert.equal(current.appId,original.appId);assert.ok(document.querySelector('[aria-label="canvasTitle"]'));assert.equal(f.button('recipePreview').disabled,true);assert.equal(f.button('recipeActivate').disabled,true)
 }finally{await f.dispose()}
})


test('application status refresh updates unchanged running recipe dependency projection and retains open app draft',async()=>{
 let available=true;const recipe={schemaVersion:1,appId:'dependency-refresh',version:1,name:'Dependency refresh',description:'Fixture',pages:[{id:'home',label:'Home',layout:'stack',modules:[{id:'empty',type:'empty',title:'Empty',config:{}}]}],connections:[],roles:[{id:'analyst',name:'Analyst',presetId:'my-dsh.analyst',skillNames:[]}]};
 const f=await fixture({recipeCatalog:()=>({version:1,recipes:[{appId:recipe.appId,revision:2,draft:recipe,running:recipe}],dependencies:{[recipe.appId]:[{id:'agent:analyst',available,...(!available?{reason:'Unavailable Agent: my-dsh.analyst'}:{})}]}})});
 try{
  await f.click('Exercise');await f.click('Enter answer');const draft=f.dom.window.document.querySelector('input[aria-label="Answer draft"]');
  await f.click('workspace');available=false;await f.click('refreshApps');
  assert.equal(f.service.getSnapshot().definitions.find(row=>row.id===recipe.appId).dependencies.find(row=>row.id==='agent:analyst').available,false,'refresh must update actual recipe dependency projection');
  assert.equal(draft.isConnected,true);assert.equal(draft.value,'retained answer');assert.equal(f.counts().unmounts,0);
  available=true;await f.click('refreshApps');assert.equal(f.service.getSnapshot().definitions.find(row=>row.id===recipe.appId).dependencies.find(row=>row.id==='agent:analyst').available,true);
 }finally{await f.dispose()}
})


test('catalog and sidebar share favorite and user order with persisted preferences', async () => {
 const f=await fixture()
 let remove
 try {
  await act(async()=>{remove=f.service.registerApp({id:'test.alpha',version:'1',name:'Alpha',source:'UI test registration',icon:'book-open',pages:[{id:'home',label:'Home'}],defaultLayout:{width:700,height:500,pageId:'home'}})})
  await f.click('workspace')
  const cards=()=>[...f.dom.window.document.querySelectorAll('.pwb-app-grid .pwb-open')].map(row=>row.textContent)
  const sidebar=()=>[...f.dom.window.document.querySelectorAll('nav[aria-label="catalogTabs"] ul button')].map(row=>row.textContent)
  assert.deepEqual(cards(),['Alpha','Exercise'])
  assert.deepEqual(sidebar(),cards())
  await f.click('moveUp: Exercise')
  assert.deepEqual(cards(),['Exercise','Alpha'])
  assert.deepEqual(sidebar(),cards())
  assert.equal(f.button('moveUp: Exercise').disabled,true)
  assert.equal(f.button('moveDown: Alpha').disabled,true)
  await f.click('favorite: Alpha')
  assert.deepEqual(cards(),['Alpha','Exercise'])
  assert.deepEqual(sidebar(),cards())
  assert.equal(f.button('moveDown: Alpha').disabled,true,'manual ordering stays inside favorite group')
  const saved=JSON.parse(f.dom.window.localStorage.getItem('personal-workbench.layout.v1'))
  assert.equal(saved.apps['test.alpha'].favorite,true)
  assert(saved.apps['test.exercise'].order<saved.apps['test.alpha'].order)
  await f.click('favorite: Alpha')
  assert.deepEqual(cards(),['Exercise','Alpha'])
 } finally {await act(async()=>remove?.());await f.dispose()}
})


test('minimize and explicit restore retain the same application instance, page and draft',async()=>{
 const f=await fixture()
 try{
  await f.click('Exercise');await f.click('Enter answer');await f.click('Practice')
  const draft=f.dom.window.document.querySelector('input[aria-label="Answer draft"]'),key=f.service.getSnapshot().focused
  await f.click('minimize: Exercise')
  assert.equal(f.service.getSnapshot().windows.find(row=>row.appId==='test.exercise').mode,'minimized')
  assert.equal(f.dom.window.document.querySelector('.pwb-app-home').hidden,false)
  assert.equal(draft.isConnected,true);assert.equal(f.dom.window.document.querySelector('output[aria-label="Activity"]').textContent,'false')
  await f.click('restore: Exercise · default')
  assert.equal(f.service.getSnapshot().focused,key)
  assert.equal(f.service.getSnapshot().windows.length,1)
  assert.equal(f.dom.window.document.querySelector('input[aria-label="Answer draft"]'),draft)
  assert.equal(draft.value,'retained answer')
  assert.equal(f.dom.window.document.querySelector('output[aria-label="Selected page"]').textContent,'practice')
  assert.equal(f.dom.window.document.activeElement,f.dom.window.document.querySelector('.pwb-project'))
  assert.deepEqual(f.counts(),{fetches:0,retained:0,mounts:1,unmounts:0})
 }finally{await f.dispose()}
})

test('maximize, minimize and restore keep the same page and draft while releasing page-navigation space',async()=>{
 const f=await fixture()
 try{
  await f.click('Exercise');await f.click('Enter answer');await f.click('Practice')
  const doc=f.dom.window.document,draft=doc.querySelector('input[aria-label="Answer draft"]'),pages=doc.querySelector('[role="tablist"][aria-label="pages"]')
  await f.click('maximize: Exercise')
  assert.equal(pages.hidden,true)
  assert.ok(f.button('restore: Exercise'))
  assert.equal(doc.querySelector('input[aria-label="Answer draft"]'),draft)
  assert.equal(draft.value,'retained answer')
  assert.equal(doc.querySelector('output[aria-label="Selected page"]').textContent,'practice')
  assert.equal(doc.querySelector('nav[aria-label="catalogTabs"]').closest('[hidden]'),null)
  await f.click('minimize: Exercise');await f.click('restore: Exercise · default')
  assert.equal(pages.hidden,true,'restoring a minimized maximized window keeps its focus mode')
  assert.ok(f.button('restore: Exercise'))
  await f.click('restore: Exercise')
  assert.equal(pages.hidden,false)
  assert.ok(f.button('maximize: Exercise'))
  assert.equal(doc.querySelector('input[aria-label="Answer draft"]'),draft)
  assert.equal(draft.value,'retained answer')
  assert.equal(doc.querySelector('output[aria-label="Selected page"]').textContent,'practice')
  assert.deepEqual(f.counts(),{fetches:0,retained:0,mounts:1,unmounts:0})
 }finally{await f.dispose()}
})

test('external application disable and withdrawal move keyboard focus out of hidden or removed content',async()=>{
 const f=await fixture()
 try{
  const doc=f.dom.window.document,origin=doc.querySelector('#origin');origin.focus()
  await f.click('Exercise')
  const draft=doc.querySelector('input[aria-label="Answer draft"]');draft.focus()
  await act(async()=>f.service.applyLifecycle([{appId:'test.exercise',enabled:false,revision:1}]))
  assert.ok(doc.activeElement===doc.querySelector('[data-window-mode]'),'Disabling the active application must focus the visible application center')
  assert.equal(draft.isConnected,true,'Disabling retains the application draft')
  await act(async()=>f.service.applyLifecycle([{appId:'test.exercise',enabled:true,revision:2}]))
  await f.click('Exercise');draft.focus()
  await act(async()=>f.removeApp())
  assert.ok(doc.activeElement===doc.querySelector('[data-window-mode]'),'Withdrawing an active application must focus the remaining workspace')
  await f.click('closeWorkspace')
  assert.ok(doc.activeElement===origin,'Closing after external changes returns focus to the original external entry')
  assert.equal(f.counts().retained,0)
 }finally{await f.dispose()}
})

test('workspace follows native sidebar collapse even when center width and frame dimensions stay unchanged', async () => {
  const f = await fixture({nativeColumns:true})
  try {
    await f.click('Exercise')
    const workspace = f.dom.window.document.querySelector('[data-window-mode]')
    assert.equal(workspace.style.left, '280px')
    assert.equal(workspace.style.width, '400px')
    await f.collapseNativeSidebar()
    assert.equal(workspace.style.left, '56px', 'Position-only center movement must not leave the workspace covering the native right sidebar')
    assert.equal(workspace.style.width, '400px')
    assert.equal(f.dom.window.document.getElementById('sidebar').style.width, '')
  } finally { await f.dispose() }
})

test('both independent libraries reach official plugin configuration without creating Sessions or discarding app drafts', async () => {
  const f = await fixture({pluginNavigation:true})
  try {
    await f.click('Exercise')
    await f.click('Enter answer')
    const draft = f.dom.window.document.querySelector('input[aria-label="Answer draft"]')
    for (const library of ['agents','skills']) {
      await f.click(library)
      await f.click('nativePluginConfiguration')
      assert.equal(f.dom.window.document.querySelector('.pwb-independent-management').hidden, true)
      assert.equal(draft.isConnected, true)
      assert.equal(draft.value, 'retained answer')
    }
    assert.deepEqual(f.pluginNavigationCalls, ['@deepseek-ai/dsh-personal-workbench','@deepseek-ai/dsh-personal-workbench'])
    assert.equal(f.counts().retained, 0)
  } finally { await f.dispose() }
})
