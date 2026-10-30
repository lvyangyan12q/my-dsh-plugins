import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import {SourceConnections} from '../src/study-source-panel.tsx'

test('source connections are read on open and change only through the learner confirmation',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
  const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true}
  const saved=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
  for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
  const prior=globalThis.fetch,calls:Record<string,unknown>[]=[]
  globalThis.fetch=async(_input,options)=>{const body=JSON.parse(String(options?.body));calls.push(body);return new Response(JSON.stringify(body.action==='source-list'?{libraries:[{profileId:'library-a',title:'已核验资料',viewId:'library-view'}],connections:[]}:{}))}
  const root=createRoot(document.getElementById('root')!)
  try{
    await act(async()=>root.render(<SourceConnections viewId="view-a"/>))
    assert.equal(calls.filter(row=>row.action==='source-share').length,0)
    await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='确认使用题库')!.click())
    assert.deepEqual(calls.find(row=>row.action==='source-share'),{action:'source-share',viewId:'view-a',ownerViewId:'library-view',resourceId:'question-bank'})
  }finally{await act(async()=>root.unmount());globalThis.fetch=prior;dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})
