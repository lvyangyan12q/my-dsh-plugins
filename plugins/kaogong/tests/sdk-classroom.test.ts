import assert from 'node:assert/strict'
import {test} from 'node:test'
import {JSDOM} from 'jsdom'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'

function environment(markup='<div id="root"></div>'){
  const dom=new JSDOM(markup,{url:'http://localhost'})
  const globals={React,window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
  const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
  return {dom,restore(){for(const [key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key)}dom.window.close()}}
}

const dashboard={today:'2026-10-24',daysToExam:100,pastDonePct:0,pastDone:0,pastDays:1,accuracyRate:0,totalQuestions:0,knowledgeTotal:0,bankTotal:0,todayPlan:{phase:'foundation',items:[]},modules:[],weakPoints:[],recentKnowledge:[]}

test('standalone classroom keeps learning mounted without a role configurator or a second composer',async()=>{
  const {dom,restore}=environment()
  const oldFetch=globalThis.fetch,requests:string[]=[]
  globalThis.fetch=async input=>{const url=String(input);requests.push(url);return new Response(JSON.stringify(url.includes('/dashboard')?dashboard:url.includes('/lesson/list')?[]:url.includes('/lesson/current')?null:{entries:[]}))}
  const root=createRoot(document.getElementById('root')!)
  try{
    const {KaogongApplicationView}=await import('../src/client.tsx')
    const opened:unknown[]=[]
    const roles={ensure:async(id:string)=>({phase:'ready',sessionId:'original-'+id,revision:2}),open:async(...value:unknown[])=>{opened.push(value)}}
    const props={profile:{id:'learning-a',kind:'learner',title:'备考',revision:1},view:{id:'view-a',profileId:'learning-a'},roles,tasks:{prepare:async()=>({id:'prepared'})}}
    await act(async()=>root.render(React.createElement(KaogongApplicationView,props as never)))
    const content=document.querySelector('[aria-label="考公学习内容"]')
    assert.ok(content)
    assert.equal(document.querySelector('[aria-label="学习角色"]'),null,'不再有角色选择')
    assert.equal(document.querySelector('[aria-label="教师科目"]'),null,'不再有教师科目下拉')
    assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent?.includes('任课老师')),false)
    assert.doesNotMatch(document.body.textContent??'',/老师与角色设置|新建课堂|选择课堂/)
    assert.equal(document.querySelector('[aria-label="考公学习内容"]'),content)
    assert.equal(document.querySelectorAll('[contenteditable="true"]').length,0,'only native Host owns its composer')
    assert.equal(document.querySelector('aside[aria-label="角色对话"]'),null)
    assert.deepEqual(opened,[],'页面挂载不再替学习者打开角色会话')
    assert.ok(requests.length>0)
    assert.ok(requests.every(url=>new URL(url,'http://localhost').searchParams.get('viewId')==='view-a'))
  }finally{
    await act(async()=>root.unmount());globalThis.fetch=oldFetch;restore()
  }
})

test('owned teaching prepares only persistent references and never calls browser lifecycle functions',async()=>{
  const {prepareLearningTask}=await import('../src/sdk-classroom.tsx')
  const calls:unknown[]=[]
  const roles={ensure:async(id:string)=>({phase:'ready',sessionId:'same-'+id,revision:3}),open:async(...args:unknown[])=>{calls.push(['open',...args])}}
  const tasks={prepare:async(input:unknown)=>{calls.push(['ordinary',input])},prepareOwned:async(input:unknown)=>{calls.push(['owned',input]);return {id:'prepared'}}}
  await prepareLearningTask({instanceId:'learning-a',roles,tasks} as never,{kind:'lesson',context:{subject:'行测-资料分析',title:'学习目标',limit:5},lessonEvidence:{id:'lesson-a',title:'课堂',source:'browser',content:'untrusted'}} as never,null)
  assert.deepEqual(calls,[['owned',{roleId:'teacher.data-analysis',kind:'lesson',payload:{lessonId:'lesson-a'}}],['open','teacher.data-analysis','same-teacher.data-analysis',3]])
  calls.length=0
  await assert.rejects(()=>prepareLearningTask({instanceId:'learning-a',roles,tasks:{prepare:tasks.prepare}} as never,{kind:'review',context:{},result:{roundId:'round-a'}} as never,null),/接口/)
  assert.deepEqual(calls,[],'missing owned lifecycle fails before creating or opening a Session')
  await prepareLearningTask({instanceId:'learning-a',roles,tasks} as never,{kind:'review',context:{},result:{roundId:'round-a',correctCount:999}} as never,null)
  assert.deepEqual(calls[0],['owned',{roleId:'counselor',kind:'review',payload:{roundId:'round-a'}}])
})

test('owned lesson opens its task Session, while a review keeps the counselor Session',async()=>{
  const {prepareLearningTask}=await import('../src/sdk-classroom.tsx')
  const opened:unknown[]=[],taskOpened:string[]=[]
  const roles={ensure:async(id:string)=>({phase:'ready',sessionId:'role-'+id,revision:3}),open:async(...args:unknown[])=>{opened.push(args)}}
  const tasks={
    prepare:async()=>({}),
    prepareOwned:async()=>({id:'prepared',sessionId:'task-session-a',taskSession:{taskId:'task-a',lessonId:'lesson-a',roleId:'teacher.data-analysis',revision:2}}),
    open:async(taskId:string)=>{taskOpened.push(taskId)},
  }
  await prepareLearningTask({instanceId:'learning-a',roles,tasks} as never,{kind:'lesson',context:{subject:'行测-资料分析',title:'学习目标',limit:5},lessonEvidence:{id:'lesson-a',title:'课堂',source:'browser',content:'untrusted'}} as never,null)
  assert.deepEqual(taskOpened,['task-a'],'准备课堂任务后打开该任务自己的会话')
  assert.deepEqual(opened,[],'不能把角色会话当作任务会话打开')
  await prepareLearningTask({instanceId:'learning-a',roles,tasks:{...tasks,prepareOwned:async()=>({id:'review',sessionId:'role-counselor'})}} as never,{kind:'review',context:{},result:{roundId:'round-a'}} as never,null)
  assert.deepEqual(opened,[['counselor','role-counselor',3]],'讲评仍使用辅导员角色会话')
})

test('historical counselor view stays readable without becoming a role picker',async()=>{
  const {dom,restore}=environment()
  const oldFetch=globalThis.fetch
  globalThis.fetch=async input=>new Response(JSON.stringify(String(input).includes('/dashboard')?dashboard:String(input).includes('/lesson/current')?null:{entries:[]}))
  const root=createRoot(document.getElementById('root')!)
  try{
    const{ScopedStudyView,KaogongViewStatePool}=await import('../src/client.tsx')
    const pool=new KaogongViewStatePool(),opened:unknown[]=[]
    const roles={read:async()=>null,ensure:async(id:string)=>({phase:'ready' as const,sessionId:'original-'+id,revision:2}),open:async(...args:unknown[])=>{opened.push(args)}}
    await act(async()=>root.render(React.createElement(ScopedStudyView,{profile:{id:'history-profile',kind:'learner',title:'备考',revision:1},view:{id:'view-history',profileId:'history-profile'},roleId:'counselor',sessionId:'native-counselor',panel:true,roles,pool} as never)))
    assert.match(document.body.textContent??'',/历史辅导员会话/)
    assert.equal(document.querySelector('[aria-label="学习角色"]'),null)
    assert.equal(document.querySelector('[aria-label="教师科目"]'),null)
    assert.equal([...document.querySelectorAll('button')].some(button=>['任课老师','班主任','辅导员'].includes(button.textContent??'')),false)
    assert.deepEqual(opened,[],'历史会话只读取，不重新打开角色或创建替代会话')
    pool.dispose()
  }finally{await act(async()=>root.unmount());globalThis.fetch=oldFetch;restore()}
})
