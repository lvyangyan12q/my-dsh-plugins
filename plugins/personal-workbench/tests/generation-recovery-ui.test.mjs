import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {GenerationEditor} from '../src/generation-editor.tsx'

test('browser editor restart resumes the original generation controls and edited requirement without a second start',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),originals=new Map(),calls=[],opened=[];
 for(const [name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const previousFetch=globalThis.fetch,id='97fe079b-7777-4672-a455-dd56a1b78b80';
 globalThis.fetch=async(_url,options)=>{const input=JSON.parse(options.body);calls.push(input);return{ok:true,json:async()=>({job:{id,appId:'reading',status:input.action==='cancel'?'cancelled':'running',sessionId:'existing-native-generation'}})}};
 const props={target:{appId:'reading',version:1,expectedRevision:0},workspaces:['/trusted'],t:k=>k,onDraft:()=>assert.fail('Running generation is not a draft'),onBusy:()=>{},onOpenSession:id=>opened.push(id)};
 const {createRoot}=await import('react-dom/client');let root=createRoot(document.getElementById('root'));
 try{
 await act(async()=>root.render(React.createElement(GenerationEditor,props)));const input=document.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,'Keep my edited generation requirement');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='generationStart').click());assert.equal(calls.filter(row=>row.action==='start').length,1);
 await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(GenerationEditor,{...props,target:{appId:'different-new-editor-target',version:1,expectedRevision:0}})));
 assert.equal(document.querySelector('textarea').value,'Keep my edited generation requirement');assert.match(document.body.textContent,/existing-native-generation/);assert.equal([...document.querySelectorAll('button')].find(button=>button.textContent==='generationCancel').disabled,false);
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='generationOpenSession').click());assert.deepEqual(opened,['existing-native-generation']);
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='generationCancel').click());assert.equal(calls.filter(row=>row.action==='start').length,1);assert.deepEqual(calls.find(row=>row.action==='cancel'),{action:'cancel',id});
 }finally{await act(async()=>root.unmount());dom.window.close();globalThis.fetch=previousFetch;for(const [name,value]of originals){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
})

test('restored unavailable job stops polling with retained native entry; completed recovery delivers one existing draft',async()=>{
 for(const outcome of ['missing','completed']){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),originals=new Map(),calls=[],drafts=[];
 for(const [name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const previousFetch=globalThis.fetch,id='d7aaa982-6369-452c-997b-d2f15a1aa833',record={appId:'reading',revision:1,draft:{schemaVersion:1,appId:'reading',version:1,name:'Recovered draft',description:'',pages:[{id:'home',label:'Home',layout:'stack',modules:[]}],connections:[],roles:[]}};
 let restored=false;
 globalThis.fetch=async(_url,options)=>{const input=JSON.parse(options.body);calls.push(input);if(restored&&outcome==='missing')return{ok:false,json:async()=>({error:'Generation job not found after Host restart'})};return{ok:true,json:async()=>({job:{id,appId:'reading',status:restored?'completed':'running',sessionId:'preserved-native-session',...(restored?{record}:{})}})}};
 const props={target:{appId:'reading',version:1,expectedRevision:0},t:k=>k,onDraft:async row=>drafts.push(row),onBusy:()=>{},onOpenSession:()=>{}};
 const {createRoot}=await import('react-dom/client');let root=createRoot(document.getElementById('root'));
 try{await act(async()=>root.render(React.createElement(GenerationEditor,props)));const input=document.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,'Recover requirement');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='generationStart').click());await act(async()=>root.unmount());restored=true;root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(GenerationEditor,props)));
 assert.equal(calls.filter(row=>row.action==='start').length,1);assert.equal(calls.filter(row=>row.action==='status').length,1);assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='generationOpenSession'));
 if(outcome==='missing'){assert.match(document.querySelector('[role="alert"]').textContent,/job not found/);assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='generationCancel').disabled,true);assert.deepEqual(drafts,[])}else{assert.deepEqual(drafts,[record]);await act(async()=>root.render(React.createElement(GenerationEditor,{...props})));assert.equal(drafts.length,1)}
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,650))});assert.equal(calls.filter(row=>row.action==='status').length,1,'A terminal restore must stop polling');assert.equal(calls.filter(row=>row.action==='start').length,1);
 }finally{await act(async()=>root.unmount());dom.window.close();globalThis.fetch=previousFetch;for(const [name,value]of originals){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}
 }
})
