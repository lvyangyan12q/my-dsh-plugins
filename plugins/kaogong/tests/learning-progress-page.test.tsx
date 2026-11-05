import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
test('progress separates coverage, scored blanks, recall activity and self reports; adjustment cancels and rejects stale consent',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map<string,PropertyDescriptor|undefined>()
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const prior=globalThis.fetch;let confirms=0,previews=0
 const goal={examDate:'2027-03-01',dailyModules:2,subjects:[{name:'申论',weight:1}]}
 globalThis.fetch=async(input,init)=>{const path=String(input),body=init?.body?JSON.parse(String(init.body)):null;
 if(path.includes('/plan')){if(body?.action==='preview'){previews++;return Response.json({id:'draft',baseRevision:1,diff:[{id:'future',before:{title:'申论训练',date:'2026-12-01'},after:{title:'申论训练',date:null}}],overflow:['future']})}if(body?.action==='confirm'){confirms++;return Response.json({error:'计划版本已变化，请重新预览'},{status:409})}return Response.json({revision:1,goal,tasks:[],externalMocks:[{id:'mock',title:'外部考试',date:'2026-11-05',score:100,maximum:100}],history:[]})}
 if(path.includes('/dashboard'))return Response.json({unavailableSources:['question-bank'],practiceStatistics:{submittedCount:10,submittedRoundCount:1,answeredCount:5,unansweredCount:5,uniqueQuestionCount:10,correctCount:3,incorrectCount:2,accuracyRate:.3},weakPoints:[{subject:'申论',knowledgePoint:'材料理解',wrongCount:2}]})
 if(path.includes('/route'))return Response.json({coverage:{learned:1,total:73},points:[{id:'p',subject:'申论',knowledgePoint:'材料理解',status:'learned'}]})
 if(path.includes('/recall'))return Response.json({items:[{pointId:'p',dueAt:'2027-01-01',history:[{cycleId:'c',confirmedAt:'2026-11-05',rating:'forgotten',recall:'记录'}]}]})
 return Response.json({occurrences:[]})}
 const root=createRoot(document.getElementById('root')!)
 try{const {LearningProgressPanel}=await import('../src/learning-progress-panel.tsx');await act(async()=>root.render(<LearningProgressPanel/>));const text=()=>document.body.textContent??'';assert.match(text(),/1 \/ 73/);assert.match(text(),/30%/);assert.match(text(),/题库授权已撤销/);assert.match(text(),/未答5/);assert.match(text(),/已确认回忆 1 次/);assert.match(text(),/外部考试.*100.*100/);const click=async(label:string)=>act(async()=>{[...document.querySelectorAll('button')].find(b=>b.textContent===label)!.click()});await click('预览本科目未来安排');assert.equal(previews,1);assert.equal(confirms,0);assert.match(text(),/未排入 1 项/);await click('取消预览');assert.equal(confirms,0);await click('预览本科目未来安排');await click('确认未来调整');assert.equal(confirms,1);assert.match(text(),/计划版本已变化/)}finally{await act(async()=>root.unmount());globalThis.fetch=prior;dom.window.close();for(const [key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})
