import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {Readable} from 'node:stream'
import {RecipeEditor} from '../src/recipe-editor.tsx'
import {installRecipes} from '../src/recipe-host.ts'

const source=process.env.DSH_SOURCE
assert.ok(source)
const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json'))
const {Context}=require('@deepseek-ai/cordis')
const built=p=>import(pathToFileURL(resolve(source,p,'lib/index.js')).href)
const {default:Storage}=await built('packages/storage/storage')
const {JsonStorageBackend}=await built('packages/storage/storage-json')
const {DomainFacility}=await built('packages/storage/storage-domain')
async function host(directory){
 const ctx=new Context();await ctx.plugin(Storage)
 const backend=new JsonStorageBackend(directory);ctx.storage.backend.register('json',backend)
 const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility)
 const owner=await installRecipes({storageDomain:facility,connection:{requestRejection:()=>undefined},reflect:{provide:()=>()=>{}}})
 return {call:async data=>{
  const req=Readable.from([JSON.stringify(data)]);req.method='POST';req.headers={'content-type':'application/json'}
  let status,value;await owner.handle(req,{setHeader:()=>{},writeHead:v=>{status=v},end:v=>{value=JSON.parse(v)}})
  return {ok:status===200,json:async()=>value}
 },close:async()=>{await owner.dispose();await ctx.fiber.dispose()}}
}

test('author can reopen an enabled application and publish an edit without changing its running version before activation',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'recipe-authoring-')),dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map()
 for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const oldFetch=globalThis.fetch;let api=await host(directory),root
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/personal-workbench/recipes');return api.call(JSON.parse(options.body))}
 const click=async text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,text);assert.equal(button.disabled,false,text);await act(async()=>button.click());const saving=[...document.querySelectorAll('button')].find(b=>b.textContent==='recipeSave');for(let i=0;saving?.disabled&&i<100;i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10))});assert.equal(saving?.disabled,false,text)}
 const catalog=async()=>(await(await api.call({action:'catalog'})).json()).recipes
 const input=async(selector,value)=>{const node=document.querySelector(selector);assert.ok(node,selector);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})}
 const {createRoot}=await import('react-dom/client')
 try{
  root=createRoot(document.getElementById('mount'));await act(async()=>root.render(React.createElement(RecipeEditor,{t:k=>k,refresh:async()=>{}})))
  await click('recipeCreate');await input('input[aria-label="recipeName"]','Field notebook')
  const initial=JSON.parse(document.querySelector('textarea[aria-label="recipeConfiguration"]').value),ids=initial.pages[0].modules.map(module=>module.id)
  const choose=async(index,type)=>{const button=document.querySelector('button[aria-label="recipeModule'+type+': '+ids[index]+'"]');assert.ok(button);await act(async()=>button.click())}
  await choose(0,'website');await input('input[aria-label="moduleUrl: '+ids[0]+'"]','https://example.com/reference')
  await choose(1,'custom');const customSource=document.querySelector('select[aria-label="moduleSource: '+ids[1]+'"]');await act(async()=>{customSource.value='file';customSource.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});await input('input[aria-label="moduleFile: '+ids[1]+'"]','pages/notebook.html')
  await choose(2,'resources');await input('input[aria-label="moduleDirectory: '+ids[2]+'"]','materials')
  await choose(3,'animation');await input('input[aria-label="moduleUrl: '+ids[3]+'"]','https://example.com/animation')
  await click('recipeAddPage');await click('canvasPageSettings');const pages=JSON.parse(document.querySelector('textarea[aria-label="recipeConfiguration"]').value).pages;await input('input[aria-label="recipePageLabel: '+pages[1].id+'"]','Notes')
  await click('recipeSave');assert.equal(document.querySelector('[role="alert"]')?.textContent,undefined);const identity=(await catalog())[0].appId
  const saved=(await catalog())[0].draft;assert.deepEqual(saved.pages[0].modules.map(module=>module.id),ids);assert.deepEqual(saved.pages[0].modules.map(module=>module.type),['website','custom','resources','animation']);assert.deepEqual(saved.pages[0].modules.map(module=>module.config),[{url:'https://example.com/reference'},{mode:'file',path:'pages/notebook.html'},{basePath:'materials'},{url:'https://example.com/animation'}]);assert.equal(saved.pages[1].label,'Notes')
  await click('recipePreview');assert.equal((await catalog())[0].running,undefined)
  await click('recipeActivate');assert.equal((await catalog())[0].running.name,'Field notebook')
  await act(async()=>root.unmount());await api.close();api=await host(directory)
  root=createRoot(document.getElementById('mount'));await act(async()=>root.render(React.createElement(RecipeEditor,{t:k=>k,refresh:async()=>{}})))
  for(let i=0;i<100&&!document.querySelector('select[aria-label="recipeSelect"] option[value="'+identity+'"]');i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10))});const chooser=document.querySelector('select[aria-label="recipeSelect"]');await act(async()=>{chooser.value=identity;chooser.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  await input('input[aria-label="recipeName"]','Revised notebook');await click('recipeSave')
  assert.equal(document.querySelector('[role="alert"]')?.textContent,undefined,'normal editing must remain saveable without opening advanced version controls')
  let row=(await catalog())[0];assert.equal(row.appId,identity);assert.equal(row.draft.version,2);assert.equal(row.running.version,1);assert.equal(row.running.name,'Field notebook')
  await click('recipePreview');assert.equal((await catalog())[0].running.name,'Field notebook')
  await click('recipeActivate');await act(async()=>root.unmount());root=undefined;await api.close();api=await host(directory)
  row=(await catalog())[0];assert.equal(row.running.name,'Revised notebook');assert.equal(row.running.version,2);assert.equal(row.appId,identity);assert.deepEqual(row.running.pages,saved.pages)
 }finally{if(root)await act(async()=>root.unmount());await api.close();await rm(directory,{recursive:true,force:true});globalThis.fetch=oldFetch;dom.window.close();for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})




