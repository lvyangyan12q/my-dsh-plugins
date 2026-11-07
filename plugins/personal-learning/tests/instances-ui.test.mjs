import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {createContinuation} from '../src/continuation.mjs'
import {createApplication} from '../src/application.mjs'

test('studio selector opens another instance and remount restores it',async()=>{
 await build({entryPoints:[fileURLToPath(new URL('../src/client.tsx',import.meta.url))],outfile:fileURLToPath(new URL('../.checks/instances-ui.mjs',import.meta.url)),bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic'})
 const {LearningStudio}=await import('../.checks/instances-ui.mjs')
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
 const old=new Map();let saved={instances:[],lastInstanceId:null}
 const app=createApplication({read:async()=>structuredClone(saved),write:async s=>{saved=structuredClone(s)}})
 const continuation=createContinuation({read:async()=>structuredClone(saved),write:async s=>{saved=structuredClone(s)}})
 const route=body=>{if(body?.action?.startsWith('continuation-'))return continuation.request(body);if(body?.action==='course-list')return[];if(body?.action==='teaching-workspaces'||body?.action==='request-list')return[];return app.request(body)}
 const first=await app.request({action:'create',title:'概率',goal:'理解概率',priorKnowledge:'分数'})
 await app.request({action:'create',title:'绘画',goal:'学习透视',priorKnowledge:'素描'})
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true,fetch:async(_url,options)=>({ok:true,json:()=>route(options?.body?JSON.parse(options.body):undefined)})})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 let root=createRoot(document.getElementById('root'))
 const studio=()=>document.querySelector('[aria-label="学习实验台"]')
 const map=()=>document.querySelector('[aria-label="知识地图视图"]')
 const selectedTitle=()=>document.querySelector('[aria-label="当前学习空间"]').selectedOptions[0].textContent
 async function ready(){
  for(let i=0;i<20;i++){
   const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='B · 知识地图')
   if(button&&!button.disabled)return button
   await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5))})
  }
  throw Error('view switch never became ready')
 }
 async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5))})}
 async function view(name){
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===name).click())
  await settle()
 }
 try{
  await act(async()=>root.render(React.createElement(LearningStudio)))
  await ready()
  assert.equal(selectedTitle(),'绘画')
  assert.ok(studio())
  await view('B · 知识地图')
  assert.ok(map())
  assert.equal(studio(),null)
  await view('A · 工作室')
  assert.ok(studio())
  assert.equal(map(),null)
  await act(async()=>{const select=document.querySelector('[aria-label="当前学习空间"]');select.value=first.id;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  await ready()
  assert.equal(selectedTitle(),'概率')
  await view('B · 知识地图')
  assert.equal((await continuation.request({action:'continuation-read',instanceId:first.id})).position.view,'map')
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(React.createElement(LearningStudio)))
  await ready()
  assert.equal(selectedTitle(),'概率')
  assert.ok(map())
  const second=(await app.request()).instances.find(row=>row.id!==first.id)
  async function switchTo(id){await act(async()=>{const select=document.querySelector('[aria-label="当前学习空间"]');select.value=id;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
  await switchTo(second.id)
  await ready()
  assert.ok(studio())
  await switchTo(first.id)
  await ready()
  assert.ok(map())
  assert.equal((await app.request()).instances.length,2)
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[key,value]of old)value?Object.defineProperty(globalThis,key,value):delete globalThis[key]}
})
