import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
const windows:JSDOM[]=[]
after(()=>{for(const dom of windows)dom.window.close()})
test('recall center lets the learner explicitly enroll a named knowledge point',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 windows.push(dom)
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const old=globalThis.fetch,commands:any[]=[]
 globalThis.fetch=async(input,init)=>{if(init?.body)commands.push(JSON.parse(String(init.body)));return new Response(JSON.stringify(String(input).includes('/route')?{points:[{id:'p1',subject:'科目',knowledgePoint:'知识点'}]}:{items:[]}))}
 const root=(await import('react-dom/client')).createRoot(document.getElementById('root')!)
 try{const {RecallPanel}=await import('../src/recall-panel.tsx');await act(async()=>root.render(<RecallPanel/>));assert.match(document.body.textContent??'',/知识点主动回忆/);assert.equal(commands.length,0);await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='确认加入回忆队列')!.click());assert.deepEqual(commands[0],{action:'enroll',pointId:'p1',confirmed:true})}
 finally{await act(async()=>root.unmount());globalThis.fetch=old;for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})

test('recall answer draft returns after a fresh root and stays private to the profile',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 windows.push(dom)
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const {createRoot}=await import('react-dom/client'),{RecallPanel}=await import('../src/recall-panel.tsx'),{KaogongTransportContext}=await import('../src/view-context.tsx');let root=createRoot(document.getElementById('root')!)
 const transport=(instanceId:string)=>({instanceId,url:(s:string)=>s,fetch:async(s:string)=>new Response(JSON.stringify(s.includes('/route')?{points:[{id:'p1',subject:'科目',knowledgePoint:'点'}]}:{items:[{pointId:'p1',cycleId:'cycle',dueAt:'2099-01-01',history:[]}]}))})
 const render=async(profile:string)=>act(async()=>root.render(<KaogongTransportContext.Provider value={transport(profile) as any}><RecallPanel/></KaogongTransportContext.Provider>))
 try{await render('A');const textarea=document.querySelector('textarea')!;await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'记住的内容');textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}));textarea.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!);await render('A');assert.equal(document.querySelector('textarea')!.value,'记住的内容');await render('B');assert.equal(document.querySelector('textarea')!.value,'')}
 finally{await act(async()=>root.unmount());for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})


test('recall filters are per-view, survive fresh roots, and never auto-confirm a rating',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 windows.push(dom)
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const {createRoot}=await import('react-dom/client'),{RecallPanel}=await import('../src/recall-panel.tsx'),{KaogongTransportContext}=await import('../src/view-context.tsx');let root=createRoot(document.getElementById('root')!)
 const commands:any[]=[],points=[{id:'p1',subject:'科目',knowledgePoint:'甲'},{id:'p2',subject:'科目',knowledgePoint:'乙'}];let items:any[]=[{pointId:'p1',cycleId:'one',dueAt:'2020-01-01',history:[],recall:'本人内容',revealedAt:'2020-01-01',references:[{id:'r',title:'讲义',source:'合成',content:'参考原文'}]},{pointId:'p2',cycleId:'two',dueAt:'2099-01-01',history:[]}]
 const render=async(viewId:string)=>act(async()=>root.render(<KaogongTransportContext.Provider value={{instanceId:'A',viewId,url:(s:string)=>s,fetch:async(s:string,init?:RequestInit)=>{if(init?.body){const command=JSON.parse(String(init.body));commands.push(command);items=[{...items[0],cycleId:'new',recall:undefined,revealedAt:undefined,references:undefined,history:[{cycleId:'one',confirmedAt:'2026-11-05',recall:'本人内容',rating:command.rating}]}]}return new Response(JSON.stringify(s.includes('/route')?{points}:{items}))}} as any}><RecallPanel/></KaogongTransportContext.Provider>))
 const change=async(selector:string,value:string)=>act(async()=>{const el=document.querySelector(selector) as HTMLSelectElement;assert.ok(el,selector);el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
 try{await render('v1');const confirm=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='确认本次回忆完成')!;assert.equal(confirm().disabled,true);assert.equal(commands.length,0);
 await change('select[aria-label="知识点筛选"]','p1');assert.equal(document.querySelectorAll('article').length,1);await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!);await render('v1');assert.equal((document.querySelector('select[aria-label="知识点筛选"]') as HTMLSelectElement).value,'p1');await render('v2');assert.equal((document.querySelector('select[aria-label="知识点筛选"]') as HTMLSelectElement).value,'');assert.equal(document.querySelectorAll('article').length,2);
 await change('select[aria-label="本次自评"]','forgotten');assert.equal(commands.length,0);await act(async()=>confirm().click());assert.equal(commands[0].rating,'forgotten');assert.equal(commands[0].confirmed,true);assert.equal(document.querySelector('textarea')!.value,'');assert.equal(document.body.textContent?.includes('已确认回忆 1 次'),true)
 }finally{await act(async()=>root.unmount());for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})


test('a late recall command cannot reload or overwrite a replacement view transport',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 windows.push(dom)
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const {createRoot}=await import('react-dom/client'),{RecallPanel}=await import('../src/recall-panel.tsx'),{KaogongTransportContext}=await import('../src/view-context.tsx'),root=createRoot(document.getElementById('root')!);let finish!:(r:Response)=>void,reads=0;
 const transport=(old:boolean)=>({instanceId:'A',viewId:'v1',url:(s:string)=>s,fetch:async(s:string,init?:RequestInit)=>{if(init?.body&&old)return new Promise<Response>(r=>finish=r);if(s.includes('/recall')&&old)reads++;return new Response(JSON.stringify(s.includes('/route')?{points:[{id:'p1',subject:'科目',knowledgePoint:old?'旧视图':'新视图'}]}:{items:[]}))}})
 const render=async(value:any)=>act(async()=>root.render(<KaogongTransportContext.Provider value={value}><RecallPanel/></KaogongTransportContext.Provider>))
 try{await render(transport(true));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='确认加入回忆队列')!.click());await render(transport(false));assert.match(document.body.textContent??'',/新视图/);await act(async()=>finish(new Response('{}')));assert.equal(reads,1);assert.doesNotMatch(document.body.textContent??'',/旧视图/)}finally{await act(async()=>root.unmount());for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})


test('recall page requires writing, deliberate reveal, self-rating, and separate completion confirmation and clears revoked reference content',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 windows.push(dom)
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const {createRoot}=await import('react-dom/client'),{RecallPanel}=await import('../src/recall-panel.tsx'),{KaogongTransportContext}=await import('../src/view-context.tsx'),root=createRoot(document.getElementById('root')!);const commands:any[]=[];let row:any={pointId:'p1',cycleId:'c1',dueAt:'2020-01-01',history:[]};let revokeOnce=true;
 const transport={instanceId:'A',viewId:'v',url:(s:string)=>s,fetch:async(s:string,init?:RequestInit)=>{if(init?.body){const body=JSON.parse(String(init.body));commands.push(body);if(body.action==='confirm'&&revokeOnce){revokeOnce=false;return new Response(JSON.stringify({error:'资料授权已撤销，请重新授权'}),{status:403})}if(body.action==='answer')row={...row,recall:body.recall};if(body.action==='reveal')row={...row,revealedAt:'2026-11-05',references:[{id:'r',title:'讲义',source:'合成资料',content:'授权参考内容'}]};if(body.action==='confirm')row={pointId:'p1',cycleId:'c2',dueAt:'2099-01-01',history:[{cycleId:'c1',recall:row.recall,rating:body.rating,confirmedAt:'2026-11-05'}]}}return new Response(JSON.stringify(s.includes('/route')?{points:[{id:'p1',subject:'科目',knowledgePoint:'知识点'}]}:{items:[row]}))}}
 const button=(label:string)=>[...document.querySelectorAll('button')].find(b=>b.textContent===label)!;
 try{await act(async()=>root.render(<KaogongTransportContext.Provider value={transport as any}><RecallPanel/></KaogongTransportContext.Provider>));assert.equal(button('提交本次回忆').disabled,true);assert.doesNotMatch(document.body.textContent??'',/授权参考内容/);
 await act(async()=>{const input=document.querySelector('textarea')!;Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(input,'我先自己回忆');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});await act(async()=>button('提交本次回忆').click());assert.equal(commands.length,1);assert.doesNotMatch(document.body.textContent??'',/授权参考内容/);await act(async()=>button('查看参考原文').click());assert.match(document.body.textContent??'',/授权参考内容/);assert.equal(button('确认本次回忆完成').disabled,true);
 await act(async()=>{const select=document.querySelector('select[aria-label="本次自评"]') as HTMLSelectElement;select.value='fuzzy';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});assert.equal(commands.length,2);await act(async()=>button('确认本次回忆完成').click());assert.doesNotMatch(document.body.textContent??'',/授权参考内容/);assert.match(document.body.textContent??'',/资料授权已撤销/);assert.equal(document.querySelector('textarea')!.value,'我先自己回忆');assert.equal((document.querySelector('select[aria-label="本次自评"]') as HTMLSelectElement).value,'fuzzy');assert.equal(button('确认本次回忆完成').disabled,true);await act(async()=>button('刷新回忆及资料').click());await act(async()=>button('确认本次回忆完成').click());assert.deepEqual(commands.map(c=>c.action),['answer','reveal','confirm','confirm']);assert.equal(commands[2].rating,'fuzzy');assert.equal(document.querySelector('textarea')!.value,'');assert.match(document.body.textContent??'',/已确认回忆 1 次/)
 }finally{await act(async()=>root.unmount());for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})

test('late failed confirmation preserves the original profile draft after switching back',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 windows.push(dom)
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const {createRoot}=await import('react-dom/client'),{RecallPanel}=await import('../src/recall-panel.tsx'),{KaogongTransportContext}=await import('../src/view-context.tsx'),root=createRoot(document.getElementById('root')!);let finish!:(r:Response)=>void,reads=0;
 const transport=(old:boolean)=>({instanceId:old?'A':'B',viewId:old?'v1':'v2',url:(s:string)=>s,fetch:async(s:string,init?:RequestInit)=>{if(init?.body&&old)return new Promise<Response>(r=>finish=r);if(s.includes('/recall')&&old)reads++;return new Response(JSON.stringify(s.includes('/route')?{points:[{id:'p1',subject:'科目',knowledgePoint:old?'旧视图':'新视图'}]}:{items:[{pointId:'p1',cycleId:'c1',dueAt:'2020-01-01',recall:'本人回忆',revealedAt:'2026-01-01',history:[],references:[{id:'r',title:'参考',source:'合成',content:'原文'}]}]}))}})
 const render=async(value:any)=>act(async()=>root.render(<KaogongTransportContext.Provider value={value}><RecallPanel/></KaogongTransportContext.Provider>))
 try{window.localStorage.setItem('kaogong/recall-draft/'+JSON.stringify(['A','p1','c1']),JSON.stringify({recall:'本人回忆',rating:'fuzzy',early:false}));await render(transport(true));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='确认本次回忆完成')!.click());await render(transport(false));assert.match(document.body.textContent??'',/新视图/);await act(async()=>finish(new Response('{}',{status:500})));assert.equal(reads,1);assert.doesNotMatch(document.body.textContent??'',/旧视图/);await render(transport(true));assert.equal((document.querySelector('select[aria-label="本次自评"]') as HTMLSelectElement).value,'fuzzy')}finally{await act(async()=>root.unmount());for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})

test('late confirmation after unmount never updates disposed UI and retains failed drafts',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 windows.push(dom)
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 const {createRoot}=await import('react-dom/client'),{RecallPanel}=await import('../src/recall-panel.tsx'),{KaogongTransportContext}=await import('../src/view-context.tsx'),root=createRoot(document.getElementById('root')!);let finish!:(r:Response)=>void,reads=0;
 const transport=(old:boolean)=>({instanceId:old?'A':'B',viewId:old?'v1':'v2',url:(s:string)=>s,fetch:async(s:string,init?:RequestInit)=>{if(init?.body&&old)return new Promise<Response>(r=>finish=r);if(s.includes('/recall')&&old)reads++;return new Response(JSON.stringify(s.includes('/route')?{points:[{id:'p1',subject:'科目',knowledgePoint:old?'旧视图':'新视图'}]}:{items:[{pointId:'p1',cycleId:'c1',dueAt:'2020-01-01',recall:'本人回忆',revealedAt:'2026-01-01',history:[],references:[{id:'r',title:'参考',source:'合成',content:'原文'}]}]}))}})
 const render=async(value:any)=>act(async()=>root.render(<KaogongTransportContext.Provider value={value}><RecallPanel/></KaogongTransportContext.Provider>))
 try{const key='kaogong/recall-draft/'+JSON.stringify(['A','p1','c1']);window.localStorage.setItem(key,JSON.stringify({recall:'本人回忆',rating:'fuzzy',early:false}));await render(transport(true));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='确认本次回忆完成')!.click());await act(async()=>root.unmount());Reflect.deleteProperty(globalThis,'window');await act(async()=>{finish(new Response('{}',{status:500}));await new Promise(resolve=>setTimeout(resolve,10))});assert.ok(dom.window.localStorage.getItem(key));assert.equal(reads,1)}finally{for(const[k,v]of saved)v?Object.defineProperty(globalThis,k,v):Reflect.deleteProperty(globalThis,k)}
})
