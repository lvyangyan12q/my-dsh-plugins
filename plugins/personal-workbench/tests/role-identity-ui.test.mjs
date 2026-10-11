import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {RoleConversation} from '../src/role-view.tsx'
import {roleKey} from '../src/role-client.ts'

test('rebinding a retained module hides old role overlays immediately while same-role updates preserve history',async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost',pretendToBeVisual:true}),saved=new Map()
 for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const keyA={appId:'app',instanceId:'default',roleId:'a'},keyB={...keyA,roleId:'b'}
 const states=new Map([keyA,keyB].map(key=>[roleKey(key),{binding:{version:1,key,sessionId:key.roleId+'-current',presetId:'preset',phase:'ready',previousSessionIds:[key.roleId+'-old']},busy:false,error:null,window:{phase:'closed'}}]))
 const calls=[],fail=()=>assert.fail('Overlay changes must not create, replace, attach or send a Session')
 const props={active:false,t:k=>k,useRoles:select=>select(states),useSessionStatus:()=>undefined,commands:{open:fail,ensure:fail,replace:fail,attach:fail},mountRole:()=>()=>{},SessionProvider:({children})=>children,renderSlot:()=>null,renderFactorySlot:(name,p)=>{calls.push({name,sessionId:p.sessionId,expectedSessionId:p.expectedSessionId,roleId:p.bindingKey?.roleId});return React.createElement('div',{'data-overlay':name},p.sessionId??p.expectedSessionId)}}
 const{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 const render=async(key,extra={})=>act(async()=>root.render(React.createElement(RoleConversation,{...props,bindingKey:key,...extra})))
 try{
  await render(keyA)
  await act(async()=>document.querySelector('button[aria-label="roleViewHistory: a-old"]').click())
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='roleAttach').click())
  assert.equal(document.querySelectorAll('[data-overlay]').length,2)
  await render({...keyA},{expectedPresetId:'changed-agent'})
  assert.equal(document.querySelectorAll('[data-overlay]').length,2,'Agent change within the same role preserves its overlays')
  calls.length=0;await render(keyB)
  assert.deepEqual(calls,[],'No render of A history or attachment is permitted under B identity, even before effects')
  assert.equal(document.querySelectorAll('[data-overlay]').length,0)
  await render(keyA);assert.equal(document.querySelectorAll('[data-overlay]').length,0,'Returning to A does not reopen stale overlays')
  assert.equal(states.get(roleKey(keyA)).binding.sessionId,'a-current')
  assert.deepEqual(states.get(roleKey(keyA)).binding.previousSessionIds,['a-old'])
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of saved){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
