import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {RoleConversation} from '../src/role-view.tsx'
import {revealAnnotationComposer} from '../src/annotation-composer.ts'

test('explicit annotation reveal closes only target role history and retains current native draft',async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost',pretendToBeVisual:true}),saved=new Map()
 for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const key={appId:'annotation-history',instanceId:'default',roleId:'teacher'},state={binding:{version:1,key,sessionId:'current',presetId:'teacher',phase:'ready',previousSessionIds:['old']},busy:false,error:null,window:{phase:'open',reference:{}}}
 const fail=()=>assert.fail('Reveal must not create/replace/send a native Session')
 const props={bindingKey:key,active:false,label:'Teacher',t:k=>k,useRoles:select=>select(new Map([[JSON.stringify([key.appId,key.instanceId,key.roleId,null]),state]])),useSessionStatus:()=>undefined,commands:{open:fail,ensure:fail,replace:fail},mountRole:()=>()=>{},SessionProvider:({children})=>children,renderSlot:()=>React.createElement('div',{role:'textbox',contentEditable:true,suppressContentEditableWarning:true},'Current draft'),renderFactorySlot:(_name,p)=>React.createElement('dialog',{open:true,'aria-label':'History'},React.createElement('div',{role:'textbox',contentEditable:true,suppressContentEditableWarning:true},'Old draft'),React.createElement('button',{onClick:p.close},'Close'))}
 const{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 try{
  await act(async()=>root.render(React.createElement(RoleConversation,props)))
  const current=document.querySelector('[role=textbox]');await act(async()=>document.querySelector('button[aria-label="roleViewHistory: old"]').click());assert(document.querySelector('dialog[open]'))
  await act(async()=>revealAnnotationComposer(document.getElementById('mount'),key,new AbortController().signal,'Missing'))
  assert.equal(!!document.querySelector('dialog[open]'),false,'Annotation must reveal current Session rather than keep its native draft behind old history')
  assert.equal(document.querySelector('[role=textbox]'),current);assert.equal(current.textContent,'Current draft');assert.equal(state.binding.sessionId,'current');assert.deepEqual(state.binding.previousSessionIds,['old'])
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of saved){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
