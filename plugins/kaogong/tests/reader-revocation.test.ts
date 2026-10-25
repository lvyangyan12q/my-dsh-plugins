import assert from 'node:assert/strict'
import {test} from 'node:test'
import {JSDOM} from 'jsdom'
import React,{act} from 'react'

const material={id:'raw',title:'共享原题资料',subject:'行测-资料分析',kind:'讲义',source:'synthetic',content:'资料正文 ![图表](images/chart.png)'}
const wait=()=>new Promise(resolve=>setTimeout(resolve,320))
async function browser(run:(context:any)=>Promise<void>){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map<string,PropertyDescriptor|undefined>()
 for(const [key,value]of Object.entries({React,window:dom.window,document:dom.window.document,DOMParser:dom.window.DOMParser,HTMLImageElement:dom.window.HTMLImageElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!)
 try{const {StandaloneKnowledgeLibrary}=await import('../src/standalone-knowledge-reader.tsx'),{KaogongStateContext,KaogongPresentationContext,KaogongViewState}=await import('../src/view-state.tsx'),{KaogongTransportContext}=await import('../src/view-context.tsx'),{createViewTransport}=await import('../src/client-runtime.ts')
  const state=new KaogongViewState('learning-one'),presentation=new KaogongViewState('learning-one','reader-one')
  const renderContent=async(content:React.ReactNode,send:typeof fetch)=>{const transport=createViewTransport({instanceId:'learning-one',viewId:'reader-one'},send);await act(async()=>{root.render(React.createElement(KaogongTransportContext.Provider,{value:transport},React.createElement(KaogongStateContext.Provider,{value:state},React.createElement(KaogongPresentationContext.Provider,{value:presentation},content))))});await act(async()=>wait())}
  const render=(send:typeof fetch,active=true)=>renderContent(React.createElement(StandaloneKnowledgeLibrary,{active}),send)
  await run({dom,root,state,presentation,render,renderContent})
 }finally{await act(async()=>root.unmount());for(const[key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key)}}
}

test('403 revalidation discards retained material projections and images while lesson notes and summaries remain owned',()=>browser(async({state,presentation,render})=>{
 presentation.cell('reader.entries',[]).set([material]);presentation.cell('reader.selected','').set(material.id);presentation.cell('reader.entry',null).set(material)
 state.cell('lesson.notes','').set('保留课堂草稿');state.cell('teacherHandoff',null).set({prompt:'保留老师交接',copied:false})
 const summary={totalQuestions:1,totalCorrect:1,totalWrong:0,accuracyRate:1,weakPoints:[],suggestions:['保留总结草稿']};state.cell('moduleSummary',null).set(summary)
 const requests:string[]=[]
 await render(async(input:any)=>{requests.push(String(input));return new Response(JSON.stringify({error:'共享已撤销'}),{status:403})})
 assert.equal(document.querySelector('img'),null);assert.equal(document.querySelector('article'),null);assert.doesNotMatch(document.body.textContent!,/共享原题资料|资料正文|1 条资料/)
 assert.match(document.body.textContent!,/资料引用.*撤销|未.*授权/)
 assert.deepEqual(presentation.cell('reader.entries',[]).value,[]);assert.equal(presentation.cell('reader.selected','').value,'');assert.equal(presentation.cell('reader.entry',null).value,null)
 assert.equal(state.cell('lesson.notes','').value,'保留课堂草稿');assert.equal(state.cell('teacherHandoff',null).value?.prompt,'保留老师交接')
 assert.deepEqual(state.cell('moduleSummary',null).value,summary)
 assert.ok(requests.length>0);assert.ok(requests.every(url=>url.includes('/knowledge')))
}))

test('a detail response that ignores abort cannot restore material after the refreshed list is refused',()=>browser(async({presentation,render})=>{
 let denied=false,release!:(response:Response)=>void
 const pending=new Promise<Response>(resolve=>{release=resolve})
 const send:typeof fetch=async(input:any)=>{const url=new URL(String(input),'http://localhost');if(url.searchParams.has('id'))return pending;return denied?new Response('{}',{status:403}):new Response(JSON.stringify({entries:[material]}))}
 await render(send)
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent===material.title)!.click())
 denied=true
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='刷新资料')!.click())
 await act(async()=>wait());await act(async()=>release(new Response(JSON.stringify(material))))
 assert.equal(document.querySelector('img'),null);assert.equal(presentation.cell('reader.entry',null).value,null);assert.equal(presentation.cell('reader.selected','').value,'')
 assert.match(document.body.textContent!,/撤销|授权/)
}))

test('the existing application Refresh revalidates its reader without deleting lesson and summary drafts',()=>browser(async({state,presentation,renderContent})=>{
 const {KaogongView}=await import('../src/kaogong-view.tsx')
 state.cell('practiceRestored',false).set(true);state.cell('lesson.notes','').set('课堂笔记保留')
 let denied=false
 const dashboard={today:'2026-10-25',daysToExam:100,pastDonePct:0,pastDone:0,pastDays:1,accuracyRate:0,totalQuestions:0,knowledgeTotal:1,bankTotal:1,todayPlan:{phase:'foundation',items:[]},modules:[],weakPoints:[],recentKnowledge:[]}
 const send:typeof fetch=async(input:any)=>{const url=new URL(String(input),'http://localhost');return url.pathname.endsWith('/dashboard')?new Response(JSON.stringify(dashboard)):url.pathname.endsWith('/knowledge')?(denied?new Response('{}',{status:403}):new Response(JSON.stringify(url.searchParams.has('id')?material:{entries:[material]}))):new Response('null')}
 await renderContent(React.createElement(KaogongView,{active:true,focusedStudy:true,pageId:'materials'}),send)
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent===material.title)!.click());assert.ok(document.querySelector('img'))
 denied=true
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='刷新')!.click());await act(async()=>wait())
 assert.equal(document.querySelector('img'),null);assert.equal(presentation.cell('reader.entry',null).value,null);assert.equal(state.cell('lesson.notes','').value,'课堂笔记保留')
 assert.match(document.body.textContent!,/撤销|授权/)
}))

test('explicit material refresh clears the displayed body immediately and cannot restore it after denial or remount',()=>browser(async({root,presentation,render})=>{
 let denied=false;const requests:string[]=[]
 const send:typeof fetch=async(input:any)=>{const url=new URL(String(input),'http://localhost');requests.push(url.pathname);return denied?new Response(JSON.stringify({error:'共享已撤销'}),{status:403}):new Response(JSON.stringify(url.searchParams.has('id')?material:{entries:[material]}))}
 await render(send)
 const open=[...document.querySelectorAll('button')].find(button=>button.textContent===material.title)!
 assert.ok(open);await act(async()=>open.click());assert.ok(document.querySelector('img'))
 denied=true
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='刷新资料')!.click())
 assert.equal(document.querySelector('img'),null);assert.equal(presentation.cell('reader.entry',null).value,null)
 await act(async()=>wait());assert.match(document.body.textContent!,/撤销|授权/)
 await act(async()=>root.render(null));await render(send)
 assert.equal(document.querySelector('img'),null);assert.doesNotMatch(document.body.textContent!,/共享原题资料|资料正文/)
 assert.ok(requests.every(url=>url==='/api/kaogong/knowledge'))
}))
