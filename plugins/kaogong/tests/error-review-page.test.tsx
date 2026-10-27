import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'

import {JSDOM} from 'jsdom'

test('learner reviews historical errors with explicit queue and completion confirmations',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map(),values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
 for(const[key,value]of Object.entries(values)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const oldFetch=globalThis.fetch,commands:any[]=[]
 const occurrence={id:'occurrence',questionId:'q1',roundId:'round-old',subject:'行测-资料分析',knowledgePoint:'直接读取',stem:'原题第一项是2',options:['A. 1','B. 2'],userAnswer:'A',correctAnswer:'B',explanation:'第一项为2',source:'原题来源',errorReason:'审题不清',notes:'过去的笔记',submittedAt:'2026-10-27',review:null as any}
 globalThis.fetch=async(input,init)=>{
  if(init?.body){const body=JSON.parse(String(init.body));commands.push(body);if(body.action==='enroll')occurrence.review={stage:0,status:'scheduled',dueAt:'2099-10-28',history:[]};if(body.action==='answer'){occurrence.review.history=[{id:'attempt',answer:'B',correct:true,answeredAt:'2026-10-27'}];return new Response(JSON.stringify({id:'attempt',answer:'B',correct:true,answeredAt:'2026-10-27'}))};if(body.action==='confirm')occurrence.review={stage:1,status:'scheduled',dueAt:'2026-10-30',history:[{id:'attempt',answer:'B',correct:true,answeredAt:'2026-10-27',reflection:body.reflection,confirmedAt:'2026-10-27'}]}}
  return new Response(JSON.stringify({occurrences:[occurrence],queue:{total:occurrence.review?1:0,due:0}}))
 }
 const {createRoot}=await import('react-dom/client')
 const root=createRoot(document.getElementById('root')!)
 try{
  const {ErrorReviewPanel}=await import('../src/error-review-panel.tsx')
  await act(async()=>root.render(<ErrorReviewPanel/>))
  assert.match(document.body.textContent??'',/原题第一项是2.*原作答：A.*答案：B/s)
  const click=async(text:string)=>act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent===text)!.click())
  await click('加入复习队列')
  assert.equal(commands.length,0)
  await click('确认加入1/3/7天复习')
  assert.equal(commands[0].action,'enroll');assert.equal(commands[0].confirmed,true)
  await click('提前复习')
  const radio=document.querySelector('input[value="B"]') as HTMLInputElement
  await act(async()=>radio.click())
  await click('提交本次复习作答')
  assert.equal(commands.at(-1).action,'answer')
  const textarea=document.querySelector('textarea')!
  await act(async()=>{const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!;setter.call(textarea,'本次读清第一项');textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}));textarea.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  await click('确认本次复习完成')
  assert.equal(commands.at(-1).action,'confirm')
  assert.match(document.body.textContent??'',/第1阶段/)
 }finally{await act(async()=>root.unmount());globalThis.fetch=oldFetch;dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})



