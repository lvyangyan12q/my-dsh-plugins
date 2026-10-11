import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {PreparedTasks} from '../src/task-client.ts'
const require=createRequire(import.meta.url),key={appId:'reading',instanceId:'first',roleId:'analyst'}
const recipe={schemaVersion:1,appId:'reading',version:1,name:'Reading',description:'',connections:[],roles:[{id:'analyst',name:'Analyst',presetId:'p',skillNames:[]}],pages:[{id:'home',label:'Home',layout:'stack',modules:[{id:'books',type:'fixture-stats',title:'Books',roleId:'analyst',config:{taskPrompt:'Analyze'}},{id:'chat',type:'role-chat',title:'Chat',roleId:'analyst',config:{}},{id:'chat2',type:'role-chat',title:'Chat again',roleId:'analyst',config:{}}]},{id:'detail',label:'Detail',layout:'stack',modules:[{id:'details',type:'fixture-detail',title:'Details',roleId:'analyst',config:{taskPrompt:'Analyze detail'}}]}]}
test('built module prepare stays local across pages; visible context can be removed before explicit send',async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map()
 for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const calls=[],sent=[];const roles={open:async()=>calls.push('read'),send:async(target,text)=>sent.push({target,text})},tasks=new PreparedTasks(roles),ctx={get:name=>name==='personalWorkbenchTasks'?tasks:roles}
 let api;const window={localStorage:{getItem:()=>null,setItem:()=>{}},__ModuleLoader__:{load:({factory})=>api=factory(require)}}
 await runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window,console,AbortController,fetch:()=>assert.fail('No network/model call during module preparation')})
 api.apply({effect:run=>run(),inject:()=>{},reflect:{provide:()=>()=>{}},slots:{inject:()=>{},register:()=>{},registerFactory:()=>{}},locale:{register:()=>()=>{}},get:()=>undefined,sessions:{},workspaces:{list:{getSnapshot:()=>({phase:'ready',state:'idle',archivedSessionIds:[]}),subscribe:()=>()=>{}}}})
 for(const type of ['fixture-stats','fixture-detail'])api.registerRecipeModuleContextProvider(type,props=>({phase:'ready',context:type==='fixture-stats'?[{id:'books',label:'Books',source:'Fixture source',text:'Context source'}]:[]}))
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 const render=(pageId,preview=false)=>root.render(React.createElement(api.RecipePage,{recipe,pageId,appId:key.appId,instanceId:key.instanceId,ctx,t:k=>k,preview}))
 const click=async text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text&&!b.closest('[hidden]'));assert.ok(button,text);await act(async()=>button.click())}
 try{await act(async()=>render('home',true));assert.equal(document.querySelectorAll('button').length,0);assert.deepEqual(sent,[]);assert.deepEqual(calls,[])
 await act(async()=>render('home'));await click('taskPrepared');assert.match(document.body.textContent,/taskTarget: Analyst/);assert.equal(document.querySelectorAll('fieldset').length,1,'one chat editor per role despite multiple chat/action modules');assert.match(document.body.textContent,/Books.*home\/books/);assert.equal(document.querySelector('textarea[aria-label="Books"]').value,'Context source');assert.deepEqual(sent,[])
 await act(async()=>{tasks.editTask(key,'Edited task');tasks.editContext(key,'books','Edited evidence')});assert.equal(document.querySelector('textarea[aria-label="taskText"]').value,'Edited task')
 await act(async()=>render('detail'));const visible=document.querySelector('[data-recipe-page="detail"]');assert.equal(visible.querySelectorAll('fieldset').length,1,'one fallback editor without a role-chat module');assert.equal(visible.querySelector('textarea[aria-label="taskText"]').value,'Edited task');assert.equal(visible.querySelector('textarea[aria-label="Books"]').value,'Edited evidence');await click('taskRemove');assert.equal(visible.querySelector('textarea[aria-label="Books"]'),null);assert.deepEqual(sent,[])
 await click('taskSend');assert.equal(sent.length,1);assert.deepEqual(sent[0].target,key);assert.ok(sent[0].text.startsWith('Edited task'));assert.ok(!sent[0].text.includes('Edited evidence'));assert.equal(tasks.getSnapshot().size,0)
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})

test('built public role page bounds a long conversation and keeps mixed display pages scrollable',async()=>{
 const dom=new JSDOM('<div id="mount" style="display:flex;width:1100px;height:700px;overflow:hidden"></div>',{url:'http://localhost'}),original=new Map()
 for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 let api;const window={localStorage:{getItem:()=>null,setItem:()=>{}},__ModuleLoader__:{load:({factory})=>api=factory(require)}}
 await runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window,console,AbortController,fetch:()=>assert.fail('Layout must not issue a request')})
 api.apply({effect:run=>run(),inject:()=>{},reflect:{provide:()=>()=>{}},slots:{inject:()=>{},register:()=>{},registerFactory:()=>{}},locale:{register:()=>()=>{}},get:()=>undefined,sessions:{},workspaces:{list:{getSnapshot:()=>({phase:'ready',state:'idle',archivedSessionIds:[]}),subscribe:()=>()=>{}}}})
 const roleRecipe={...recipe,pages:[{id:'role',label:'Role',layout:'grid',modules:[recipe.pages[0].modules[1]]}]}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 const slot=(name,props)=>{assert.equal(name,'personal-workbench.role-conversation');assert.equal(props.active,true);return React.createElement('div',{'data-native-fixture':true,style:{display:'flex',flexDirection:'column',height:'100%',minHeight:0}},React.createElement('div',{style:{flex:1,minHeight:0,overflow:'auto'}},'Long prepared context '.repeat(2000)),React.createElement('textarea',{'aria-label':'Native composer'}))}
 try{await act(async()=>root.render(React.createElement(api.RecipePage,{recipe:roleRecipe,pageId:'role',appId:'reading',instanceId:'first',t:k=>k,renderFactorySlot:slot})))
 const page=document.querySelector('[data-recipe-version]'),module=page.firstElementChild,chat=module.querySelector('section'),native=document.querySelector('[data-native-fixture]').parentElement
 assert.equal(page.style.width,'100%');assert.equal(page.style.height,'calc(100% - 44px)');assert.equal(page.style.flex,'1 1 0%');assert.equal(page.style.minHeight,'0px');assert.equal(page.style.overflow,'auto');assert.equal(page.style.gridTemplateColumns,'minmax(0,1fr)');assert.equal(page.style.gridAutoRows,'minmax(0,1fr)')
 for(const container of [module,chat,native]){assert.equal(container.style.minHeight,'0px');assert.equal(container.style.overflow,'hidden')}
 assert.equal(chat.style.width,'100%');assert.equal(native.style.flex,'1 1 0%');assert.ok(document.querySelector('textarea[aria-label="Native composer"]'));assert.ok(document.body.textContent.length>30000)
 // JSDOM checks the actual built renderer's containment contract; formal Browser verifies pixel geometry.
 await act(async()=>root.render(React.createElement(api.RecipePage,{recipe,pageId:'home',appId:'reading',instanceId:'first',t:k=>k,renderFactorySlot:slot})))
 assert.equal(document.querySelector('[data-recipe-version]').style.gridAutoRows,'minmax(440px,auto)');assert.equal(document.querySelector('[data-recipe-version]').style.overflow,'auto')
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
