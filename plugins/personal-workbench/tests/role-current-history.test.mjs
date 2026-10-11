import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {RoleConversation} from '../src/role-view.tsx'

test('changed recipe Agent exposes retained current history before explicit replacement without an implicit command',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),originals=new Map(),calls=[];
 for(const [name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const key={appId:'reading',instanceId:'first',roleId:'analyst'},binding={version:1,key,sessionId:'preserved-current-session',presetId:'old-agent',phase:'ready',previousSessionIds:[]};
 const state={binding,busy:false,error:null,window:{phase:'closed'}};
 let confirmed=false;originals.set('confirm',Object.getOwnPropertyDescriptor(globalThis,'confirm'));Object.defineProperty(globalThis,'confirm',{configurable:true,writable:true,value:()=>confirmed});
 const fail=()=>assert.fail('Viewing preserved history cannot create, replace, attach or send a Session');
 const props={bindingKey:key,active:false,expectedPresetId:'new-agent',label:'Analyst',t:k=>k,useRoles:select=>select(new Map([[JSON.stringify(['reading','first','analyst',null]),state]])),useSessionStatus:()=>undefined,commands:{open:fail,ensure:fail,replace:async(key,id)=>calls.push({name:'replace',key,id}),attach:fail},mountRole:fail,SessionProvider:fail,renderSlot:fail,renderFactorySlot:(name,props)=>{calls.push({name,id:props.sessionId});return React.createElement('div',{'data-history-id':props.sessionId},'History mount')}};
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
 try{await act(async()=>root.render(React.createElement(RoleConversation,props)));assert.match(document.body.textContent,/rolePresetChanged/);
 const button=document.querySelector('button[aria-label="roleViewHistory: preserved-current-session"]');assert.ok(button,'The original current Session needs a history entry while its Agent differs');
 await act(async()=>button.click());assert.deepEqual(calls.at(-1),{name:'personal-workbench.role-history',id:'preserved-current-session'});assert.equal(document.querySelectorAll('[data-history-id]').length,1);assert.equal(document.querySelector('[data-history-id]').getAttribute('data-history-id'),'preserved-current-session');assert.equal(binding.sessionId,'preserved-current-session');assert.deepEqual(binding.previousSessionIds,[]);
 const replace=[...document.querySelectorAll('button')].find(button=>button.textContent.includes('新建角色会话'));assert.ok(replace);await act(async()=>replace.click());assert.equal(calls.filter(call=>call.name==='replace').length,0,'Cancel cannot issue a replacement command');assert.equal(binding.sessionId,'preserved-current-session');confirmed=true;await act(async()=>replace.click());assert.deepEqual(calls.at(-1),{name:'replace',key,id:'preserved-current-session'});
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [name,value]of originals){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
