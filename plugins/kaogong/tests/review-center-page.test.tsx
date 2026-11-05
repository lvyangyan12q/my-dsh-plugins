import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
test('unified review center groups both kinds without revealing answer forms',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const old=globalThis.fetch
 globalThis.fetch=async(input)=>new Response(JSON.stringify(String(input).includes('/route')?{points:[{id:'p1',subject:'资料分析',knowledgePoint:'增长率'}]}:String(input).includes('/recall')?{items:[{pointId:'p1',cycleId:'c1',dueAt:'2020-01-01',history:[]}]}:{occurrences:[{id:'o1',subject:'判断推理',knowledgePoint:'图形',review:{status:'scheduled',dueAt:'2099-01-01',history:[]}}]}))
 let root=(await import('react-dom/client')).createRoot(document.getElementById('root')!)
 try{const {ReviewCenter}=await import('../src/review-center.tsx');await act(async()=>root.render(<ReviewCenter/>));assert.match(document.body.textContent??'',/增长率/);assert.match(document.body.textContent??'',/图形/);assert.equal(document.querySelectorAll('textarea').length,0);assert.match(document.body.textContent??'',/逾期/);assert.match(document.body.textContent??'',/后续/);await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='开始回忆')!.click());assert.ok(document.querySelector('textarea'));await act(async()=>root.unmount());root=(await import('react-dom/client')).createRoot(document.getElementById('root')!);await act(async()=>root.render(<ReviewCenter/>));assert.ok(document.querySelector('textarea'),'fresh root resumes the same review activity');await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='返回复习队列')!.click());assert.equal(document.querySelectorAll('textarea').length,0)}
 finally{await act(async()=>root.unmount());globalThis.fetch=old;dom.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})

test('review scheduling requires preview then confirmation and cancel stays inert',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map(),commands:any[]=[]
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const old=globalThis.fetch
 globalThis.fetch=async(input,init)=>{const body=init?.body?JSON.parse(String(init.body)):null;if(body)commands.push(body);return new Response(JSON.stringify(String(input).includes('/plan')?(body?.action==='preview'?{id:'draft',baseRevision:3,diff:[{id:'task',before:null,after:{title:'增长率',date:null}}],overflow:['task']}:{revision:3}):String(input).includes('/route')?{points:[{id:'p1',subject:'资料分析',knowledgePoint:'增长率'}]}:String(input).includes('/recall')?{items:[{pointId:'p1',cycleId:'c1',dueAt:'2020-01-01',history:[]}]}:{occurrences:[]}))}
 const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!)
 const click=async(text:string)=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)!.click())
 try{const {ReviewCenter}=await import('../src/review-center.tsx');await act(async()=>root.render(<ReviewCenter/>));await click('预览排入计划');assert.equal(commands.length,1);assert.deepEqual(commands[0].task.recallReference,{pointId:'p1',cycleId:'c1'});assert.match(document.body.textContent??'',/容量不足，待安排/);await click('取消预览');assert.equal(commands.length,1);await click('预览排入计划');await click('确认排入正式计划');assert.deepEqual(commands.at(-1),{action:'confirm',id:'draft',revision:3,confirmed:true})}
 finally{await act(async()=>root.unmount());globalThis.fetch=old;dom.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})

test('pending recall only retries the original cycle plan effect',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map(),commands:any[]=[]
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const old=globalThis.fetch
 globalThis.fetch=async(input,init)=>{if(init?.body)commands.push(JSON.parse(String(init.body)));return new Response(JSON.stringify(String(input).includes('/route')?{points:[{id:'p1',subject:'资料分析',knowledgePoint:'增长率'}]}:String(input).includes('/recall')?{items:[{pointId:'p1',cycleId:'new',dueAt:'2099-01-01',history:[{cycleId:'old',rating:'forgotten'}],planTask:{id:'task',title:'原计划',date:'2026-11-05',status:'in-progress',recallReference:{pointId:'p1',cycleId:'old'}},planPending:true}]}:{occurrences:[]}))}
 const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!)
 try{const {ReviewCenter}=await import('../src/review-center.tsx');await act(async()=>root.render(<ReviewCenter/>));assert.match(document.body.textContent??'',/复习已保存，计划尚待恢复/);await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='仅重试计划回写')!.click());assert.deepEqual(commands,[{action:'confirm',pointId:'p1',cycleId:'old',rating:'forgotten',confirmed:true}])}
 finally{await act(async()=>root.unmount());globalThis.fetch=old;dom.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})

test('real Host review page schedules then recovers only the failed plan write',async()=>{
 const {fixture}=await import('./standalone-host-fixture.mjs')
 let fail=false
 const app=await fixture({globalFault:(_name:string,value:any)=>{if(fail&&value.tasks?.some((t:any)=>t.status==='completed')){fail=false;throw Error('受控计划写入故障')}}})
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const old=globalThis.fetch,root=(await import('react-dom/client')).createRoot(document.getElementById('root')!)
 try{
  const learner=(await app.request('/api/kaogong/study',{action:'create',kind:'learner',title:'页面联调',confirmed:true})).value
  await app.seedKnowledge(learner.profile.id,{reference:{subject:'行测-言语理解与表达',knowledgePoint:'逻辑填空',title:'参考讲义',content:'结合语境判断词义',kind:'讲义',source:'合成联调',tags:[],createdAt:'2026-01-01',updatedAt:'2026-01-01'}})
  const view=learner.view.id,url='/api/kaogong/recall?viewId='+view,plan='/api/kaogong/plan?viewId='+view
  const enrolled=(await app.request(url,{action:'enroll',pointId:'kg-point-001',confirmed:true})).value
  globalThis.fetch=async(input,init)=>{const path=String(input),result=await app.request(path+(path.includes('?')?'&':'?')+'viewId='+view,init?.body?JSON.parse(String(init.body)):undefined);return new Response(JSON.stringify(result.value),{status:result.status})}
  const {ReviewCenter}=await import('../src/review-center.tsx');await act(async()=>root.render(<ReviewCenter/>))
  const click=async(text:string)=>{for(let i=0;i<100&&!([...document.querySelectorAll('button')].some(b=>b.textContent===text));i++)await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));return act(async()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,text+document.body.textContent);button.click();await new Promise(resolve=>setTimeout(resolve,30))})}
  await click('预览排入计划');assert.equal((await app.request(plan)).value.tasks.length,0);await click('确认排入正式计划');assert.equal((await app.request(plan)).value.tasks.length,1)
  await click('开始回忆');assert.match(document.body.textContent??'',/同步完成/)
  for(let i=0;i<100&&!document.querySelector('textarea');i++)await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));const textarea=document.querySelector('textarea')!;await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'主动检索语境');textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}));textarea.dispatchEvent(new dom.window.Event('change',{bubbles:true}));(document.querySelector('input[type=checkbox]') as HTMLInputElement).click()})
  await click('提交本次回忆');await click('查看参考原文')
  await act(async()=>{const select=document.querySelector('select[aria-label="本次自评"]')!;Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value')!.set!.call(select,'forgotten');select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  fail=true;await click('确认本次回忆完成');for(let i=0;i<100&&!document.body.textContent?.includes('计划尚待恢复');i++)await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));assert.match(document.body.textContent??'',/复习已保存，计划尚待恢复/)
  const partial=(await app.request(url)).value.items[0];assert.equal(partial.history.length,1);assert.notEqual(partial.cycleId,enrolled.cycleId)
  await click('仅重试计划回写');assert.equal((await app.request(plan)).value.tasks[0].status,'completed');assert.equal((await app.request(url)).value.items[0].history.length,1)
 }finally{await act(async()=>root.unmount());globalThis.fetch=old;dom.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k);await app.close()}
})

test('review center keeps same-day future reminders in future group',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-05T00:00:00Z')}); const oldZone=process.env.TZ;process.env.TZ='Asia/Shanghai';
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const old=globalThis.fetch
 globalThis.fetch=async(input)=>new Response(JSON.stringify(String(input).includes('/route')?{points:[{id:'p1',subject:'资料分析',knowledgePoint:'增长率'}]}:String(input).includes('/recall')?{items:[{pointId:'p1',cycleId:'c1',dueAt:'2026-11-05T15:00:00Z',history:[]}]}:{occurrences:[{id:'o1',subject:'判断推理',knowledgePoint:'图形',review:{status:'scheduled',dueAt:'2099-01-01',history:[]}}]}))
 let root=(await import('react-dom/client')).createRoot(document.getElementById('root')!)
 try{const {ReviewCenter}=await import('../src/review-center.tsx');await act(async()=>root.render(<ReviewCenter/>));const later=[...document.querySelectorAll('h2')].find(h=>h.textContent==='后续')!.parentElement!;assert.match(later.textContent??'',/增长率/);const due=[...document.querySelectorAll('h2')].find(h=>h.textContent==='今日到期')!.parentElement!;assert.doesNotMatch(due.textContent??'',/增长率/)}
 finally{await act(async()=>root.unmount());globalThis.fetch=old;if(oldZone===undefined)delete process.env.TZ;else process.env.TZ=oldZone;dom.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})
