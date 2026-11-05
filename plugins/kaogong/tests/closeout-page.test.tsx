import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {Simulate} from 'react-dom/test-utils'
import {JSDOM} from 'jsdom'

test('classroom closeout choices survive a fresh owner and pending completion stays retryable',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
 const saved=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 for(const[key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
 const original=globalThis.fetch;let returned=0,writes=0,operation:any=null
 const lesson=()=>({lesson:{request:{lessonId:'lesson-a',subject:'申论',objective:'材料理解',knowledgePointId:'point-a',requirePractice:false},roundIds:[],materials:[],notes:'学习总结',completion:operation?{confirmedAt:'2026-11-05'}:null,revision:operation?1:0},evidence:[],canConfirm:true,summary:'摘要'})
 globalThis.fetch=async(input,init)=>{
  const path=String(input)
  if(path.includes('/api/kaogong/plan'))return Response.json({tasks:[],revision:0,goal:null});if(path.endsWith('/list'))return new Response('[]')
  if(path.endsWith('/closeout')){writes++;const body=JSON.parse(String(init?.body));operation={input:body,status:writes===1?'pending':'complete',lessonSaved:true,planSaved:true,recallSaved:writes>1,error:writes===1?'入队暂时失败':undefined};return Response.json({...lesson(),operation})}
  if(path.endsWith('/closeout-preview'))return Response.json({...lesson(),operation,candidates:[]})
  return Response.json(lesson())
 }
 let root=createRoot(document.getElementById('root')!)
 try {
  const {LessonPanel}=await import('../src/lesson-panel.tsx'),{KaogongStateContext,KaogongViewState}=await import('../src/view-state.tsx')
  const mount=async(profile='profile-a')=>act(async()=>root.render(<KaogongStateContext.Provider value={new KaogongViewState(profile)}><LessonPanel active onReturnToday={()=>{returned++}} onOpenTeacher={async()=>{}} onPractice={async()=>{}}/></KaogongStateContext.Provider>))
  await mount();const check=()=>[...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
  await act(async()=>check()[0].click());assert.equal(writes,0)
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!);await mount()
  assert.equal(check()[0].checked,true)
  await act(async()=>check()[1].click())
  await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='确认完成并保存选择')!.click())
  assert.match(document.body.textContent??'',/入队暂时失败/)
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!);await mount()
  await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='重试未完成步骤')!.click())
  assert.equal(writes,2);assert.match(document.body.textContent??'',/本次学习已保存/)
  await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='返回今日，选择下一项')!.click());assert.equal(returned,1)
 } finally {await act(async()=>root.unmount());globalThis.fetch=original;dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})
