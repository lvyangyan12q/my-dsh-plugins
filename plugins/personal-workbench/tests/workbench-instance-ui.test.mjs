import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act,useSyncExternalStore} from 'react'
import {JSDOM} from 'jsdom'
import {Workbench,windowKey} from '../src/workbench.ts'
import {Workspace} from '../src/workbench-view.tsx'

test('application configuration opens a stable instance without changing another instance, and reports invalid identity',async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map()
 for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const calls=[],workbench=new Workbench()
 workbench.registerApp({id:'user.recipe',name:'Recipe',version:'1',source:'user',icon:'book-open',pages:[{id:'home',label:'Home'},{id:'history',label:'History'}],defaultLayout:{width:700,height:500,pageId:'home'}})
 workbench.openWorkspace()
 const useWorkbench=selector=>selector(useSyncExternalStore(workbench.subscribe,workbench.getSnapshot))
 const{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 const props={useWorkbench,openApp:(...args)=>{calls.push(args);workbench.openApp(...args)},closeWorkspace:workbench.closeWorkspace,focusWindow:workbench.focus,setMode:workbench.setMode,selectPage:workbench.selectPage,setPreference:workbench.setPreference,t:k=>k,renderSlot:(_slot,owner)=>React.createElement('span',null,owner.instanceId)}
 const click=async button=>act(async()=>button.click())
 const input=async value=>act(async()=>{const field=document.querySelector('input[aria-label="appInstanceId: Recipe"]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(field,value);field.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
 const open=()=>document.querySelector('button[aria-label="appOpenInstance: Recipe"]')
 try{
  await act(async()=>root.render(React.createElement(Workspace,props)))
  await click(document.querySelector('summary'));assert.equal(document.querySelector('details').open,true)
  const field=document.querySelector('input[aria-label="appInstanceId: Recipe"]');assert(field,'configuration offers a public instance identity input');assert.equal(field.value,'default')
  await click(open());assert.deepEqual(calls,[['user.recipe','default']])
  await act(async()=>{workbench.selectPage(windowKey('user.recipe','default'),'history');workbench.openWorkspace()})
  await input('second');await click(open())
  assert.equal(workbench.getSnapshot().windows.length,2)
  assert.equal(workbench.getSnapshot().windows.find(row=>row.instanceId==='default').pageId,'history')
  assert(document.querySelector('[aria-label="Recipe · second"]'))
  await act(async()=>workbench.openWorkspace());await click(open())
  assert.equal(workbench.getSnapshot().windows.length,2,'reopening the same instance never duplicates it')
  await act(async()=>workbench.openWorkspace());const before=workbench.getSnapshot()
  await input('');await click(open());assert(document.querySelector('[role="alert"]').textContent.includes('appInstanceInvalid'));assert.equal(workbench.getSnapshot(),before)
  await input('x'.repeat(201));await click(open());assert.equal(workbench.getSnapshot(),before);assert.equal(document.querySelector('input[aria-label="appInstanceId: Recipe"]').value.length,201,'invalid identity is not silently truncated')
  assert.equal(calls.length,3,'invalid identities never reach openApp')
  await act(async()=>workbench.applyLifecycle([{appId:'user.recipe',enabled:false}]))
  assert.equal(open().disabled,true);assert.equal(document.querySelector('input[aria-label="appInstanceId: Recipe"]').disabled,true)
  await click(open());assert.equal(calls.length,3,'disabled application cannot open an instance')
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
