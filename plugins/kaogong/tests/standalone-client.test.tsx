import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'

test('first opening is read-only and a confirmed profile enters the six-page overview',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
  const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
  const saved=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
  for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
  const priorFetch=globalThis.fetch,calls:unknown[]=[]
  const profile={id:'study-a',kind:'learner',title:'我的备考档案',revision:1},view={id:'view-a',profileId:'study-a'}
  globalThis.fetch=async(input,options)=>{
    const body=options?.body?JSON.parse(String(options.body)):null;calls.push(body)
    return new Response(JSON.stringify(String(input).includes('/dashboard')?{today:'2026-10-26',modules:[],todayPlan:{items:[]},weakPoints:[],totalQuestions:0,totalCorrect:0,accuracyRate:0,bankTotal:0,knowledgeTotal:0}:body?.action==='create'?{profile,view}:body?.action==='task-list'?[]:{profiles:[],views:[]}))
  }
  const root=createRoot(document.getElementById('root')!)
  try{
    const {StudyDashboard}=await import('../src/client.tsx')
    await act(async()=>root.render(<StudyDashboard/>))
    assert.match(document.body.textContent??'',/创建备考档案/)
    assert.equal(calls.filter(row=>row&&typeof row==='object'&&'action'in row&&row.action==='create').length,0)
    await act(async()=>{[...document.querySelectorAll('button')].find(button=>button.textContent==='确认创建备考档案')!.click()})
    for(const label of ['学习总览','学习计划','练习训练','错题与复习','学习进度','资料库'])assert.ok([...document.querySelectorAll('nav[aria-label="学习页面"] button')].some(button=>button.textContent===label),label)
    assert.match(document.body.textContent??'',/考试目标待设置/)
    assert.equal(calls.filter(row=>row&&typeof row==='object'&&'action'in row&&row.action==='create').length,1)
  }finally{
    await act(async()=>root.unmount());globalThis.fetch=priorFetch;dom.window.close()
    for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):Reflect.deleteProperty(globalThis,key)
  }
})

test('a restored Native learning tab requires the Host to confirm the exact current Session binding',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
  const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
  const saved=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
  for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
  const prior=globalThis.fetch,requests:unknown[]=[]
  globalThis.fetch=async(input,options)=>{if(String(input).includes('/dashboard'))return new Response(JSON.stringify({modules:[],todayPlan:{items:[]},weakPoints:[],totalQuestions:0}));if(String(input).includes('/lesson/list'))return new Response('[]');if(String(input).includes('/lesson/current'))return new Response('null');const body=options?.body?JSON.parse(String(options.body)):null;requests.push(body);return body?.action==='session-context'?new Response(JSON.stringify({error:'原角色绑定已变化'}),{status:409}):new Response(JSON.stringify({profiles:[{id:'study-a',kind:'learner',title:'保留档案',revision:1}],views:[{id:'view-a',profileId:'study-a'}]}))}
  const controller=new AbortController(),root=createRoot(document.getElementById('root')!)
  try{
    const {StudyLearningTab}=await import('../src/client.tsx')
    const props={sessionId:'native-original',useTabInfo:()=>({tab:{signal:controller.signal,navigation:{params:{sessionId:'native-original',profileId:'study-a',viewId:'view-a'}}}})}
    await act(async()=>root.render(<StudyLearningTab {...props as never}/>))
    assert.match(document.body.textContent??'',/原角色绑定已变化/)
    assert.deepEqual(requests,[{action:'session-context',viewId:'view-a',sessionId:'native-original'}])
  }finally{await act(async()=>root.unmount());globalThis.fetch=prior;dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})
