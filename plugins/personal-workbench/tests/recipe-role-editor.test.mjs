import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act,useState} from 'react'
import {JSDOM} from 'jsdom'
import {RecipeRolesEditor} from '../src/recipe-role-editor.tsx'
test('Agent choices show names, persist exact native preset IDs and preserve explicitly missing or disabled references',async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map();for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const oldFetch=globalThis.fetch,requests=[];let disabled=false,latest
 globalThis.fetch=async(url,options)=>{const request=JSON.parse(options.body);requests.push(request);assert.equal(url,'/api/personal-workbench/management');assert.equal(request.action,'catalog');return{ok:true,json:async()=>({version:1,presets:[{id:'my-dsh.reading-reviewer',name:'Reading reviewer'},{id:'my-dsh.disabled',name:'Disabled Agent'}],agents:[{presetId:'my-dsh.reading-reviewer',name:'Reading reviewer',userInvocable:!disabled},{presetId:'my-dsh.disabled',name:'Disabled Agent',userInvocable:false}]})}}
 const initial={schemaVersion:1,appId:'reading',version:1,name:'Reading',description:'',pages:[],connections:[],roles:[{id:'reviewer',name:'Reviewer',presetId:'reading-reviewer',skillNames:[]}]}
 function Harness(){const[recipe,setRecipe]=useState(initial);latest=recipe;return React.createElement(RecipeRolesEditor,{recipe,t:k=>k,change:update=>setRecipe(previous=>{const next=structuredClone(previous);update(next);return next})})}
 const{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 try{await act(async()=>root.render(React.createElement(Harness)));const select=document.querySelector('select[aria-label="recipeRoleAgent: reviewer"]');assert.ok(select);assert.equal(select.value,'reading-reviewer');assert.match(document.body.textContent,/recipeRoleMissingAgent/);assert.equal([...select.options].find(o=>o.value==='my-dsh.reading-reviewer').textContent,'Reading reviewer');assert.equal([...select.options].find(o=>o.value==='my-dsh.disabled').disabled,true)
 await act(async()=>{select.value='my-dsh.reading-reviewer';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});assert.equal(latest.roles[0].presetId,'my-dsh.reading-reviewer');assert.equal(document.querySelector('p[role="alert"]'),null);assert.equal(requests.length,1)
 disabled=true;await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='recipeRefreshAgents').click());assert.equal(latest.roles[0].presetId,'my-dsh.reading-reviewer');assert.match(document.body.textContent,/recipeRoleMissingAgent/);assert.equal([...select.options].find(o=>o.value==='my-dsh.reading-reviewer').disabled,true);assert.deepEqual(requests.map(r=>r.action),['catalog','catalog'])
 }finally{await act(async()=>root.unmount());dom.window.close();globalThis.fetch=oldFetch;for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
