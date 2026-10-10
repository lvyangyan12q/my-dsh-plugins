import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act,useState} from 'react'
import {JSDOM} from 'jsdom'

test('an installed application module is chosen in the canvas without overwriting existing bindings',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,React,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const {RecipeCanvas}=await import('../src/recipe-canvas.tsx'),{registerRecipeModuleRenderer}=await import('../src/recipe-view.tsx'),{createRoot}=await import('react-dom/client')
 const original={schemaVersion:1,appId:'own-app',version:4,name:'Existing',description:'',pages:[{id:'home',label:'Home',layout:'grid',modules:[{id:'kept',type:'detail',title:'Existing detail',roleId:'analyst',connectionId:'owned',config:{taskPrompt:'Preserve task'}}]}],roles:[{id:'analyst',name:'Existing analyst',presetId:'existing',skillNames:[]}],connections:[{id:'owned',sourceAppId:'own-app',resource:'records'}]};let current
 function Harness(){const [recipe,setRecipe]=useState(original);current=recipe;return React.createElement(RecipeCanvas,{recipe,t:key=>key,change:fn=>setRecipe(prior=>{const next=structuredClone(prior);fn(next);return next})})}
 const root=createRoot(document.getElementById('root')),withdraw=registerRecipeModuleRenderer('own-record-editor',()=>null,{title:'Own record manager',appIds:['own-app']})
 try{
  await act(async()=>root.render(React.createElement(Harness)))
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='moduleAdd').click())
  const choice=[...document.querySelectorAll('button')].find(b=>b.textContent==='Own record manager');assert.ok(choice,'App-provided module appears in the visual content directory')
  await act(async()=>choice.click());assert.equal(current.pages[0].modules[1].type,'own-record-editor');assert.equal(current.pages[0].modules[1].title,'Own record manager');assert.deepEqual(current.pages[0].modules[0],original.pages[0].modules[0]);assert.deepEqual(current.roles,original.roles);assert.deepEqual(current.connections,original.connections)
  const select=document.querySelector('select[aria-label="moduleType: '+current.pages[0].modules[1].id+'"]');assert.equal(select.selectedOptions[0].textContent,'Own record manager')
 }finally{await act(async()=>root.unmount());withdraw();dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
})

test('application module choices follow scope and registration lifetime while legacy renderer registrations stay compatible',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,React,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const {CanvasContentPicker}=await import('../src/recipe-canvas.tsx'),{RecipePage,registerRecipeModuleRenderer}=await import('../src/recipe-view.tsx'),{createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));let withdraw=()=>{},legacy=()=>{},calls=0
 const picker=appId=>React.createElement(CanvasContentPicker,{appId,moduleId:'new',t:key=>key,onChoose:()=>{}})
 const recipe=appId=>({schemaVersion:1,appId,version:5,name:'App',description:'',roles:[],connections:[],pages:[{id:'home',label:'Home',layout:'stack',modules:[{id:'editor',type:'scoped-record-editor',title:'Editor',config:{}}]}]})
 try{
  await act(async()=>root.render(picker('owned')));assert.equal(document.body.textContent.includes('Scoped manager'),false)
  await act(async()=>{withdraw=registerRecipeModuleRenderer('scoped-record-editor',props=>{calls++;return React.createElement('p',null,props.preview?'Preview only':'Runtime manager')},{title:'Scoped manager',appIds:['owned']})});assert.match(document.body.textContent,/Scoped manager/)
  await act(async()=>root.render(picker('foreign')));assert.equal(document.body.textContent.includes('Scoped manager'),false)
  await act(async()=>root.render(React.createElement(RecipePage,{recipe:recipe('foreign'),appId:'foreign',instanceId:'default',pageId:'home',preview:true,t:key=>key})));assert.equal(calls,0);assert.match(document.body.textContent,/recipeMissingModule/)
  await act(async()=>root.render(React.createElement(RecipePage,{recipe:recipe('owned'),appId:'owned',instanceId:'default',pageId:'home',preview:true,t:key=>key})));assert.match(document.body.textContent,/Preview only/)
  await act(async()=>root.render(picker('owned')));await act(async()=>withdraw());assert.equal(document.body.textContent.includes('Scoped manager'),false)
  await act(async()=>{legacy=registerRecipeModuleRenderer('scoped-record-editor',()=>React.createElement('p',null,'Legacy renderer'))})
  await act(async()=>root.render(React.createElement(RecipePage,{recipe:recipe('foreign'),appId:'foreign',instanceId:'default',pageId:'home',preview:true,t:key=>key})));assert.match(document.body.textContent,/Legacy renderer/)
 }finally{await act(async()=>root.unmount());withdraw();legacy();dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
})
