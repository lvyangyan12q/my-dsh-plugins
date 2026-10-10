import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import {KaogongView} from '../src/kaogong-view.tsx'
import {KaogongStateContext,KaogongViewState} from '../src/view-state.tsx'

test('unmatched classroom practice ends preparation and broadens only after an explicit learner gesture',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),originals=new Map(),calls=[];
 for(const [name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const previousFetch=globalThis.fetch,subject='行测-判断推理',point='逻辑判断-原因解释',owner=new KaogongViewState();
 const lesson:any={lesson:{request:{lessonId:'kept-classroom',subject,objective:'解释原因的课堂目标',knowledgePoint:point,requireReflections:false},objectiveId:'objective',notes:'保留学习者总结',materials:[],roundIds:[],completion:null},evidence:[],canConfirm:false,summary:'原课堂摘要'};
 owner.cell('lesson.view',null).set(lesson);owner.cell('lesson.notes','').set(lesson.lesson.notes);owner.cell('dashboard',null).set({today:'2026-10-11',daysToExam:100,pastDonePct:0,pastDone:0,pastDays:1,accuracyRate:0,totalQuestions:0,knowledgeTotal:0,bankTotal:1,todayPlan:{phase:'foundation',items:[]},modules:[],weakPoints:[],recentKnowledge:[]} as any);
 globalThis.fetch=async(url:any,options:any={})=>{const body=JSON.parse(options.body??'{}');calls.push({url,body});assert.equal(url,'/api/kaogong/practice/start');if(body.knowledgePoint)return {ok:false,status:409,text:async()=>JSON.stringify({error:'没有匹配当前科目、考点和难度的可练习题目'})} as any;return{ok:true,text:async()=>JSON.stringify({roundId:'00000000-0000-4000-8000-000000000001',context:body,reason:'本科目练习',totalAvailable:1,returned:1,cycled:false,result:null,reflections:[],questions:[{id:'one',subject,knowledgePoint:'其他考点',difficulty:'easy',stem:'本科目真实题面',options:['A. 第一项','B. 第二项'],source:'题库'}]})} as any};
 function View(){const [page,setPage]=useState('classroom');return <KaogongStateContext.Provider value={owner}><KaogongView embedded active={false} pageId={page} onSelectPage={setPage} onOpenTeacher={async()=>assert.fail('No teaching automatically sent')}/></KaogongStateContext.Provider>}
 const root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(<View/>));const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='课后练习')!;assert.ok(button);await act(async()=>button.click());
 assert.equal(calls.length,1);assert.equal(calls[0].body.knowledgePoint,point);assert.doesNotMatch(document.body.textContent!,/正在准备题目/);assert.match(document.body.textContent!,/没有匹配/);
 const broader=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('解除考点限制并练习本科目'))!;assert.ok(broader);await act(async()=>broader.click());
 assert.equal(calls.length,2);assert.equal(calls[1].body.subject,subject);assert.equal(calls[1].body.knowledgePoint,undefined);assert.match(document.body.textContent!,/本科目真实题面/);assert.equal(lesson.lesson.request.knowledgePoint,point);assert.equal(lesson.lesson.notes,'保留学习者总结');assert.match(document.body.textContent!,/原课堂目标和考点保持不变/);
 }finally{await act(async()=>root.unmount());dom.window.close();globalThis.fetch=previousFetch;for(const [name,value]of originals){if(value)Object.defineProperty(globalThis,name,value);else delete (globalThis as any)[name]}}
})
