import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {PreparedTasks} from '../src/task-client.ts'
const require=createRequire(import.meta.url),key={appId:'reading',instanceId:'first',roleId:'analyst'}
const recipe={schemaVersion:1,appId:'reading',version:1,name:'Reading',description:'',connections:[],roles:[{id:'analyst',name:'Analyst',presetId:'p',skillNames:[]}],pages:[{id:'home',label:'Home',layout:'stack',modules:[{id:'books',type:'stats',title:'Books',roleId:'analyst',config:{taskPrompt:'Analyze',taskContext:'Context source'}}]},{id:'detail',label:'Detail',layout:'stack',modules:[{id:'details',type:'detail',title:'Details',roleId:'analyst',config:{taskPrompt:'Analyze detail'}}]}]}
test('built module prepare stays local across pages; visible context can be removed before explicit send',async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map()
 for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const calls=[],sent=[];const roles={open:async()=>calls.push('read'),send:async(target,text)=>sent.push({target,text})},tasks=new PreparedTasks(roles),ctx={get:name=>name==='personalWorkbenchTasks'?tasks:roles}
 let api;const window={__ModuleLoader__:{load:({factory})=>api=factory(require)}}
 await runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window,console,AbortController,fetch:()=>assert.fail('No network/model call during module preparation')})
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 const render=(pageId,preview=false)=>root.render(React.createElement(api.RecipePage,{recipe,pageId,appId:key.appId,instanceId:key.instanceId,ctx,t:k=>k,preview}))
 const click=async text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,text);await act(async()=>button.click())}
 try{await act(async()=>render('home',true));assert.equal(document.querySelectorAll('button').length,0);assert.deepEqual(sent,[]);assert.deepEqual(calls,[])
 await act(async()=>render('home'));await click('taskPrepared');assert.match(document.body.textContent,/analyst/);assert.match(document.body.textContent,/Books.*home\/books/);assert.equal(document.querySelector('textarea[aria-label="Books"]').value,'Context source');assert.deepEqual(sent,[])
 await act(async()=>{tasks.editTask(key,'Edited task');tasks.editContext(key,'books','Edited evidence')});assert.equal(document.querySelector('textarea[aria-label="taskText"]').value,'Edited task')
 await act(async()=>render('detail'));assert.equal(document.querySelector('textarea[aria-label="taskText"]').value,'Edited task');assert.equal(document.querySelector('textarea[aria-label="Books"]').value,'Edited evidence');await click('taskRemove');assert.equal(document.querySelector('textarea[aria-label="Books"]'),null);assert.deepEqual(sent,[])
 await click('taskSend');assert.equal(sent.length,1);assert.deepEqual(sent[0].target,key);assert.ok(sent[0].text.startsWith('Edited task'));assert.ok(!sent[0].text.includes('Edited evidence'));assert.equal(tasks.getSnapshot().size,0)
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
