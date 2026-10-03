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
