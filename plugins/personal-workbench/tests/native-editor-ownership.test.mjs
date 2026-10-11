import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {RecipePage} from '../src/recipe-view.tsx'
import {installTasks} from '../src/task-view.tsx'

test('duplicate role chat modules navigate to one role conversation across kept pages',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),previous=new Map(),effects=[]
 for(const[name,value]of Object.entries({React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 installTasks({effect:run=>{const remove=run();if(typeof remove==='function')effects.push(remove)},inject:()=>{}})
 const module=id=>({id,type:'role-chat',title:id,roleId:'analyst',config:{}}),recipe={schemaVersion:1,appId:'reading',version:1,name:'Reading',description:'',roles:[{id:'analyst',name:'Analyst',presetId:'analyst',skillNames:[]}],connections:[],pages:[{id:'one',label:'One',layout:'grid',modules:[module('first'),module('duplicate')]},{id:'two',label:'Two',layout:'stack',modules:[module('elsewhere')]}]}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));let page='one'
 const slot=(_name,props)=>React.createElement('div',{'data-native-role':props.bindingKey.roleId,'data-native-active':String(props.active)},'Native conversation')
 const render=()=>root.render(React.createElement(RecipePage,{recipe,pageId:page,appId:'reading',instanceId:'first',t:k=>k,renderFactorySlot:slot,onSelectPage:id=>{page=id;render()}}))
 try{
  await act(async()=>render());assert.equal(document.querySelectorAll('[data-native-role]').length,1,'same role has one native factory seat')
  page='two';await act(async()=>render());assert.equal(document.querySelectorAll('[data-native-role]').length,1,'kept pages cannot add another native editor')
  const current=document.querySelector('[data-recipe-page="two"]');const button=[...current.querySelectorAll('button')].find(button=>button.textContent==='moduleRoleConversation');assert.ok(button,'duplicate module links to original role seat');await act(async()=>button.click());assert.equal(page,'one');assert.equal(document.querySelectorAll('[data-native-active="true"]').length,1)
 }finally{await act(async()=>root.unmount());for(const remove of effects.reverse())remove();dom.window.close();for(const[name,value]of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})

test('current role has an explicit complete native conversation entry without creating or sending',async()=>{
 const {RoleConversation}=await import('../src/role-view.tsx'),dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),previous=new Map(),opened=[]
 for(const[name,value]of Object.entries({React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const key={appId:'reading',instanceId:'first',roleId:'analyst'},state={binding:{version:1,key,sessionId:'original-session',presetId:'analyst',phase:'ready',previousSessionIds:[]},busy:false,error:null,window:{phase:'closed'}},fail=()=>assert.fail('Navigation must not create, send, or replace a role Session')
 const props={bindingKey:key,active:false,label:'Analyst',t:k=>k,useRoles:select=>select(new Map([[JSON.stringify(['reading','first','analyst',null]),state]])),useSessionStatus:()=>undefined,commands:{open:fail,ensure:fail,replace:fail},mountRole:fail,SessionProvider:fail,renderSlot:fail,renderFactorySlot:fail,openHistory:id=>opened.push(id)}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
 try{await act(async()=>root.render(React.createElement(RoleConversation,props)));const entry=[...document.querySelectorAll('button')].find(button=>button.textContent==='roleOpenHistoryNative');assert.ok(entry,'current binding needs full native title/trajectory entry');await act(async()=>entry.click());assert.deepEqual(opened,['original-session']);assert.equal(state.binding.sessionId,'original-session')}
 finally{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})

test('hiding a role releases its editor seat without replacing or sending the original Session',async()=>{
 const {RoleConversation}=await import('../src/role-view.tsx'),dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),previous=new Map()
 for(const[name,value]of Object.entries({React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const key={appId:'reading',instanceId:'first',roleId:'analyst'},binding={version:1,key,sessionId:'original-session',presetId:'analyst',phase:'ready',previousSessionIds:[]},state={binding,busy:false,error:null,window:{phase:'open',reference:{sessionId:'original-session'}}},fail=()=>assert.fail('Hiding cannot create, send, replace or stop a role Session')
 const props={bindingKey:key,label:'Analyst',t:k=>k,useRoles:select=>select(new Map([[JSON.stringify(['reading','first','analyst',null]),state]])),useSessionStatus:()=>undefined,commands:{open:async()=>{},ensure:fail,replace:fail,send:fail,stop:fail},mountRole:()=>()=>{},SessionProvider:({children})=>children,renderSlot:()=>React.createElement('textarea',{'aria-label':'Native composer'}),renderFactorySlot:fail}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
 try{await act(async()=>root.render(React.createElement(RoleConversation,{...props,active:true})));assert.ok(document.querySelector('textarea'));await act(async()=>root.render(React.createElement(RoleConversation,{...props,active:false})));assert.equal(document.querySelector('textarea'),null,'hidden application releases the editor root before native navigation');assert.equal(state.binding,binding);await act(async()=>root.render(React.createElement(RoleConversation,{...props,active:true})));assert.ok(document.querySelector('textarea'));assert.equal(state.binding.sessionId,'original-session')}
 finally{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
