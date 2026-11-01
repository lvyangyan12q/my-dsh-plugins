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
 const route=body=>body?.action?.startsWith('continuation-')?continuation.request(body):app.request(body)
 const first=await app.request({action:'create',title:'概率',goal:'理解概率',priorKnowledge:'分数'})
 await app.request({action:'create',title:'绘画',goal:'学习透视',priorKnowledge:'素描'})
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true,fetch:async(_url,options)=>({ok:true,json:()=>route(options?.body?JSON.parse(options.body):undefined)})})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 let root=createRoot(document.getElementById('root'))
 try{
  await act(async()=>root.render(React.createElement(LearningStudio)))
  assert.equal(document.querySelector('h1').textContent,'绘画')
  const coursePane=document.querySelector('[aria-label="工作室课程"]')
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='B · 知识地图').click())
  assert.equal(coursePane.hidden,true)
  assert.equal(document.querySelector('[aria-label="知识地图视图"]').hidden,false)
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='A · 工作室').click())
  assert.equal(document.querySelector('[aria-label="工作室课程"]'),coursePane)
  assert.equal(coursePane.hidden,false)
  await act(async()=>{const select=document.querySelector('select');select.value=first.id;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  assert.equal(document.querySelector('h1').textContent,'概率')
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='B · 知识地图').click())
  assert.equal((await continuation.request({action:'continuation-read',instanceId:first.id})).position.view,'map')
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'))
  await act(async()=>root.render(React.createElement(LearningStudio)))
  assert.equal(document.querySelector('h1').textContent,'概率')
  assert.equal(document.querySelector('[aria-label="知识地图视图"]').hidden,false)
  const second=(await app.request()).instances.find(row=>row.id!==first.id)
  async function switchTo(id){await act(async()=>{const select=document.querySelector('select');select.value=id;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
  await switchTo(second.id)
  assert.equal(document.querySelector('[aria-label="工作室课程"]').hidden,false)
  await switchTo(first.id)
  assert.equal(document.querySelector('[aria-label="知识地图视图"]').hidden,false)
  assert.equal((await app.request()).instances.length,2)
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[key,value]of old)value?Object.defineProperty(globalThis,key,value):delete globalThis[key]}
})
