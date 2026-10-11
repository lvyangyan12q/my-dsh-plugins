import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {RecipeEditor} from '../src/recipe-editor.tsx'

test('workspace selector recognises Windows spelling without changing saved identity and keeps missing/POSIX paths distinct',async()=>{
 const cases=[
  ['D:/proof/workspace','D:\\proof\\workspace',true],
  ['d:/Proof/Workspace/','D:\\proof\\workspace',true],
  ['//server/share/workspace','\\\\server\\share\\workspace',true],
  ['D:/proof/missing','D:\\proof\\workspace',false],
  ['/proof/Workspace','/proof/workspace',false],
  ['//proof/Workspace','//proof/workspace',false],
  ['/proof/a\\b','/proof/a/b',false],
 ]
 for(const[selected,known,available]of cases){
  const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map()
  for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
  const oldFetch=globalThis.fetch,calls=[],recipe={schemaVersion:1,appId:'workspace-proof',version:1,name:'Workspace proof',description:'',workspace:selected,pages:[{id:'home',label:'Home',layout:'stack',modules:[]}],connections:[],roles:[]}
  globalThis.fetch=async(_url,options)=>{const request=JSON.parse(options.body);calls.push(request);return{ok:true,json:async()=>request.action==='catalog'?{recipes:[{appId:recipe.appId,revision:1,draft:recipe}]}:request.action==='workspaces'?{workspaces:[known]}:{}}}
  const{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
  try{
   await act(async()=>root.render(React.createElement(RecipeEditor,{t:k=>k,refresh:async()=>{}})))
   const chooser=document.querySelector('select[aria-label="recipeSelect"]');await act(async()=>{chooser.value=recipe.appId;chooser.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
   const selector=document.querySelector('select[aria-label="workspaceRoot"]');assert.equal(selector.value,selected)
   assert.equal([...selector.options].some(o=>o.textContent.includes('displayUnavailable')),!available,selected)
   assert.equal(selector.options.length,available?2:3,selected)
   assert.equal(JSON.parse(document.querySelector('textarea[aria-label="recipeConfiguration"]').value).workspace,selected)
   assert(!calls.some(c=>['save','activate','ensure'].includes(c.action)))
  }finally{await act(async()=>root.unmount());dom.window.close();globalThis.fetch=oldFetch;for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
 }
})
