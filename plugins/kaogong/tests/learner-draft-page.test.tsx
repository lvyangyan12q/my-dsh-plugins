import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {Simulate} from 'react-dom/test-utils'
import {JSDOM} from 'jsdom'

test('an unsaved classroom goal survives a fresh page owner without creating a lesson and stays in its profile',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true},saved=new Map(Object.keys(values).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const[k,v]of Object.entries(values))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v})
 const original=globalThis.fetch;let writes=0;globalThis.fetch=async()=>{writes++;return new Response('null')};let root=createRoot(document.getElementById('root')!)
 try{const{LessonPanel}=await import('../src/lesson-panel.tsx'),{KaogongViewState,KaogongStateContext}=await import('../src/view-state.tsx');const render=async(id:string)=>act(async()=>root.render(<KaogongStateContext.Provider value={new KaogongViewState(id)}><LessonPanel active={false} onPractice={async()=>{}} onOpenTeacher={async()=>{}}/></KaogongStateContext.Provider>));await render('profile-a');await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="新建课堂"]')!.click());const input=document.querySelector<HTMLInputElement>('[aria-label="学习目标"]')!;await act(async()=>{input.value='保存未提交的学习目标';Simulate.change(input)});await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!);await render('profile-a');assert.equal(document.querySelector<HTMLInputElement>('[aria-label="学习目标"]')?.value,'保存未提交的学习目标');assert.equal(writes,0);await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!);await render('profile-b');assert.equal(document.querySelector('[aria-label="学习目标"]'),null)}finally{await act(async()=>root.unmount());globalThis.fetch=original;dom.window.close();for(const[k,d]of saved)d?Object.defineProperty(globalThis,k,d):Reflect.deleteProperty(globalThis,k)}
})
