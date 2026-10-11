import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {runInThisContext} from 'node:vm'
import {Workbench} from '../src/workbench.ts'
test('native source factory re-admission preserves KG focus while Host readiness is pending',async()=>{
 const source=process.env.DSH_SOURCE;assert.ok(source);const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json')),{Context}=require('@deepseek-ai/cordis'),{JSDOM}=require('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 for(const key of ['window','document','navigator','HTMLElement','DOMParser','HTMLImageElement']){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]})}
 const testingRequire=createRequire(require.resolve('@testing-library/react')),React=testingRequire('react'),{act}=require('@testing-library/react'),modules=new Map(),values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},requests=[],oldFetch=globalThis.fetch
 globalThis.fetch=async url=>{requests.push(url);return{ok:false,json:async()=>({error:'Read-only source unavailable'})}}
 window.__ModuleLoader__={load:({id,factory})=>modules.set(id,factory(name=>name==='@deepseek-ai/dsh-personal-workbench/client'?modules.get('@deepseek-ai/dsh-personal-workbench'):testingRequire(name)))}
 for(const file of [resolve(source,'packages/client/ui-renderer/lib/client.js'),new URL('../lib/client.js',import.meta.url),new URL('../../kaogong/lib/client.js',import.meta.url)])runInThisContext(await readFile(file,'utf8'))
 const renderer=modules.get('@deepseek-ai/dsh-client-ui-renderer'),kg=modules.get('@deepseek-ai/dsh-tool-kaogong');assert.ok(renderer);assert.ok(kg)
 const ctx=new Context(),first=new Workbench(storage),manifest={plugins:[{id:'@deepseek-ai/dsh-tool-kaogong'}],modules:[{id:'@deepseek-ai/dsh-tool-kaogong'}]};let provider,owner,unmount,second,settle
 try{
  await ctx.plugin(renderer)
  await ctx.plugin({inject:['slots'],apply:child=>{const absent={key:undefined,hooks:{},keyedHooks:{},props:{}},current={getSnapshot:()=>absent,subscribe:()=>()=>{}};child.slots.installScope('session',{current,bindingSource:()=>current})}})
  await ctx.plugin(child=>{for(const[name,value]of Object.entries({uiWorkspace:{},modules:{manifest}}))child.effect(()=>child.reflect.provide(name,value))})
  provider=ctx.plugin(child=>child.effect(()=>child.reflect.provide('personalWorkbench',first)));await provider
  await ctx.plugin({inject:['slots'],apply:child=>child.slots.register({name:'root',children:{'personal-workbench.app':{kind:'keyed',scope:'root'},'sidebar.footer.action':{kind:'list',scope:'root'}}},({renderSlot})=>renderSlot('personal-workbench.app',{appId:'kaogong',instanceId:'default',pageId:'materials',active:true,selectPage:()=>{},close:()=>{}},{entryKey:'kaogong',fallback:React.createElement('p',null,'waiting')}))})
  owner=ctx.plugin(kg);await owner;first.openApp('kaogong');first.selectPage('["kaogong","default"]','materials')
  await act(async()=>{unmount=ctx.uiRenderer.mount(document.getElementById('root'));await new Promise(r=>setTimeout(r,10))})
  await act(async()=>{await provider.dispose();await new Promise(r=>setTimeout(r,0))});assert.equal(first.getSnapshot().focused,'["kaogong","default"]')
  second=new Workbench(storage,()=>new Promise(done=>{settle=done}))
  await act(async()=>{provider=ctx.plugin(child=>child.effect(()=>child.reflect.provide('personalWorkbench',second)));await provider;await new Promise(r=>setTimeout(r,0))})
  assert.equal(typeof settle,'function','Retained KG open state reaches public availability gate')
  assert.equal(second.getSnapshot().lifecycleReady,false);assert.equal(second.isEnabled('kaogong'),false)
  assert.equal(second.getSnapshot().focused,'["kaogong","default"]','KG fallback must not erase restored focus during a real native service replacement')
  assert.equal(second.getSnapshot().windows[0].pageId,'materials')
  settle([{appId:'kaogong',enabled:true,revision:1}]);await second.loadLifecycle();assert.equal(second.getSnapshot().focused,'["kaogong","default"]')
  manifest.plugins=[];manifest.modules=[];await act(async()=>{await owner.dispose()});assert.equal(second.getSnapshot().focused,null);assert.equal(second.getSnapshot().windows[0].mode,'closed')
  assert(requests.every(url=>String(url).startsWith('/api/kaogong/')),'No model/session/grade/binding calls')
 }finally{await act(async()=>{unmount?.();await ctx.fiber.dispose()});first.dispose();second?.dispose();globalThis.fetch=oldFetch;for(const[key,d]of saved){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}dom.window.close()}
})
