import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {runInNewContext} from 'node:vm'
import React,{act} from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'

test('published classic client script loads through the DSH factory and mounts its standalone menu',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
 const saved={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT}
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})
 const target={mode:'queue',pendingQueue:[],load(value){this.pendingQueue.push(value)}}
 window.__ModuleLoader__=target
 const id='@deepseek-ai/dsh-tool-personal-learning'
 const modules={'react':React,'react/jsx-runtime':jsxRuntime}
 const root=createRoot(document.getElementById('root'))
 try{
  runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window,document,fetch:async()=>({ok:true,json:async()=>({instances:[]})})})
  assert.equal(target.pendingQueue.length,1)
  assert.equal(target.pendingQueue[0].id,id)
  let client
  if(process.env.DSH_SOURCE){
   const {register}=await import('tsx/esm/api');const unregister=register()
   try{
    const {ClientModuleSystem}=await import(pathToFileURL(resolve(process.env.DSH_SOURCE,'packages/client/modules/src/client/system.ts')).href)
    const loader=new ClientModuleSystem({manifest:{rev:'test',modules:[{id,url:'plugins/??'+id+'/client.js&rev=test',rev:'test',inject:[],external:[]}],batches:[]},staticModules:modules,bootstrapModule:{id:'test-bootstrap',exports:{}},registrationTarget:target})
    client=await loader.import(id,'',{})
   }finally{unregister()}
  }else client=target.pendingQueue[0].factory(name=>{assert.ok(name in modules,'unsupported external '+name);return modules[name]})
  const registrations=[]
  client.apply({effect:fn=>{for(const _ of fn()){}},slots:{inject:(_name,fn)=>fn(),register:(config,component)=>{registrations.push({config,component});return()=>{}}}})
  assert.ok(registrations.some(row=>row.config.id==='personal-learning'))
  const entry=registrations.find(row=>row.config.key==='personal-learning')
  await act(async()=>root.render(React.createElement(entry.component)))
  assert.match(document.body.textContent,/你想理解什么/)
 }finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,saved)}
})
