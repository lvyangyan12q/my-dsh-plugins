import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {MaterialImportPanel} from '../src/materials-panel.tsx'

test('a relocated material preview shows both roots and pinned aliases before the learner confirms',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true}
 const saved=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 for(const[key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
 const before=globalThis.fetch,calls:Record<string,unknown>[]=[]
 globalThis.fetch=async(_url,options)=>{const body=JSON.parse(String(options?.body));calls.push(body);return new Response(JSON.stringify({plans:[{id:'plan-1',fingerprint:'a'.repeat(64),status:'prepared',sourceRevision:'revision',sourceFiles:[],target:{instanceId:'library'},counts:{bank:10,shareableMaterials:1,privateMaterials:1},location:{materialRoot:'/new/materials',originalMaterialRoot:'/old/materials',aliases:1,sourceEvidenceHash:'b'.repeat(64),mapFingerprint:'c'.repeat(64)}}]}))}
 const root=createRoot(document.getElementById('root')!)
 try{
  await act(async()=>root.render(<MaterialImportPanel viewId="library-view" onApplied={()=>{}}/>))
  assert.match(document.body.textContent??'',/新资料位置/)
  assert.match(document.body.textContent??'',/\/new\/materials/)
  assert.match(document.body.textContent??'',/\/old\/materials/)
  assert.match(document.body.textContent??'',/固定PDF映射 1 项/)
  assert.equal(calls.some(row=>row.action==='apply'),false)
  const confirm=[...document.querySelectorAll('button')].find(button=>button.textContent==='确认接入当前资料库')!
  assert.equal(confirm.disabled,true)
 }finally{await act(async()=>root.unmount());globalThis.fetch=before;dom.window.close();for(const[key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):Reflect.deleteProperty(globalThis,key)}
})
