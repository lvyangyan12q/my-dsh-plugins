import {SourceConnections} from '../src/study-source-panel.tsx'
import {KaogongStateContext,KaogongViewState} from '../src/view-state.tsx'
import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
test('material mapping only writes after explicit confirmation and does not auto classify',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map();for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true})}
 const old=globalThis.fetch,calls:any[]=[];globalThis.fetch=async(_input,init)=>{if(init?.body)calls.push(JSON.parse(String(init.body)));return Response.json({materials:[{id:'raw',title:'原始讲义',subject:'行测-资料分析',preview:'原文要点',fingerprint:'proof'}],points:[{id:'kg-point-047',subject:'行测-资料分析',knowledgePoint:'增长-增长率'}],mappings:[]})}
 const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!);try{const {MaterialPointPanel}=await import('../src/material-point-panel.tsx');await act(async()=>root.render(<MaterialPointPanel/>));
assert.equal(calls.length,0);const {Simulate}=await import('react-dom/test-utils');const selects=document.querySelectorAll('select');await act(async()=>{selects[0].value='raw';Simulate.change(selects[0])});await act(async()=>{selects[1].value='kg-point-047';Simulate.change(selects[1])});
assert.match(document.body.textContent??'',/原文要点/);
assert.equal(calls.length,0);await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='确认关联')!.click());
assert.deepEqual(calls,[{action:'confirm',materialId:'raw',pointId:'kg-point-047',fingerprint:'proof',confirmed:true}])}finally{await act(async()=>root.unmount());globalThis.fetch=old;dom.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})
test('source authorization and revocation refresh mapping candidates and discard slow old reads',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map();for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true})}
 const prior=globalThis.fetch;let granted=false,slow=false,slowRevoke=false,finishRevoke!:(value:Response)=>void,finish!:(value:Response)=>void;
 const mapping=(active:boolean)=>({materials:active?[{id:'raw',title:'可用讲义',subject:'行测-资料分析',preview:'私有授权原文',fingerprint:'p'}]:[],points:[{id:'kg-point-047',subject:'行测-资料分析',knowledgePoint:'增长率'}],mappings:[]})
 globalThis.fetch=async(input,init)=>{const path=String(input);if(path.includes('material-points')){if(slowRevoke&&!granted)return new Promise<Response>(r=>finishRevoke=r);if(slow&&granted)return new Promise<Response>(r=>finish=r);return Response.json(mapping(granted))}if(path.includes('dashboard'))return Response.json({});const body=JSON.parse(String(init?.body));if(body.action==='source-share')granted=true;if(body.action==='source-revoke')granted=false;return Response.json({libraries:[{profileId:'lib',title:'资料库',viewId:'library'}],connections:granted?[{id:'grant',resourceId:'materials',ownerProfileId:'lib',status:'active',revision:1}]:[]})}
 const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!);try{const{MaterialPointPanel}=await import('../src/material-point-panel.tsx'),{Simulate}=await import('react-dom/test-utils');await act(async()=>root.render(<KaogongStateContext.Provider value={new KaogongViewState('mapping-refresh')}><SourceConnections viewId="view"/><MaterialPointPanel/></KaogongStateContext.Provider>));const click=async(text:string)=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===text)!.click());await click('确认使用资料');
assert.ok([...document.querySelectorAll('option')].some(o=>o.value==='raw'));await act(async()=>{const select=document.querySelector('select')!;select.value='raw';Simulate.change(select)});
assert.match(document.body.textContent??'',/私有授权原文/);slowRevoke=true;await click('撤销资料引用');
assert.doesNotMatch(document.body.textContent??'',/私有授权原文/);
assert.ok(![...document.querySelectorAll('option')].some(o=>o.value==='raw'));assert.ok(finishRevoke);await act(async()=>finishRevoke(Response.json({error:'读取失败'},{status:503})));assert.match(document.querySelector('[role=alert]')?.textContent??'',/读取失败/);slowRevoke=false;slow=true;await click('确认使用资料');
assert.ok(finish);await click('撤销资料引用');await act(async()=>finish(Response.json(mapping(true))));
assert.ok(![...document.querySelectorAll('option')].some(o=>o.value==='raw'));
assert.doesNotMatch(document.body.textContent??'',/私有授权原文/)}finally{await act(async()=>root.unmount());globalThis.fetch=prior;dom.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})



test('switching request owner rejects pending material responses from the previous profile',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map();for(const[k,v]of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true})}
 const {MaterialPointPanel}=await import('../src/material-point-panel.tsx'),{KaogongTransportContext}=await import('../src/view-context.tsx'),{createViewTransport}=await import('../src/client-runtime.ts');let finish!:(value:Response)=>void;
 const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!);
 try{
  const ownerA=createViewTransport({instanceId:'a',viewId:'a'},async()=>new Promise<Response>(r=>finish=r)),ownerB=createViewTransport({instanceId:'b',viewId:'b'},async()=>Response.json({materials:[],points:[],mappings:[]}));
  await act(async()=>root.render(<KaogongTransportContext.Provider value={ownerA}><MaterialPointPanel/></KaogongTransportContext.Provider>));
  await act(async()=>root.render(<KaogongTransportContext.Provider value={ownerB}><MaterialPointPanel/></KaogongTransportContext.Provider>));
  await act(async()=>finish(Response.json({materials:[{id:'old',title:'旧档案资料',preview:'旧档案原文',subject:'行测'}],points:[],mappings:[]})));
  assert.doesNotMatch(document.body.textContent??'',/旧档案/);
  assert.match(document.body.textContent??'',/暂无获准讲义/);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})
