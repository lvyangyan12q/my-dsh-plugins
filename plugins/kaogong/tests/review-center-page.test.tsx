import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
test('unified review center groups both kinds without revealing answer forms',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const old=globalThis.fetch
 globalThis.fetch=async(input)=>new Response(JSON.stringify(String(input).includes('/route')?{points:[{id:'p1',subject:'资料分析',knowledgePoint:'增长率'}]}:String(input).includes('/recall')?{items:[{pointId:'p1',cycleId:'c1',dueAt:'2020-01-01',history:[]}]}:{occurrences:[{id:'o1',subject:'判断推理',knowledgePoint:'图形',review:{status:'scheduled',dueAt:'2099-01-01',history:[]}}]}))
 const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!)
 try{const {ReviewCenter}=await import('../src/review-center.tsx');await act(async()=>root.render(<ReviewCenter/>));assert.match(document.body.textContent??'',/增长率/);assert.match(document.body.textContent??'',/图形/);assert.equal(document.querySelectorAll('textarea').length,0);assert.match(document.body.textContent??'',/逾期/);assert.match(document.body.textContent??'',/后续/)}
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
