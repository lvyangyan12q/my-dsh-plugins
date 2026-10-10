import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act,useState} from 'react'
import {JSDOM} from 'jsdom'
import {RecipeRoleSettings} from '../src/recipe-role-settings.tsx'

test('generated module can create its platform-owned builder without adding a public managed Agent',async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map()
 for(const [name,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const oldFetch=globalThis.fetch,calls=[]
 globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({version:1,agents:[],presets:[],skills:[]})}}
 let latest
 const initial={schemaVersion:1,appId:'module.test',version:1,name:'Test',description:'',connections:[],roles:[],pages:[{id:'home',label:'Home',layout:'split',modules:[{id:'generated',type:'custom',config:{mode:'generate'},title:'Generated'},{id:'other',type:'website',config:{url:'https://example.com'},title:'Other'}]}]}
 function Harness(){const [recipe,setRecipe]=useState(initial);latest=recipe;return React.createElement(RecipeRoleSettings,{recipe,pageIndex:0,moduleIndex:0,t:key=>key,change:fn=>setRecipe(old=>{const next=structuredClone(old);fn(next);return next})})}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 try{
  await act(async()=>root.render(React.createElement(Harness)))
  await act(async()=>document.querySelector('button').click())
  assert.equal(latest.roles.length,1)
  assert.equal(latest.roles[0].presetId,'personal-workbench.module-builder.v1')
  assert.deepEqual(latest.roles[0].skillNames,['workbench-module-generate','workbench-page-adjust'])
  assert.equal(latest.pages[0].modules[0].roleId,latest.roles[0].id)
  assert.deepEqual(latest.pages[0].modules[1],initial.pages[0].modules[1])
  const agent=document.querySelector('select[aria-label^="recipeRoleAgent"]')
  assert.equal(agent.value,'personal-workbench.module-builder.v1')
  assert.equal([...agent.options].find(option=>option.value===agent.value).disabled,false)
  assert.deepEqual(calls,[{action:'catalog'}],'Adding an application-owned role cannot create or edit a public Agent')
 }finally{await act(async()=>root.unmount());dom.window.close();globalThis.fetch=oldFetch;for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})
