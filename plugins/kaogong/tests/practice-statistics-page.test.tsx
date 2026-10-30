import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'

test('overview and progress label scored slots, answered blanks unique counts and the full denominator separately',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true},saved=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 for(const[key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
 const prior=globalThis.fetch,stats={submittedRoundCount:2,submittedCount:20,answeredCount:10,unansweredCount:10,uniqueQuestionCount:10,correctCount:6,incorrectCount:4,accuracyRate:.3,errorReasons:[{reason:'审题不清',count:2,knowledgePoints:['直接读取']}]}
 globalThis.fetch=async input=>new Response(JSON.stringify(String(input).includes('/dashboard')?{today:'2026-10-27',modules:[],todayPlan:{items:[]},weakPoints:[],totalQuestions:20,totalCorrect:6,totalWrong:4,accuracyRate:.3,bankTotal:10,knowledgeTotal:0,practiceStatistics:stats}:[]))
 const root=createRoot(document.getElementById('root')!)
 try{
  const {ScopedStudyView}=await import('../src/client.tsx')
  await act(async()=>root.render(<ScopedStudyView profile={{id:'statistics-profile',kind:'learner',title:'备考档案',revision:1}} view={{id:'statistics-view',profileId:'statistics-profile'}}/>))
  const panel=document.querySelector('[aria-label="系统判分练习统计"]')
  assert.ok(panel)
  assert.match(panel.textContent??'',/累计提交20/)
  assert.match(panel.textContent??'',/实际作答10/)
  assert.match(panel.textContent??'',/未答10/)
  assert.match(panel.textContent??'',/去重题数10/)
  assert.match(panel.textContent??'',/30%/)
  assert.match(panel.textContent??'',/全部提交题量.*含未答/)
  await act(async()=>[...document.querySelectorAll('nav[aria-label="学习页面"] button')].find(button=>button.textContent==='学习进度')!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))
  assert.match(document.querySelector('[aria-label="学习进度"]')?.textContent??'',/跨轮次错因/)
  assert.match(document.querySelector('[aria-label="学习进度"]')?.textContent??'',/审题不清.*2/)
 }finally{await act(async()=>root.unmount());globalThis.fetch=prior;dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})
