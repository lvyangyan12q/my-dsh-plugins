import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'

test('recipe connection restores visible filter, search and detail after page owner teardown',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,React,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const {createRoot}=await import('react-dom/client'),{RecipePage}=await import('../src/recipe-view.tsx'),{installDisplayModules}=await import('../src/display-view.tsx'),{registerDisplaySource}=await import('../src/display-api.ts')
 let root=createRoot(document.getElementById('root')),remove=installDisplayModules(),loads=0,subscriptions=0,notify
 const withdraw=registerDisplaySource({appId:'reading',resource:'books',label:'Books',subscribe:(scope,callback)=>{assert.equal(scope.instanceId,'default');subscriptions++;notify=callback;return()=>{subscriptions--}},load:async()=>{loads++;return {records:[{id:'walden',title:'Walden',fields:{category:'Literature'}},{id:'habits',title:'Atomic Habits',fields:{category:'Learning'}}],filters:[{field:'category',label:'Category'}],stats:[{id:'count',label:'Count',operation:'count'}]}}})
 const recipe={schemaVersion:1,appId:'reading',version:1,name:'Reading',description:'',roles:[],connections:[{id:'books',sourceAppId:'reading',resource:'books'}],pages:[{id:'home',label:'Home',layout:'grid',modules:['filter','stats','list','detail'].map(type=>({id:type,type,title:type,connectionId:'books',config:{}}))}]}
 const render=()=>root.render(React.createElement(RecipePage,{recipe,pageId:'home',appId:'reading',instanceId:'default',preview:false,t:key=>key}))
 try{
  await act(async()=>render());assert.equal(loads,1);assert.equal(subscriptions,1)
  await act(async()=>{const select=document.querySelector('select[aria-label="Category"]');select.value='Literature';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  await act(async()=>{const input=document.querySelector('input[aria-label="displaySearch"]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Walden');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
  await act(async()=>document.querySelector('.pwb-display-list button').click())
  assert.equal(document.querySelector('input').value,'Walden');assert.equal(document.querySelector('.pwb-display-detail h4').textContent,'Walden');assert.equal(document.querySelector('[data-stat="count"]').textContent,'1')
  await act(async()=>root.unmount());remove();assert.equal(subscriptions,0)
  remove=installDisplayModules();root=createRoot(document.getElementById('root'));await act(async()=>render())
  assert.equal(loads,2);assert.equal(subscriptions,1);assert.equal(document.querySelector('select').value,'Literature');assert.equal(document.querySelector('input').value,'Walden');assert.equal(document.querySelector('.pwb-display-list button').getAttribute('aria-pressed'),'true');assert.equal(document.querySelector('.pwb-display-detail h4').textContent,'Walden');assert.equal(document.querySelector('[data-stat="count"]').textContent,'1')
  await act(async()=>notify());assert.equal(loads,3);assert.equal(document.querySelector('.pwb-display-detail h4').textContent,'Walden')
 }finally{await act(async()=>root.unmount());withdraw();remove();dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
})
