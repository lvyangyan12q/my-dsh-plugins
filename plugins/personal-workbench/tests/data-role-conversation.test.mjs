import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act,useState,useEffect} from 'react'
import {JSDOM} from 'jsdom'
import {RecipePage,registerRecipeModuleRenderer} from '../src/recipe-view.tsx'
import {PreparedTasks} from '../src/task-client.ts'
import {installTasks} from '../src/task-view.tsx'
import {registerRecipeModuleContextProvider} from '../src/module-context.ts'

test('data task results expose one kept native conversation and reuse an existing chat across pages',async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map();for(const[name,value]of Object.entries({React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const roles={open:async()=>{},send:async()=>{}},tasks=new PreparedTasks(roles),ctx={get:name=>name==='personalWorkbenchTasks'?tasks:roles},effects=[];let mounts=0,page='data';
 installTasks({effect:fn=>{const remove=fn();if(typeof remove==='function')effects.push(remove)},inject:()=>{}})
 const removeContext=registerRecipeModuleContextProvider('detail',()=>({phase:'ready',context:[]}))
 const remove=registerRecipeModuleRenderer('detail',()=>React.createElement('p',null,'Reading detail'))
 const recipe={schemaVersion:1,appId:'reading',version:1,name:'Reading',description:'',connections:[],roles:[{id:'analyst',name:'Analyst',presetId:'native-analyst',skillNames:[]}],pages:[{id:'data',label:'Data',layout:'stack',modules:[{id:'reading-detail',type:'detail',title:'Reading detail',roleId:'analyst',config:{taskPrompt:'Analyze reading'}}]},{id:'more',label:'More',layout:'stack',modules:[{id:'other-detail',type:'detail',title:'More detail',roleId:'analyst',config:{}}]}]}
 function Native({bindingKey,active}){useEffect(()=>{mounts++},[]);return React.createElement('div',{'data-native-role':bindingKey.roleId,'data-active':String(active)},React.createElement('textarea',{'aria-label':'Native composer',defaultValue:'Kept draft'}),React.createElement('p',null,'Native result and trajectory'))}
 const slot=(name,props)=>{assert.equal(name,'personal-workbench.role-conversation');assert.deepEqual(props.bindingKey,{appId:'reading',instanceId:'one',roleId:'analyst'});return React.createElement(Native,props)}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 function App({value}){const[id,setId]=useState('data');page=id;return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setId('more')},'More page'),React.createElement(RecipePage,{recipe:value,pageId:id,appId:'reading',instanceId:'one',ctx,t:k=>k,renderFactorySlot:slot,onSelectPage:setId}))}
 const click=async text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text&&!b.closest('[hidden]'));assert.ok(button,text);await act(async()=>button.click())}
 try{
  await act(async()=>root.render(React.createElement(App,{value:recipe})));await click('taskPrepared');await click('taskSend');assert.equal(tasks.getSnapshot().size,0)
  await click('moduleRoleConversation');assert.match(document.body.textContent,/Native result and trajectory/);assert.equal(mounts,1)
  const composer=document.querySelector('[aria-label="Native composer"]');composer.value='Unsent native draft';await click('moduleRoleConversation');await click('moduleRoleConversation');assert.equal(document.querySelector('[aria-label="Native composer"]'),composer);assert.equal(mounts,1)
  await click('More page');await click('moduleRoleConversation');assert.equal(page,'data');assert.equal(document.querySelector('[aria-label="Native composer"]'),composer);assert.equal(composer.value,'Unsent native draft');assert.equal(mounts,1,'a second data page must not allocate another native conversation')
  await act(async()=>root.unmount());const second=createRoot(document.getElementById('mount'));const withChat=structuredClone(recipe);withChat.pages[1].modules=[{id:'chat',type:'role-chat',title:'Existing chat',roleId:'analyst',config:{}}];mounts=0
  await act(async()=>second.render(React.createElement(App,{value:withChat})));assert.equal(mounts,0);await click('moduleRoleConversation');assert.equal(page,'more');assert.equal(mounts,1);assert.equal(document.querySelectorAll('[data-native-role]').length,1)
  await act(async()=>second.unmount())
 }finally{if(document.getElementById('mount')?.childNodes.length)await act(async()=>root.unmount());remove();removeContext();for(const fn of effects.reverse())fn();dom.window.close();for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
