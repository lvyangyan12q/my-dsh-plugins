import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act,useEffect,useRef} from 'react'
import {JSDOM} from 'jsdom'
import {RoleConversation} from '../src/role-view.tsx'
import {roleKey} from '../src/role-client.ts'

test('subject and role selection retain keyboard focus across an embedded composer mount; deliberate composer interaction still submits',async()=>{
 const dom=new JSDOM('<select aria-label="教师科目"><option>默认老师</option><option>判断推理</option></select><button id="role">辅导员</button><div id="mount"></div>',{url:'http://localhost',pretendToBeVisual:true}),saved=new Map()
 for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const drafts=new Map([['default','默认草稿'],['判断推理','尚未发送的独立草稿'],['counselor','辅导草稿']]),sent=[]
 // Public content occupant models the observed native mount autofocus contract.
 // It does not claim to run the native Lexical editor or an actual Host request.
 function Composer({id}){const ref=useRef(null);useEffect(()=>{ref.current.focus()},[id]);return React.createElement('textarea',{ref,defaultValue:drafts.get(id),onKeyDown:event=>{if(event.key==='Enter'){sent.push({id,draft:event.currentTarget.value});event.preventDefault()}}})}
 const key={appId:'kaogong',instanceId:'default',roleId:'teacher'}
 const props={active:false,t:k=>k,useSessionStatus:()=>undefined,commands:{open:()=>Promise.resolve()},mountRole:()=>()=>{},SessionProvider:({children})=>children,renderFactorySlot:()=>null}
 const{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 const render=async(bindingKey,id)=>act(async()=>root.render(React.createElement(RoleConversation,{...props,bindingKey,useRoles:select=>select(new Map([[roleKey(bindingKey),{binding:{sessionId:id,presetId:'preset',phase:'ready'},busy:false,error:null,window:{phase:'open',reference:{sessionId:id}}}]])),renderSlot:()=>React.createElement(Composer,{key:id,id})})))
 const enter=()=>document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}))
 try{
  await render(key,'default')
  assert.equal(document.activeElement?.tagName,'TEXTAREA','Initial content may still take focus when no application control owns it')
  const select=document.querySelector('select');select.focus()
  await render({...key,subject:'判断推理'},'判断推理')
  assert.equal(document.activeElement?.getAttribute("aria-label"),"教师科目",'Mounting the selected subject cannot steal the selector keyboard focus')
  await act(async()=>enter());assert.deepEqual(sent,[],'Selector confirmation must not submit the preserved new-subject draft')
  const role=document.getElementById('role');role.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true}));role.focus()
  await render({...key,roleId:'counselor'},'counselor')
  assert.equal(document.activeElement?.id,"role",'Role selection also owns focus through mount')
  await act(async()=>enter());assert.deepEqual(sent,[])
  const editor=document.querySelector('textarea');editor.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true}));editor.focus()
  await act(async()=>enter());assert.deepEqual(sent,[{id:'counselor',draft:'辅导草稿'}],'A deliberate interaction with the native content remains editable and sendable')
  select.focus();await render({...key,subject:'判断推理'},'判断推理')
  select.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));document.querySelector('textarea').focus()
  assert.equal(document.activeElement?.tagName,'TEXTAREA','Explicit Tab navigation can enter the content without focus being restored to the selector')
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of saved){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
