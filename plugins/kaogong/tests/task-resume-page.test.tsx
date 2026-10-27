import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Simulate} from 'react-dom/test-utils'
import {JSDOM} from 'jsdom'

test('continuing the same task preserves unsaved answers and notes while another task gets only its own draft',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map(),values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
 for(const[key,value]of Object.entries(values)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})}
 const prior=globalThis.fetch,ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'],roundIds=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'],lessonId='30000000-0000-4000-8000-000000000001'
 const tasks=ids.map((id,i)=>({id,revision:2,subject:'行测-资料分析',title:'任务'+i,kind:i===2?'learn':'practice',phase:'foundation',date:null,status:'in-progress',requirePractice:false,requireReflections:true,summary:'',evidence:null,startedFromRevision:0}))
 const state={revision:3,goal:null,tasks,drafts:[],history:[],externalMocks:[]},rounds=roundIds.map((roundId,i)=>({roundId,context:{subject:'行测-资料分析',title:'任务'+i,limit:10,taskId:ids[i],planRevision:0},questions:[{id:'q',subject:'行测-资料分析',knowledgePoint:'读取',stem:'首项是多少',options:['A. 1','B. 2'],source:'合成题',difficulty:'easy'}],returned:1,totalAvailable:1,result:null,reflections:[],reason:'合成边界',cycled:false}))
 const lesson={lesson:{request:{lessonId,subject:'行测-资料分析',objective:'任务2',requirePractice:false},materials:[],notes:'Host已保存总结',completion:null,roleKey:{subject:'行测-资料分析'},roundIds:[],binding:null},summary:'课堂摘要',evidence:[],canConfirm:false}
 globalThis.fetch=async(input,init)=>{const path=String(input),body=init?.body?JSON.parse(String(init.body)):null;return new Response(JSON.stringify(path.includes('/plan/start')?{state,...(body.id===ids[2]?{lesson}:{round:rounds[ids.indexOf(body.id)]})}:path.includes('/plan')?state:path.includes('/dashboard')?{today:'2026-10-27',todayPlan:{items:[]},weakPoints:[],modules:[],recentKnowledge:[],totalQuestions:0}:path.includes('/history')?{rounds:[]}:null))}
 let root=createRoot(document.getElementById('root')!)
 try{
  const {StudyPlanPanel}=await import('../src/study-plan-panel.tsx'),{KaogongView}=await import('../src/kaogong-view.tsx'),{LessonPanel}=await import('../src/lesson-panel.tsx'),{KaogongStateContext,KaogongViewState}=await import('../src/view-state.tsx')
  let owner=new KaogongViewState('draft-profile');owner.cell('practice',null).set(rounds[0] as any);owner.cell('practiceItem',null).set(rounds[0].context);owner.cell('practiceRestored',false).set(true)
  function Surface(){const[page,setPage]=useState('practice');return <KaogongStateContext.Provider value={owner}><button onClick={()=>setPage('plan')}>返回计划</button><button onClick={()=>setPage('classroom')}>显示课堂</button>{page==='plan'?<StudyPlanPanel onPage={setPage} onOpenTeacher={async()=>{setPage('classroom')}}/>:page==='practice'?<KaogongView active embedded focusedStudy pageId="practice" onOpenTeacher={async()=>{}}/>:<LessonPanel active={false} onPractice={async()=>{}} onOpenTeacher={async()=>{}}/>}</KaogongStateContext.Provider>}
  await act(async()=>root.render(<Surface/>))
  await act(async()=>document.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].click())
  const click=async(text:string,index=0)=>act(async()=>[...document.querySelectorAll('button')].filter(button=>button.textContent===text)[index]!.click())
  await click('返回计划');await click('继续同一任务')
  assert.equal(document.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].checked,true)
  await click('返回计划');await click('继续同一任务',1)
  assert.equal(document.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].checked,false)
  await click('返回计划');await click('继续同一任务')
  assert.equal(document.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].checked,true)
  await act(async()=>owner.cell('lesson.view',null).set(lesson as any))
  await click('显示课堂')
  const notes=document.querySelector<HTMLTextAreaElement>('[aria-label="学习者总结"]')!
  await act(async()=>{notes.value='未保存的学习反思';Simulate.change(notes)})
  await click('返回计划');await click('继续同一任务',2)
  assert.equal(document.querySelector<HTMLTextAreaElement>('[aria-label="学习者总结"]')?.value,'未保存的学习反思')
  const {readLearnerDraft}=await import('../src/learner-draft.ts');assert.equal(readLearnerDraft('draft-profile')?.notesDirty,true)
  await act(async()=>root.unmount());owner=new KaogongViewState('draft-profile');root=createRoot(document.getElementById('root')!)
  await act(async()=>root.render(<Surface/>));await click('返回计划');await click('继续同一任务')
  assert.equal(document.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].checked,true)
  await click('返回计划');await click('继续同一任务',2)
  assert.equal(document.querySelector<HTMLTextAreaElement>('[aria-label="学习者总结"]')?.value,'未保存的学习反思')
 }finally{await act(async()=>root.unmount());globalThis.fetch=prior;dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})
