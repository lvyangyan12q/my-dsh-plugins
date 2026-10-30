import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'

import {JSDOM} from 'jsdom'

test('learner reviews historical errors with explicit queue and completion confirmations',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map(),values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
 for(const[key,value]of Object.entries(values)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 let planOpened=0
 const oldFetch=globalThis.fetch,commands:any[]=[]
 const occurrence={id:'occurrence',questionId:'q1',roundId:'round-old',subject:'行测-资料分析',knowledgePoint:'直接读取',stem:'原题第一项是2',options:['A. 1','B. 2'],userAnswer:'A',correctAnswer:'B',explanation:'第一项为2',source:'原题来源',errorReason:'审题不清',notes:'过去的笔记',submittedAt:'2026-10-27',review:null as any}
 globalThis.fetch=async(input,init)=>{
  if(String(input).includes('/plan')&&!init?.body)return new Response(JSON.stringify({revision:4}))
  if(init?.body){const body=JSON.parse(String(init.body));commands.push(body);if(body.action==='enroll')occurrence.review={stage:0,status:'scheduled',dueAt:'2099-10-28',history:[]};if(body.action==='answer'){occurrence.review.history=[{id:'attempt',answer:'B',correct:true,answeredAt:'2026-10-27'}];return new Response(JSON.stringify({id:'attempt',answer:'B',correct:true,answeredAt:'2026-10-27'}))};if(body.action==='confirm')occurrence.review={stage:1,status:'scheduled',dueAt:'2026-10-30',history:[{id:'attempt',answer:'B',correct:true,answeredAt:'2026-10-27',reflection:body.reflection,confirmedAt:'2026-10-27'}]}}
  return new Response(JSON.stringify({occurrences:[occurrence],queue:{total:occurrence.review?1:0,due:0}}))
 }
 const {createRoot}=await import('react-dom/client')
 const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!)
 try{
  const {ErrorReviewPanel}=await import('../src/error-review-panel.tsx')
  await act(async()=>root.render(<ErrorReviewPanel onPlan={()=>{planOpened++}}/>))
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
  await click('预览加入学习计划')
  assert.equal(commands.at(-1).action,'preview');assert.equal(commands.at(-1).operation,'append');assert.equal(commands.at(-1).baseRevision,4)
  assert.deepEqual(commands.at(-1).task.reviewOccurrence,{roundId:'round-old',questionId:'q1'});assert.equal(planOpened,1)
  assert.equal(commands.some(body=>body.action==='confirm'&&body.revision!==undefined),false)
 }finally{await act(async()=>root.unmount());globalThis.fetch=oldFetch;dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})





test('an overdue review previews the current Shanghai calendar date just after midnight',async()=>{
 const timezone=process.env.TZ;process.env.TZ='Asia/Shanghai'
 const RealDate=Date,instant=RealDate.parse('2026-10-26T16:30:00Z')
 class BoundaryDate extends RealDate{constructor(...args:any[]){super(...(args.length?args:[instant]) as [any])}static now(){return instant}}
 Object.defineProperty(globalThis,'Date',{value:BoundaryDate,configurable:true,writable:true})
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map(),values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
 for(const[key,value]of Object.entries(values)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})}
 const prior=globalThis.fetch;let proposed:any
 globalThis.fetch=async(input,init)=>{if(init?.body){proposed=JSON.parse(String(init.body));return new Response('{}')}return new Response(JSON.stringify(String(input).includes('/plan')?{revision:1}:{occurrences:[{id:'occurrence',questionId:'q1',roundId:'round-old',subject:'行测-资料分析',knowledgePoint:'读取',stem:'原题',options:['A. 1'],userAnswer:'',correctAnswer:'A',source:'合成题',explanation:'说明',errorReason:'未答',notes:'',submittedAt:'2026-10-25T16:00:00Z',review:{stage:0,status:'scheduled',dueAt:'2026-10-25T17:00:00Z',history:[]}}],queue:{total:1,due:1}}))}
 const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!)
 try{const{ErrorReviewPanel}=await import('../src/error-review-panel.tsx');await act(async()=>root.render(<ErrorReviewPanel onPlan={()=>{}}/>));await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='预览加入学习计划')!.click());assert.equal(proposed.date,'2026-10-27');assert.match(document.body.textContent??'',/下次：2026-10-26/)}finally{await act(async()=>root.unmount());globalThis.fetch=prior;dom.window.close();Object.defineProperty(globalThis,'Date',{value:RealDate,configurable:true,writable:true});if(timezone===undefined)delete process.env.TZ;else process.env.TZ=timezone;for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})

test('kept-mounted review views isolate radio groups for the same occurrence',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map(),values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
 for(const[key,value]of Object.entries(values)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})}
 const prior=globalThis.fetch,occurrence={id:'same-occurrence',questionId:'q1',roundId:'round-old',subject:'行测-资料分析',knowledgePoint:'读取',stem:'原题',options:['A. 1','B. 2'],userAnswer:'A',correctAnswer:'B',source:'合成题',explanation:'说明',errorReason:'审题不清',notes:'',submittedAt:'2026-10-25',review:{stage:0,status:'scheduled',dueAt:'2020-01-01',history:[]}}
 globalThis.fetch=async()=>new Response(JSON.stringify({occurrences:[occurrence],queue:{total:1,due:1}}))
 const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!)
 try{
  const{ErrorReviewPanel}=await import('../src/error-review-panel.tsx')
  await act(async()=>root.render(<><main><ErrorReviewPanel/></main><aside hidden><ErrorReviewPanel/></aside></>))
  const visible=[...document.querySelectorAll<HTMLInputElement>('main input[type=radio]')],hidden=[...document.querySelectorAll<HTMLInputElement>('aside input[type=radio]')]
  assert.equal(visible.length,2);assert.equal(hidden.length,2)
  await act(async()=>visible[1].click());assert.equal(visible[1].checked,true)
  await act(async()=>hidden[0].click())
  assert.equal(hidden[0].checked,true)
  assert.equal(visible[1].checked,true,'hidden review does not uncheck the visible review answer')
  await act(async()=>visible[0].click());assert.equal(visible[0].checked,true);assert.equal(visible[1].checked,false);assert.equal(hidden[0].checked,true)
 }finally{await act(async()=>root.unmount());globalThis.fetch=prior;dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})
