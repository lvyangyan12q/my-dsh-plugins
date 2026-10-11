import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {RecipeEditor} from '../src/recipe-editor.tsx'

const recipe={schemaVersion:1,appId:'local.edit',version:4,name:'Application',description:'Keep',workspace:'D:/project',connections:[{id:'data',sourceAppId:'local.edit',resource:'books'}],roles:[{id:'reader',name:'Reader',presetId:'reader',skillNames:[]}],pages:[{id:'home',label:'Home',layout:'split',modules:[{id:'target',type:'website',title:'Site',config:{url:'https://example.com'}},{id:'keep',type:'role-chat',title:'Chat',roleId:'reader',config:{}}]},{id:'other',label:'Other',layout:'stack',modules:[{id:'file',type:'custom',title:'File',config:{mode:'file',path:'page.html'}}]}]}

async function withEditor(conflict,body){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map(),calls=[]
 let record={appId:recipe.appId,revision:7,draft:structuredClone(recipe),running:structuredClone(recipe)},activated=0
 const fetch=async(url,options)=>{const request=JSON.parse(options.body);calls.push(request);let value
  if(request.action==='catalog')value={recipes:[structuredClone(record)]}
  else if(request.action==='workspaces')value={workspaces:['D:/project']}
  else if(request.action==='save'){
   if(conflict)return {ok:false,json:async()=>({error:'Revision conflict'})}
   assert.equal(request.expectedRevision,record.revision);record={...record,revision:record.revision+1,draft:structuredClone(request.recipe)};value={record:structuredClone(record)}
  }else if(request.action==='preview'){assert.equal(request.expectedRevision,record.revision);value={recipe:structuredClone(record.draft)}}
  else if(request.action==='activate'){assert.equal(request.expectedRevision,record.revision);record.running=structuredClone(record.draft);value={record}}
  else throw new Error('Unexpected request '+url)
  return {ok:true,json:async()=>value}
 }
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,fetch,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
 const button=label=>[...document.querySelectorAll('button')].find(e=>e.textContent===label)
 const click=async label=>{const el=button(label);assert.ok(el,label);assert.equal(el.disabled,false,label);await act(async()=>el.click())}
 try{
  await act(async()=>root.render(React.createElement(RecipeEditor,{target:{appId:recipe.appId,pageId:'home',moduleId:'target',changeContent:true},t:k=>k,refresh:async()=>{},onActivated:()=>activated++})))
  await body({calls,click,button,getRecord:()=>record,getActivated:()=>activated})
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
}

test('runtime content choice edits only the target draft and requires save, preview, activate',async()=>withEditor(false,async({calls,click,button,getRecord,getActivated})=>{
 assert.deepEqual(calls.map(c=>c.action).sort(),['catalog','workspaces'])
 assert.equal(button('recipePreview').disabled,true);assert.equal(button('recipeActivate').disabled,true)
 await click('recipeModuleresources')
 assert.deepEqual(getRecord().running,recipe)
 assert.equal(document.querySelector('[aria-label="moduleTitle: keep"]'),null)
 await click('recipeSave')
 const draft=getRecord().draft
 assert.equal(draft.version,5);assert.equal(draft.pages[0].modules[0].id,'target');assert.equal(draft.pages[0].modules[0].type,'resources')
 assert.deepEqual(draft.pages[0].modules[1],recipe.pages[0].modules[1]);assert.deepEqual(draft.pages[1],recipe.pages[1]);assert.deepEqual(draft.roles,recipe.roles);assert.deepEqual(draft.connections,recipe.connections)
 assert.deepEqual(getRecord().running,recipe);assert.equal(button('recipeActivate').disabled,true)
 await click('recipePreview');assert.deepEqual(getRecord().running,recipe)
 await click('recipeActivate');assert.equal(getActivated(),1);assert.deepEqual(getRecord().running,draft)
 assert.equal(calls.some(c=>/delete|remove/.test(c.action)),false)
}))

test('runtime edit revision conflict retains the edit and does not preview or activate',async()=>withEditor(true,async({calls,click,button,getRecord})=>{
 await click('recipeModuleresources');await click('recipeSave')
 assert.match(document.querySelector('[role="alert"]').textContent,/Revision conflict/)
 assert.equal(document.querySelector('[aria-label="moduleType: target"]').value,'resources')
 assert.equal(button('recipePreview').disabled,true);assert.equal(button('recipeActivate').disabled,true)
 assert.deepEqual(getRecord().draft,recipe);assert.deepEqual(getRecord().running,recipe)
 assert.equal(calls.some(c=>c.action==='activate'||c.action==='preview'),false)
}))
