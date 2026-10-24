import assert from 'node:assert/strict'
import {test} from 'node:test'
import {JSDOM} from 'jsdom'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'

test('knowledge images render exact record selectors and bound view while unsafe network images stay unavailable',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
 const saved=new Map<string,PropertyDescriptor|undefined>()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,DOMParser:dom.window.DOMParser,HTMLImageElement:dom.window.HTMLImageElement,React,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const root=createRoot(document.getElementById('root')!)
 try{
 const {DocumentMarkdown}=await import('../src/document-markdown.tsx')
 const {KaogongTransportContext}=await import('../src/view-context.tsx')
 const {createViewTransport}=await import('../src/client-runtime.ts')
 const content='![a](images/same.png)\n![b](images/same.png)\n<img src="/api/kaogong/document-image?id=job&amp;asset=x.png" onerror="alert(1)"><img src="https://evil.invalid/x"><img src="//evil.invalid/x"><img src="data:image/png;base64,aaa"><script>alert(1)</script>'
 await act(async()=>root.render(React.createElement(KaogongTransportContext.Provider,{value:createViewTransport({instanceId:'history-a',viewId:'view-a'})},React.createElement(DocumentMarkdown,{content,imageContext:{entryId:'knowledge-a'}} as never))))
 const images=[...document.querySelectorAll('img')]
 assert.equal(images.length,3)
 assert.deepEqual(images.map(img=>new URL(img.src).searchParams.get('reference')),['images/same.png','images/same.png','/api/kaogong/document-image?id=job&asset=x.png'])
 for(const img of images){const url=new URL(img.src);assert.equal(url.pathname,'/api/kaogong/legacy-image');assert.equal(url.searchParams.get('entryId'),'knowledge-a');assert.equal(url.searchParams.get('viewId'),'view-a');assert.equal(img.hasAttribute('onerror'),false)}
 assert.equal(document.querySelector('script'),null)
 assert.match(document.body.textContent!,/图片引用不可用/)
 const {KaogongView}=await import('../src/kaogong-view.tsx')
 const {KaogongStateContext,KaogongViewState}=await import('../src/view-state.tsx')
 const state=new KaogongViewState('history-a')
 state.cell('loading',false);state.cell('practiceRestored',true)
 state.cell('dashboard',{today:'2026-10-24',examDate:'2027-01-01',daysToExam:50,totalDays:100,pastDays:50,pastDone:0,pastDonePct:0,totalQuestions:0,totalCorrect:0,totalWrong:0,accuracyRate:0,bankTotal:1,knowledgeTotal:1,todayPlan:{phase:'foundation',items:[]},modules:[],weakPoints:[],recentKnowledge:[]})
 state.cell('practiceItem',{subject:'行测-资料分析',title:'原题',limit:1});state.cell('practice',{roundId:'round-a',context:{subject:'行测-资料分析',title:'原题',limit:1},reason:'test',totalAvailable:1,returned:1,cycled:false,questions:[{id:'q-original',subject:'行测-资料分析',knowledgePoint:'统计',stem:'原题![图](题目_images/source.png)',options:['A. ![选项](题目_images/option.png)','B. 原文'],difficulty:'normal',source:'原题'}],result:null,reflections:[]})
 await act(async()=>root.render(React.createElement(KaogongTransportContext.Provider,{value:createViewTransport({instanceId:'history-a',viewId:'practice-view'})},React.createElement(KaogongStateContext.Provider,{value:state},React.createElement(KaogongView,{active:false,focusedStudy:true,pageId:'practice',onOpenTeacher:()=>{}})))))
 const practiceImages=[...document.querySelectorAll('img')]
 assert.equal(practiceImages.length,2,'actual practice stems and options both retain their record selectors')
 for(const img of practiceImages){const url=new URL(img.src);assert.equal(url.searchParams.get('questionId'),'q-original');assert.equal(url.searchParams.get('viewId'),'practice-view')}
 assert.equal(document.body.textContent!.includes('正确答案'),false,'unsubmitted question does not expose answer')
 }finally{await act(async()=>root.unmount());for(const[key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key)}}
})

test('question image rendering preserves exact backslashes, encoded targets and bundled verified images',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
 const saved=new Map<string,PropertyDescriptor|undefined>()
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,DOMParser:dom.window.DOMParser,HTMLImageElement:dom.window.HTMLImageElement,React,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const root=createRoot(document.getElementById('root')!)
 try{
 const {DocumentMarkdown}=await import('../src/document-markdown.tsx')
 const {KaogongTransportContext}=await import('../src/view-context.tsx')
 const {createViewTransport}=await import('../src/client-runtime.ts')
 const refs=['D:\\原题\\题目_images\\a%20b.png','题目_images/old.png','/api/kaogong/document-image?id=j&asset=a%2520b.png']
 const content=refs.map((src,i)=>`![图${i}](${src})`).join('\n')+'\n![覆盖图](题目_images/verified/资料600-2023-hebei-retail-growth.png)'
 await act(async()=>root.render(React.createElement(KaogongTransportContext.Provider,{value:createViewTransport({instanceId:'study-b',viewId:'view-b'})},React.createElement(DocumentMarkdown,{content,imageContext:{questionId:'question-a'}} as never))))
 const images=[...document.querySelectorAll('img')]
 assert.equal(images.length,4)
 assert.deepEqual(images.slice(0,3).map(img=>new URL(img.src).searchParams.get('reference')),refs)
 for(const img of images.slice(0,3)){const url=new URL(img.src);assert.equal(url.pathname,'/api/kaogong/legacy-question-image');assert.equal(url.searchParams.get('questionId'),'question-a');assert.equal(url.searchParams.get('viewId'),'view-b')}
 assert.equal(new URL(images[3].src).pathname,'/api/kaogong/material-image')
 assert.equal(new URL(images[3].src).searchParams.get('viewId'),'view-b')
 }finally{await act(async()=>root.unmount());for(const[key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key)}}
})

