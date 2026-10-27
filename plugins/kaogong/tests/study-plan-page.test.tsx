import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
test('plan page reads unknown goal and previews before an explicit confirmation writes the plan',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),keys={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true},saved=new Map(Object.keys(keys).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
 for(const[k,v]of Object.entries(keys))Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true})
 const prior=globalThis.fetch,calls:any[]=[],empty={revision:0,goal:null,tasks:[],drafts:[],history:[],externalMocks:[]},draft={id:'draft-a',baseRevision:0,goal:{examDate:null,dailyModules:2,subjects:[]},tasks:[],diff:[],overflow:[]}
 globalThis.fetch=async(_input,init)=>{const body=init?.body?JSON.parse(String(init.body)):null;calls.push(body);return new Response(JSON.stringify(body?.action==='preview'?draft:empty))}
 const root=createRoot(document.getElementById('root')!)
 try{
  const {StudyPlanPanel}=await import('../src/study-plan-panel.tsx')
  await act(async()=>root.render(<StudyPlanPanel onPage={()=>{}} onOpenTeacher={async()=>{}}/>))
  assert.match(document.body.textContent??'',/考试日期待设置/)
  assert.equal(calls.filter(b=>b?.action==='confirm').length,0)
  await act(async()=>{[...document.querySelectorAll('button')].find(b=>b.textContent==='预览计划')!.click()})
  assert.equal(calls.filter(b=>b?.action==='preview').length,1);assert.equal(calls.filter(b=>b?.action==='confirm').length,0)
  await act(async()=>{[...document.querySelectorAll('button')].find(b=>b.textContent==='确认采用此预览')!.click()})
  assert.deepEqual(calls.find(b=>b?.action==='confirm'),{action:'confirm',id:'draft-a',revision:0,confirmed:true})
 }finally{await act(async()=>root.unmount());globalThis.fetch=prior;dom.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})
