import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'

import {JSDOM} from 'jsdom'

test('learner reviews historical errors with explicit queue and completion confirmations',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map(),values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
 for(const[key,value]of Object.entries(values)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 let planOpened=0,loseAnswerResponse=true
 const oldFetch=globalThis.fetch,commands:any[]=[]
 const occurrence={id:'occurrence',questionId:'q1',roundId:'round-old',subject:'行测-资料分析',knowledgePoint:'直接读取',stem:'原题第一项是2',options:['A. 1','B. 2'],userAnswer:'A',correctAnswer:'B',explanation:'第一项为2',source:'原题来源',errorReason:'审题不清',notes:'过去的笔记',submittedAt:'2026-10-27',review:null as any}
 globalThis.fetch=async(input,init)=>{
  if(String(input).includes('/plan')&&!init?.body)return new Response(JSON.stringify({revision:4}))
  if(init?.body){const body=JSON.parse(String(init.body));commands.push(body);if(body.action==='enroll')occurrence.review={stage:0,status:'scheduled',dueAt:'2099-10-28',history:[]};if(body.action==='answer'&&loseAnswerResponse){loseAnswerResponse=false;throw Error('network response lost')}if(body.action==='answer'){occurrence.review.history=[{id:'attempt',answer:'B',correct:true,answeredAt:'2026-10-27'}];return new Response(JSON.stringify({id:'attempt',answer:'B',correct:true,answeredAt:'2026-10-27'}))};if(body.action==='confirm')occurrence.review={stage:1,status:'scheduled',dueAt:'2026-10-30',history:[{id:'attempt',answer:'B',correct:true,answeredAt:'2026-10-27',reflection:body.reflection,confirmedAt:'2026-10-27'}]}}
  return new Response(JSON.stringify({occurrences:[occurrence],queue:{total:occurrence.review?1:0,due:0}}))
 }
 const {createRoot}=await import('react-dom/client')
 let root=(await import('react-dom/client')).createRoot(document.getElementById('root')!)
 try{
  const {ErrorReviewPanel}=await import('../src/error-review-panel.tsx')
  const {KaogongTransportContext}=await import('../src/view-context.tsx')
  const render=()=>act(async()=>root.render(<KaogongTransportContext.Provider value={{instanceId:'profile-one',fetch:(input:any,init:any)=>fetch(input,init),url:(input:any)=>input} as any}><ErrorReviewPanel onPlan={()=>{planOpened++}}/></KaogongTransportContext.Provider>))
  await render()
  assert.match(document.body.textContent??'',/原题第一项是2.*原作答：A.*答案：B/s)
  const click=async(text:string)=>act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent===text)!.click())
  await click('加入复习队列')
  assert.equal(commands.length,0)
  await click('确认加入1/3/7天复习')
  assert.equal(commands[0].action,'enroll');assert.equal(commands[0].confirmed,true)
  await click('开始错题复习')
  assert.doesNotMatch(document.body.textContent??'',/答案：B|过去的笔记|第一项为2/)
  await click('提前复习')
  const radio=document.querySelector('input[value="B"]') as HTMLInputElement
  await act(async()=>radio.click())
  await click('查看错题历史');await click('开始错题复习')
  assert.equal((document.querySelector('input[value="B"]') as HTMLInputElement)?.checked,true)
  await click('提交本次复习作答')
  assert.equal(commands.at(-1).action,'answer')
  const originalRequest=commands.at(-1).requestId
  await click('查看错题历史');await click('开始错题复习');await click('提交本次复习作答')
  assert.equal(commands.at(-1).requestId,originalRequest)
  const textarea=document.querySelector('textarea')!
  await act(async()=>{const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!;setter.call(textarea,'本次读清第一项');textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}));textarea.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!);await render();await click('开始错题复习')
  assert.equal(document.querySelector('textarea')!.value,'本次读清第一项')
  const oldDraftKeys=Object.keys(dom.window.localStorage)
  dom.window.localStorage.setItem('unrelated-profile-draft','keep')
  await click('确认本次复习完成')
  assert.equal(dom.window.localStorage.getItem('unrelated-profile-draft'),'keep')
  for(const key of oldDraftKeys)assert.equal(dom.window.localStorage.getItem(key),null)
  assert.equal((document.querySelector('input[value="B"]')as HTMLInputElement)?.checked??false,false)
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
  await act(async()=>{for(const b of document.querySelectorAll('button'))if(b.textContent==='开始错题复习')b.click()})
  const visible=[...document.querySelectorAll<HTMLInputElement>('main input[type=radio]')],hidden=[...document.querySelectorAll<HTMLInputElement>('aside input[type=radio]')]
  assert.equal(visible.length,2);assert.equal(hidden.length,2)
  await act(async()=>visible[1].click());assert.equal(visible[1].checked,true)
  await act(async()=>hidden[0].click())
  assert.equal(hidden[0].checked,true)
  assert.equal(visible[1].checked,true,'hidden review does not uncheck the visible review answer')
  await act(async()=>visible[0].click());assert.equal(visible[0].checked,true);assert.equal(visible[1].checked,false);assert.equal(hidden[0].checked,true)
 }finally{await act(async()=>root.unmount());globalThis.fetch=prior;dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})


test('review drafts and late commands stay with their profile across fresh mounts',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const {createRoot}=await import('react-dom/client'),{ErrorReviewPanel}=await import('../src/error-review-panel.tsx'),{KaogongTransportContext}=await import('../src/view-context.tsx')
 let root=createRoot(document.getElementById('root')!),finish:((r:Response)=>void)|undefined
 const item=(stem:string)=>({id:'same',questionId:'q',roundId:'r',subject:stem,knowledgePoint:'考点',stem,options:['A. 一','B. 二'],source:'测试',explanation:'解析',correctAnswer:'B',userAnswer:'A',notes:'',errorReason:'',submittedAt:'2026-01-01',review:{stage:0,status:'scheduled',dueAt:'2099-01-01',history:[]}})
 let posts=0
 const transport=(id:string)=>({instanceId:id,url:(s:string)=>s,fetch:async(_s:string,init?:RequestInit)=>{if(init?.body){posts++;return await new Promise<Response>(resolve=>{finish=resolve})}return new Response(JSON.stringify({occurrences:[item('题目'+id)]}))}})
 const a=transport('A'),b=transport('B')
 const render=async(t:any)=>act(async()=>root.render(<KaogongTransportContext.Provider value={t}><ErrorReviewPanel/></KaogongTransportContext.Provider>))
 const click=async(text:string)=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)!.click())
 try{
  await render(a);await click('开始错题复习');await click('提前复习');await act(async()=>(document.querySelector('input[value="B"]')as HTMLInputElement).click())
  await render(b)
  assert.doesNotMatch(document.body.textContent??'',/题目A/)
  if([...document.querySelectorAll('button')].some(b=>b.textContent==='开始错题复习'))await click('开始错题复习')
  assert.equal(!!document.querySelector('input[type=radio]'),false,'B never inherits A early consent')
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!)
  await render(a);await click('开始错题复习')
  assert.equal((document.querySelector('input[value="B"]')as HTMLInputElement).checked,true)
  await click('提交本次复习作答');assert.equal(posts,1)
  await render(b)
  await act(async()=>finish!(new Response('{}')))
  assert.doesNotMatch(document.body.textContent??'',/题目A/)
  assert.match(document.body.textContent??'',/题目B/)
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})

 test('a task review target opens only its own occurrence in review mode',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map();for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true})}
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({occurrences:['chosen','other'].map(id=>({id,subject:'科目',knowledgePoint:id,stem:id,explanation:'说明',options:['A. 一'],submittedAt:'2026-01-01',review:null}))}));
 const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!);try{const{SdkClassroom}=await import('../src/sdk-classroom.tsx'),{KaogongViewStatePool,KaogongStateContext,KaogongPresentationContext}=await import('../src/view-state.tsx');const pool=new KaogongViewStatePool(),view=pool.forView('target-profile','target-view');view.cell('study.page',null).set('errors');view.cell('review.target',null).set('chosen');await act(async()=>root.render(<KaogongStateContext.Provider value={pool.forInstance('target-profile')}><KaogongPresentationContext.Provider value={view}><SdkClassroom {...{profile:{id:'target-profile',title:'备考'},view:{id:'target-view'},roles:null,tasks:null} as any}/></KaogongPresentationContext.Provider></KaogongStateContext.Provider>));assert.equal(document.body.textContent?.includes('other'),false);assert.equal(document.body.textContent?.includes('chosen'),true);assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent==='查看错题历史'),true);const back=[...document.querySelectorAll('button')].find(b=>b.textContent==='返回全部错题');assert.equal(!!back,true);await act(async()=>back!.click());assert.equal(document.body.textContent?.includes('other'),true);await act(async()=>view.cell('review.target',null).set('chosen'));assert.equal(document.body.textContent?.includes('other'),false);await act(async()=>[...document.querySelectorAll('nav[aria-label="学习页面"] button')].find(b=>b.textContent==='错题与复习')!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));assert.equal(document.body.textContent?.includes('other'),true)}finally{await act(async()=>root.unmount());globalThis.fetch=old;dom.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
 })
