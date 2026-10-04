import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {RecipePage} from '../src/recipe-view.tsx'
import {installContentModules} from '../src/content-view.tsx'
import {RecipeEditor} from '../src/recipe-editor.tsx'
const recipe={schemaVersion:1,appId:'app.test',version:1,name:'Test',description:'',pages:[{id:'home',label:'Home',layout:'grid',modules:[{id:'web',type:'website',title:'Website',config:{url:'https://example.com'}},{id:'custom',type:'custom',title:'Custom',config:{mode:'generate'}},{id:'files',type:'resources',title:'Files',config:{}}]}],roles:[],connections:[]}
async function domFixture(){const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map();for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}const{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'));return {dom,root,close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}}}
test('mixed module preview stays inert and website runtime uses a sandboxed frame without replacing native navigation',async()=>{
 const f=await domFixture(),remove=installContentModules(),oldFetch=globalThis.fetch,calls=[];globalThis.fetch=async()=>{calls.push(1);throw Error('Unexpected request')}
 try{await act(async()=>f.root.render(React.createElement(RecipePage,{recipe,pageId:'home',appId:recipe.appId,instanceId:'test',preview:true,t:k=>k})));assert.equal(document.querySelectorAll('iframe').length,0);assert.deepEqual(calls,[])
 const web={...recipe,pages:[{...recipe.pages[0],modules:[recipe.pages[0].modules[0]]}]};await act(async()=>f.root.render(React.createElement(RecipePage,{recipe:web,pageId:'home',appId:recipe.appId,instanceId:'test',t:k=>k})));const frame=document.querySelector('iframe');assert.equal(frame.getAttribute('src'),'https://example.com/');assert.ok(!frame.getAttribute('sandbox').includes('allow-same-origin'));assert.equal(document.querySelector('a').rel,'noopener noreferrer');assert.deepEqual(calls,[])
 }finally{await f.close();remove();globalThis.fetch=oldFetch}
})
test('each pane can independently switch content types and custom supports all three sources without saving or starting AI',async()=>{
 const f=await domFixture(),oldFetch=globalThis.fetch,calls=[];globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));return{ok:true,json:async()=>({recipes:[]})}}
 const change=async(selector,value)=>{const el=document.querySelector(selector);assert.ok(el);await act(async()=>{Object.getOwnPropertyDescriptor(f.dom.window.HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}))})}
 try{await act(async()=>f.root.render(React.createElement(RecipeEditor,{t:k=>k,refresh:async()=>{}})));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='recipeCreate').click());const panes=document.querySelectorAll('[data-module-id]');assert.equal(panes.length,4);const id=panes[0].getAttribute('data-module-id');
 await act(async()=>document.querySelector('button[aria-label="recipeModulecustom: '+id+'"]').click());let mode=document.querySelector('select[aria-label^="moduleSource:"]');assert.deepEqual([...mode.options].map(o=>o.value),['generate','url','file']);await change('select[aria-label^="moduleSource:"]','file');assert.ok(document.querySelector('input[aria-label^="moduleFile:"]'));const draft=JSON.parse(document.querySelector('textarea[aria-label="recipeConfiguration"]').value);assert.equal(draft.pages[0].modules[0].config.mode,'file');assert.equal(draft.pages[0].modules[1].type,'empty');assert.ok(calls.every(c=>['catalog','workspaces','templates'].includes(c.action)))
 }finally{await f.close();globalThis.fetch=oldFetch}
})
test('custom generation prepares an exact owned output task, requires explicit send, rejects stale targets and mounts the returned HTML',async()=>{
 const f=await domFixture(),remove=installContentModules(),oldFetch=globalThis.fetch,calls=[];let prepared,options,ready=false,requestId='job-one'
 const draft={...recipe,roles:[{id:'maker',name:'Maker',presetId:'test',skillNames:[]}],pages:[{...recipe.pages[0],modules:[{id:'custom',type:'custom',title:'Custom',roleId:'maker',config:{mode:'generate',requirement:'Build a timer'}}]}]}
 globalThis.fetch=async(_url,init)=>{const data=JSON.parse(init.body);calls.push(data);return {ok:true,json:async()=>data.action==='reserve'?{requestId,path:'D:/workspace/.my-dsh/widgets/owned/job-one.html'}:{ready,requestId,...(ready?{kind:'html',content:'<h1>Generated timer</h1>'}:{})}}}
 const states=new Map(),ctx={get:name=>name==='personalWorkbenchTasks'?{prepare:(task,hooks)=>{prepared=task;options=hooks},getSnapshot:()=>states,subscribe:()=>()=>{}}:undefined}
 try{await act(async()=>f.root.render(React.createElement(RecipePage,{recipe:draft,pageId:'home',appId:draft.appId,instanceId:'first',ctx,t:k=>k})));assert.ok(calls.every(c=>c.action==='artifact'));assert.equal(prepared,undefined)
 await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='modulePrepare').click());assert.equal(prepared.task,'Build a timer');assert.deepEqual(prepared.key,{appId:'app.test',instanceId:'first',roleId:'maker'});assert.match(prepared.context[0].text,/owned\/job-one.html/);assert.equal(calls.filter(c=>c.action==='reserve').length,1)
 await options.beforeSend();requestId='job-two';await assert.rejects(options.beforeSend(),/target changed/);requestId='job-one';ready=true
 await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='moduleReload').click());const frame=document.querySelector('iframe');assert.equal(frame.getAttribute('srcdoc'),'<h1>Generated timer</h1>');assert.equal(frame.getAttribute('sandbox'),'allow-scripts');assert.ok(!calls.some(c=>c.action==='send'))
 }finally{await f.close();remove();globalThis.fetch=oldFetch}
})

test('loaded artifact keeps associated native session failure visible and observes recovery without sending',async()=>{
 const f=await domFixture(),remove=installContentModules(),oldFetch=globalThis.fetch
 const draft={...recipe,roles:[{id:'maker',name:'Maker',presetId:'test',skillNames:[]}],pages:[{...recipe.pages[0],modules:[{id:'custom',type:'custom',title:'Custom',roleId:'maker',config:{mode:'generate'}}]}]}
 let snapshot={running:false,lastAgentError:'400 INVALID_REQUEST',promptError:null,openError:null},listeners=new Set()
 const session={getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}}
 const states=new Map([[JSON.stringify(['app.test','first','maker',null]),{error:null,busy:false,window:{phase:'open',reference:{binding:{session}}}}]])
 const ctx={get:name=>name==='personalWorkbenchRoles'?{view:{getSnapshot:()=>states,subscribe:()=>()=>{}}}:undefined}
 globalThis.fetch=async()=>({ok:true,json:async()=>({ready:true,kind:'html',content:'<h1>Generated</h1>',requestId:'one'})})
 try{await act(async()=>f.root.render(React.createElement(RecipePage,{recipe:draft,pageId:'home',appId:draft.appId,instanceId:'first',ctx,t:k=>k})))
 assert.ok(document.querySelector('iframe'));assert.match(document.body.textContent,/moduleArtifactReady/);assert.match(document.body.textContent,/400 INVALID_REQUEST/);assert.equal(document.querySelector('details.pwb-custom-task').open,false)
 await act(async()=>{snapshot={...snapshot,lastAgentError:null,running:true};for(const fn of listeners)fn()})
 assert.doesNotMatch(document.body.textContent,/400 INVALID_REQUEST/);assert.match(document.body.textContent,/moduleSessionRunning/);assert.ok(document.querySelector('iframe'))
 }finally{await f.close();remove();globalThis.fetch=oldFetch}
})
