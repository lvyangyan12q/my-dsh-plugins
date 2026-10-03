import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {RecipeEditor} from '../src/recipe-editor.tsx'
test('invalid advanced JSON remains editable, reports validation and never crashes the form',async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map();for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const oldFetch=globalThis.fetch,calls=[];globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));return{ok:true,json:async()=>({recipes:[]})}}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 const click=async text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,text);await act(async()=>button.click())}
 try{await act(async()=>root.render(React.createElement(RecipeEditor,{t:k=>k,refresh:async()=>{}})));await click('recipeCreate')
 for(const value of ['{}','[]','{"appId":"partial","pages":[{}]}']){const textarea=document.querySelector('textarea[aria-label="recipeConfiguration"]');assert.ok(textarea);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(textarea,value);textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});assert.equal(document.querySelector('textarea[aria-label="recipeConfiguration"]').value,value);assert.match(document.body.textContent,/recipeInvalidConfiguration/);await click('recipeSave');assert.match(document.body.textContent,/recipeError/);assert.equal(calls.some(r=>r.action==='save'),false)}
 }finally{await act(async()=>root.unmount());dom.window.close();globalThis.fetch=oldFetch;for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})

test('creation stages retain one editable draft and require save and preview before explicit activation',async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map()
 for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const oldFetch=globalThis.fetch,calls=[];let record,refreshes=0
 globalThis.fetch=async(url,options)=>{const request=JSON.parse(options.body);calls.push(request);let value
  if(url.endsWith('/management'))value={version:1,presets:[],agents:[]}
  else if(request.action==='catalog')value={recipes:record?[record]:[]}
  else if(request.action==='save'){record={appId:request.recipe.appId,revision:1,draft:request.recipe};value={record}}
  else if(request.action==='preview')value={recipe:record.draft}
  else if(request.action==='activate'){record={...record,revision:2,running:record.draft};value={record}}
  else assert.fail(request.action)
  return{ok:true,json:async()=>value}
 }
 const{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 const click=async text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,text);await act(async()=>button.click())}
 const current=()=>document.querySelector('[aria-current="step"]').textContent
 try{await act(async()=>root.render(React.createElement(RecipeEditor,{t:k=>k,refresh:async()=>{refreshes++}})));await click('recipeCreate');assert.equal(current(),'recipeBasics');assert.equal(document.querySelector('select[aria-label="recipeSource"]'),null)
 const input=document.querySelector('input[aria-label="recipeName"]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Unsaved reading');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
 await click('recipeNext');assert.equal(current(),'recipeConnections');assert.equal(document.querySelector('input[aria-label="recipeName"]'),null)
 await click('recipeNext');assert.equal(current(),'recipeRolesStep');await click('recipeAddRole');assert.equal(JSON.parse(document.querySelector('textarea[aria-label="recipeConfiguration"]').value).roles.length,1)
 await click('recipeBack');await click('recipeBack');assert.equal(document.querySelector('input[aria-label="recipeName"]').value,'Unsaved reading')
 // Remove the unconfigured role in advanced mode before asking the real Host to admit it.
 const text=document.querySelector('textarea[aria-label="recipeConfiguration"]'),draft=JSON.parse(text.value);draft.roles=[]
 await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(text,JSON.stringify(draft,null,2));text.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
 await click('recipeNext');await click('recipeNext');await click('recipeNext');assert.equal(current(),'recipePreviewStep');assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='recipePreview').disabled,true);assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='recipeActivate').disabled,true)
 await click('recipeSave');assert.equal(record.running,undefined);await click('recipePreview');assert.equal(record.running,undefined);await click('recipeBack');await click('recipeNext');assert.ok(document.querySelector('[data-preview="true"]'));await click('recipeActivate');assert.equal(record.running.name,'Unsaved reading');assert.equal(refreshes,1);assert.deepEqual(calls.filter(r=>['save','preview','activate'].includes(r.action)).map(r=>r.action),['save','preview','activate'])
 }finally{await act(async()=>root.unmount());dom.window.close();globalThis.fetch=oldFetch;for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
