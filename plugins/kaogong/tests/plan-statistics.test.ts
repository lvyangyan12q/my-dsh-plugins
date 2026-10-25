import assert from 'node:assert/strict'
import {test} from 'node:test'
import {JSDOM} from 'jsdom'
import React,{act} from 'react'

const dashboard=(totalQuestions:number,accuracyRate:number)=>({today:'2026-10-25',examDate:'2027-01-01',daysToExam:68,totalDays:100,pastDays:32,pastDone:0,pastDonePct:0,totalQuestions,totalCorrect:Math.round(totalQuestions*accuracyRate),totalWrong:totalQuestions-Math.round(totalQuestions*accuracyRate),accuracyRate,knowledgeTotal:0,bankTotal:0,todayPlan:{phase:'foundation',items:[]},modules:[],weakPoints:[],recentKnowledge:[]})
const metrics=()=>[...document.querySelectorAll('div')].find(node=>node.textContent==='做题正确率')!.closest('section')!
async function browser(data:ReturnType<typeof dashboard>,run:(context:any)=>Promise<void>){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map<string,PropertyDescriptor|undefined>(),oldFetch=globalThis.fetch
 for(const[key,value]of Object.entries({React,window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 globalThis.fetch=async input=>{const url=String(input);return new Response(JSON.stringify(url.includes('/dashboard')?data:url.includes('/lesson/list')?[]:url.includes('/lesson/current')?null:{entries:[]}))}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!)
 try{await run({root,dom})}finally{await act(async()=>root.unmount());globalThis.fetch=oldFetch;for(const[key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key)}}
}
async function application(root:any){
 const {KaogongApplicationView}=await import('../src/client.tsx')
 const props={application:{id:'kaogong',title:'考公学习',kind:'deep',views:[{id:'page',title:'学习'}]},instance:{id:'statistics-learning',appId:'kaogong',projectId:null,revision:1},view:{id:'statistics-view',instanceId:'statistics-learning',type:'page'}}
 await act(async()=>root.render(React.createElement(KaogongApplicationView,props as never)))
}
test('the deep plan navigation exposes existing ten-question and ninety-percent metrics while classroom stays focused',()=>browser(dashboard(10,.9),async({root,dom})=>{
 await application(root)
 assert.equal(metrics().hidden,true,'the focused classroom must not mix dashboard metrics into teaching')
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='计划与统计')!.click())
 const section=metrics();assert.equal(section.hidden,false);assert.equal(section.closest('[hidden]'),null);assert.equal(dom.window.getComputedStyle(section).display,'grid')
 assert.match(section.textContent!,/90%/);assert.match(section.textContent!,/10 题/);assert.match(section.textContent!,/计划完成/)
}))
test('an empty instance shows its existing zero-count and zero-percent plan metrics',()=>browser(dashboard(0,0),async({root})=>{
 await application(root);await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='计划与统计')!.click())
 const section=metrics();assert.equal(section.hidden,false);assert.match(section.textContent!,/0%/);assert.match(section.textContent!,/0 题/);assert.doesNotMatch(section.textContent!,/NaN|undefined|90%/)
}))
test('the nonfocused standalone classroom retains metrics and its focused counterpart hides them',()=>browser(dashboard(10,.9),async({root})=>{
 const {KaogongView}=await import('../src/kaogong-view.tsx')
 await act(async()=>root.render(React.createElement(KaogongView,{active:true,pageId:'classroom',focusedStudy:false,onOpenTeacher:()=>{}})))
 assert.equal(metrics().hidden,false);assert.match(metrics().textContent!,/90%/)
 await act(async()=>root.render(React.createElement(KaogongView,{active:true,pageId:'classroom',focusedStudy:true,onOpenTeacher:()=>{}})))
 assert.equal(metrics().hidden,true)
}))
