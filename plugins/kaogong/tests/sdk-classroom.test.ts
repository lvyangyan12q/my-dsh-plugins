import assert from 'node:assert/strict'
import {test} from 'node:test'
import {JSDOM} from 'jsdom'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'

test('SDK classroom keeps learning mounted and opens the original native teacher without rendering another composer',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
  const globals={React,window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
  const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
  const oldFetch=globalThis.fetch
  const requests:string[]=[],opened:unknown[]=[]
  const data={today:'2026-10-24',daysToExam:100,pastDonePct:0,pastDone:0,pastDays:1,accuracyRate:0,totalQuestions:0,knowledgeTotal:0,bankTotal:0,todayPlan:{phase:'foundation',items:[]},modules:[],weakPoints:[],recentKnowledge:[]}
  globalThis.fetch=async input=>{const url=String(input);requests.push(url);return new Response(JSON.stringify(url.includes('/dashboard')?data:url.includes('/lesson/list')?[]:url.includes('/lesson/current')?null:{entries:[]}))}
  const root=createRoot(document.getElementById('root')!)
  try{
    const {KaogongApplicationView}=await import('../src/client.tsx')
    const roles={ensure:async(id:string)=>({phase:'ready',sessionId:'original-'+id,revision:2}),open:async(...value:unknown[])=>{opened.push(value)}}
    const props={application:{id:'kaogong',title:'考公学习',kind:'deep',version:'candidate',views:[{id:'page',title:'学习'}]},instance:{id:'learning-a',appId:'kaogong',projectId:null,revision:1},view:{id:'view-a',instanceId:'learning-a',type:'page'},roles,tasks:{prepare:async()=>({id:'prepared'})}}
    await act(async()=>root.render(React.createElement(KaogongApplicationView,props as never)))
    const content=document.querySelector('[aria-label="考公学习内容"]')
    const teacher=[...document.querySelectorAll('button')].find(button=>button.textContent?.includes('任课老师'))!
    assert.ok(teacher)
    await act(async()=>teacher.click())
    assert.deepEqual(opened,[['teacher','original-teacher',2]])
    assert.equal(document.querySelector('[aria-label="考公学习内容"]'),content)
    assert.equal(document.querySelectorAll('[contenteditable="true"]').length,0,'only native Host owns its composer')
    assert.equal(document.querySelector('aside[aria-label="角色对话"]'),null)
    assert.ok(requests.length>0)
    assert.ok(requests.every(url=>new URL(url,'http://localhost').searchParams.get('viewId')==='view-a'))
  }finally{
    await act(async()=>root.unmount());dom.window.close();globalThis.fetch=oldFetch
    for(const [key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key)}
  }
})

test('owned teaching prepares only persistent references and never calls browser lifecycle functions',async()=>{
  const {prepareLearningTask}=await import('../src/sdk-classroom.tsx')
  const calls:unknown[]=[]
  const roles={ensure:async(id:string)=>({phase:'ready',sessionId:'same-'+id,revision:3}),open:async(...args:unknown[])=>{calls.push(['open',...args])}}
  const tasks={prepare:async(input:unknown)=>{calls.push(['ordinary',input])},prepareOwned:async(input:unknown)=>{calls.push(['owned',input]);return {id:'prepared'}}}
  await prepareLearningTask({instanceId:'learning-a',roles,tasks} as never,{kind:'lesson',context:{subject:'行测-资料分析',title:'学习目标',limit:5},lessonEvidence:{id:'lesson-a',title:'课堂',source:'browser',content:'untrusted'}} as never,null)
  assert.deepEqual(calls,[['open','teacher.data-analysis','same-teacher.data-analysis',3],['owned',{roleId:'teacher.data-analysis',kind:'lesson',payload:{lessonId:'lesson-a'}}]])
  calls.length=0
  await assert.rejects(()=>prepareLearningTask({instanceId:'learning-a',roles,tasks:{prepare:tasks.prepare}} as never,{kind:'review',context:{},result:{roundId:'round-a'}} as never,null),/接口/)
  assert.deepEqual(calls,[],'missing owned lifecycle fails before creating or opening a Session')
  await prepareLearningTask({instanceId:'learning-a',roles,tasks} as never,{kind:'review',context:{},result:{roundId:'round-a',correctCount:999}} as never,null)
  assert.deepEqual(calls.at(-1),['owned',{roleId:'counselor',kind:'review',payload:{roundId:'round-a'}}])
})
