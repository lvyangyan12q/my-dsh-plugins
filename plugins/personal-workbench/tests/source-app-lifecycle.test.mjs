import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {runInNewContext} from 'node:vm'
import {Workbench} from '../src/workbench.ts'
const SOURCE='@deepseek-ai/dsh-tool-kaogong'
async function fixture(values=new Map()){
 const source=process.env.DSH_SOURCE;assert.ok(source)
 const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json')),{Context}=require('@deepseek-ai/cordis')
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},loaded=new Map()
 function load(code){let api;runInNewContext(code,{console,AbortController,window:{localStorage:storage,__ModuleLoader__:{load:({factory})=>api=factory(name=>name==='@deepseek-ai/dsh-personal-workbench/client'?loaded.get('platform'):require(name))}}});return api}
 const renderer=load(await readFile(resolve(source,'packages/client/ui-renderer/lib/client.js'),'utf8'))
 loaded.set('platform',load(await readFile(new URL('../lib/client.js',import.meta.url),'utf8')))
 const kg=load(await readFile(new URL('../../kaogong/lib/client.js',import.meta.url),'utf8'))
 const ctx=new Context(),wb=new Workbench(storage),manifest={plugins:[{id:SOURCE}],modules:[{id:SOURCE}]};let removeSlot
 await ctx.plugin(renderer.SlotRegistry)
 const seed=ctx.plugin({inject:['slots'],apply:child=>{for(const[name,value]of Object.entries({personalWorkbench:wb,uiWorkspace:{},modules:{manifest}}))child.effect(()=>child.reflect.provide(name,value))}});await seed
 const provision=()=>{removeSlot=ctx.slots.register({name:'root',children:{'personal-workbench.app':{kind:'keyed',scope:'root'},'sidebar.footer.action':{kind:'list',scope:'root'}}},()=>null)}
 const entry={disabled:false};provision();const owner=ctx.plugin({inject:kg.inject,apply:child=>{child.fiber.entry=entry;return kg.apply(child)}});await owner;await new Promise(r=>setTimeout(r,0))
 return{ctx,wb,owner,values,manifest,entry,provision,withdraw:async()=>{removeSlot();await new Promise(r=>setTimeout(r,0))},dispose:async()=>{await ctx.fiber.dispose();wb.dispose()}}
}
test('source application slot withdrawal and cold registry reconstruction preserve focused KG without opening it again',async()=>{
 const first=await fixture();let saved
 try{first.wb.openApp('kaogong');first.wb.selectPage('["kaogong","default"]','materials');await first.withdraw();assert.equal(first.wb.getSnapshot().definitions.some(row=>row.id==='kaogong'),false,'Unavailable renderer leaves no live application surface');saved=new Map(first.values)}finally{await first.dispose()}
 const second=await fixture(saved)
 try{assert.equal(second.wb.getSnapshot().focused,'["kaogong","default"]','An enabled source application must restore directly rather than returning to catalog');const window=second.wb.getSnapshot().windows.find(row=>row.appId==='kaogong');assert.equal(window.mode,'normal');assert.equal(window.pageId,'materials')}finally{await second.dispose()}
})

test('confirmed source graph removal permanently closes KG and cannot resurrect the window on reinstall',async()=>{
 const first=await fixture();let saved
 try{first.wb.openApp('kaogong');first.manifest.plugins=[];first.manifest.modules=[];await first.owner.dispose();assert.equal(first.wb.getSnapshot().focused,null);assert.equal(first.wb.getSnapshot().windows.find(row=>row.appId==='kaogong').mode,'closed');assert.equal(first.wb.getSnapshot().definitions.length,0);saved=new Map(first.values)}finally{await first.dispose()}
 const second=await fixture(saved)
 try{assert.equal(second.wb.getSnapshot().focused,null);assert.equal(second.wb.getSnapshot().windows.find(row=>row.appId==='kaogong').mode,'closed')}finally{await second.dispose()}
})

test('public disabled source entry retires its window even when its package remains in the module graph',async()=>{
 const f=await fixture()
 try{f.wb.openApp('kaogong');f.entry.disabled=true;await f.owner.dispose();assert.equal(f.wb.getSnapshot().focused,null);assert.equal(f.wb.getSnapshot().windows.find(row=>row.appId==='kaogong').mode,'closed')}finally{await f.dispose()}
})

test('replacement of a still-installed enabled source entry retains presentation but explicit closed windows stay closed',async()=>{
 const f=await fixture()
 try{f.wb.openApp('kaogong');await f.owner.dispose();assert.equal(f.wb.getSnapshot().definitions.length,0);assert.equal(f.wb.getSnapshot().focused,'["kaogong","default"]');assert.equal(f.wb.getSnapshot().windows.find(row=>row.appId==='kaogong').mode,'normal')}finally{await f.dispose()}
 const closed=await fixture();let saved
 try{closed.wb.openApp('kaogong');closed.wb.setMode('["kaogong","default"]','closed');await closed.withdraw();saved=new Map(closed.values)}finally{await closed.dispose()}
 const restored=await fixture(saved)
 try{assert.equal(restored.wb.getSnapshot().focused,null);assert.equal(restored.wb.getSnapshot().windows.find(row=>row.appId==='kaogong').mode,'closed')}finally{await restored.dispose()}
})

test('genuine source disable after its renderer was temporarily withdrawn still retires the saved window',async()=>{
 const f=await fixture()
 try{f.wb.openApp('kaogong');await f.withdraw();f.entry.disabled=true;await f.owner.dispose();assert.equal(f.wb.getSnapshot().focused,null);assert.equal(f.wb.getSnapshot().windows.find(row=>row.appId==='kaogong').mode,'closed')}finally{await f.dispose()}
})

test('a suspended registration can retire its own saved windows but never a replacement owner',()=>{
 const wb=new Workbench(),app={id:'owned-source',name:'Source',source:'owned',version:'1',icon:'book-open',pages:[{id:'home',label:'Home'}],defaultLayout:{width:600,height:400,pageId:'home'}}
 const previous=wb.registerApp(app);wb.openApp(app.id);previous.suspend()
 const current=wb.registerApp(app);current.suspend();previous()
 assert.equal(wb.getSnapshot().focused,'["owned-source","default"]','Stale source disposal cannot retire a newer suspended registration')
 assert.equal(wb.getSnapshot().windows[0].mode,'normal')
 current();assert.equal(wb.getSnapshot().focused,null);assert.equal(wb.getSnapshot().windows[0].mode,'closed');wb.dispose()
})
