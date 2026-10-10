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

test('canvas creation retains stable panes and requires save and preview before explicit activation',async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map()
 for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const oldFetch=globalThis.fetch,calls=[];let record,refreshes=0
 globalThis.fetch=async(url,options)=>{const request=JSON.parse(options.body);calls.push(request);let value
  if(url.endsWith('/management'))value={version:1,presets:[],agents:[]}
  else if(request.action==='workspaces')value={workspaces:[]}
  else if(request.action==='catalog')value={recipes:record?[record]:[]}
  else if(request.action==='save'){record={appId:request.recipe.appId,revision:1,draft:request.recipe};value={record}}
  else if(request.action==='preview')value={recipe:record.draft}
  else if(request.action==='activate'){record={...record,revision:2,running:record.draft};value={record}}
  else assert.fail(request.action)
  return{ok:true,json:async()=>value}
 }
 const{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 const click=async text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,text);await act(async()=>button.click())}
 try{await act(async()=>root.render(React.createElement(RecipeEditor,{t:k=>k,refresh:async()=>{refreshes++}})));const split=document.querySelector('button[aria-label="recipeStartersplit"]');assert.ok(split);await act(async()=>split.click());await click('recipeCreate');const starter=JSON.parse(document.querySelector('textarea[aria-label="recipeConfiguration"]').value);assert.equal(starter.pages[0].layout,'split');assert.deepEqual(starter.pages[0].modules.map(m=>m.type),['empty','empty']);assert.deepEqual(starter.connections,[]);assert.deepEqual(starter.roles,[]);assert.equal(document.querySelector('[aria-current="step"]'),null)
 const input=document.querySelector('input[aria-label="recipeName"]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Unsaved reading');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
 const left=starter.pages[0].modules[0].id,right=starter.pages[0].modules[1].id
 const choose=document.querySelector('button[aria-label="recipeModulewebsite: '+left+'"]');assert.ok(choose);await act(async()=>choose.click())
 const url=document.querySelector('input[aria-label="moduleUrl: '+left+'"]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(url,'https://example.com/learning');url.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
 const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label)
 assert.equal(button('recipePreview').disabled,true);assert.equal(button('recipeActivate').disabled,true)
 await click('recipeSave');assert.equal(record.running,undefined);assert.equal(record.draft.pages[0].modules[0].config.url,'https://example.com/learning');assert.equal(record.draft.pages[0].modules[1].id,right)
 await click('recipePreview');assert.equal(record.running,undefined);assert.ok(document.querySelector('[data-preview="true"]'))
 await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Revised reading');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
 assert.equal(button('recipeActivate').disabled,true);assert.equal(document.querySelector('[data-preview="true"]'),null)
 await click('recipeSave');await click('recipePreview');await click('recipeActivate');assert.equal(record.running.name,'Revised reading');assert.equal(refreshes,1);assert.equal(record.running.pages[0].modules[0].id,left);assert.deepEqual(calls.filter(r=>['save','preview','activate'].includes(r.action)).map(r=>r.action),['save','preview','save','preview','activate'])
 }finally{await act(async()=>root.unmount());dom.window.close();globalThis.fetch=oldFetch;for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
