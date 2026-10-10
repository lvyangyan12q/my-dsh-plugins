import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {revealAnnotationComposer} from '../src/annotation-composer.ts'
import {AnnotationLayer} from '../src/annotation-view.tsx'
const recipe={appId:'app.test',version:1,roles:[{id:'maker',name:'Maker'}],pages:[{id:'home',label:'Home',modules:[{id:'web',title:'Website',roleId:'maker'}]}]}
async function fixture(){const dom=new JSDOM('<div id="mount"></div>',{pretendToBeVisual:true}),saved=new Map();for(const [name,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'));return {dom,root,close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of saved){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}}}
test('canvas annotation shows its selected box, stages a requirement and appends only after explicit confirmation',async()=>{
 const f=await fixture(),canvas=React.createRef(),calls=[],originalFetch=globalThis.fetch;let signal,insertion,stored=[];const priorCreate=URL.createObjectURL,priorRevoke=URL.revokeObjectURL;const released=[];URL.createObjectURL=()=>'blob:annotation-test';URL.revokeObjectURL=value=>released.push(value)
 globalThis.fetch=async(_url,options)=>{const data=JSON.parse(options.body);if(data.action==='save')stored=[{...data,createdAt:'2026-10-04T00:00:00Z',archived:false}];if(data.action==='archive')stored=stored.map(row=>({...row,archived:data.archived}));return {ok:true,json:async()=>({records:stored})}}
 const ctx={get:()=>({append:(key,text,cancel,reveal,image)=>{assert.equal(typeof reveal,'function');return insertion=reveal().then(()=>{assert.equal(document.querySelector('details').open,true);calls.push({key,text,image});signal=cancel})}})}
 const render=active=>f.root.render(React.createElement('div',{ref:canvas},React.createElement('section',{'data-module-id':'web'},React.createElement('iframe',{src:'about:blank'}),React.createElement('details',{},React.createElement('summary',{},'Conversation'),React.createElement('section',{'data-pwb-role-key':JSON.stringify(['app.test','default','maker',null])},React.createElement('div',{role:'textbox',contentEditable:true})))),React.createElement(AnnotationLayer,{canvas,recipe,pageId:'home',instanceId:'default',active,ctx,t:k=>k})))
 try{await act(async()=>render(true));canvas.current.getBoundingClientRect=()=>({left:100,top:50,width:800,height:600});for(const node of canvas.current.querySelectorAll('section,iframe'))node.getBoundingClientRect=()=>({left:110,top:100,width:400,height:400,right:510,bottom:500})
 const frame=document.querySelector('iframe');await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='annotationStart').click())
 const aim=document.querySelector('.pwb-annotation-aim'),pointer=(name,x,y)=>{const event=new f.dom.window.MouseEvent(name,{bubbles:true,clientX:x,clientY:y,button:0});aim.dispatchEvent(event)}
 await act(async()=>{pointer('pointerdown',120,110);pointer('pointermove',240,230);pointer('pointerup',240,230)})
 assert.match(document.body.textContent,/annotationLimited/);assert.equal(document.querySelector('.pwb-annotation-mark').style.top,'60px');assert.equal(calls.length,0);assert.equal(document.querySelector('iframe'),frame)
 const imageInput=document.querySelector('input[type=file]'),screenshot=new f.dom.window.File(['PNG fixture'],'marked-area.png',{type:'image/png'});Object.defineProperty(imageInput,'files',{configurable:true,value:[screenshot]});await act(async()=>imageInput.dispatchEvent(new f.dom.window.Event('change',{bubbles:true})));assert.equal(document.querySelector('img[alt=annotationImagePreview]').src,'blob:annotation-test');assert.match(document.body.textContent,/annotationLimitedImage/);assert.equal(calls.length,0);
 const input=document.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(f.dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,'Enlarge the timer');input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}))})
 const confirm=[...document.querySelectorAll('button')].find(b=>b.textContent==='annotationAppend');assert.equal(confirm.disabled,false);await act(async()=>confirm.click());await act(async()=>insertion);assert.equal(calls.length,1);assert.equal(calls[0].key.roleId,'maker');assert.equal(calls[0].image,screenshot);assert.match(calls[0].text,/marked-area.png/);assert.ok(released.includes('blob:annotation-test'));assert.match(calls[0].text,/Enlarge the timer/);assert.match(document.body.textContent,/annotationAdded/);assert.equal(document.querySelector('iframe'),frame)
 await act(async()=>render(false));assert.equal(signal.aborted,true);assert.equal(document.querySelector('.pwb-annotation-mark'),null)
 await act(async()=>f.root.render(null));await act(async()=>render(true))
 const history=[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('annotationHistory'))
 assert.ok(history,'Saved annotation history must be available after remount')
 await act(async()=>history.click());assert.match(document.body.textContent,/Enlarge the timer/)
 await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='annotationArchive').click())
 assert.equal(stored[0].archived,true);assert.equal(calls.length,1,'Reading or archiving history must not append again')
 await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='annotationRestore').click());assert.equal(stored[0].archived,false)
 }finally{await f.close();globalThis.fetch=originalFetch;URL.createObjectURL=priorCreate;URL.revokeObjectURL=priorRevoke}
})

test('composer reveal aborts while waiting for mount without touching another role surface',async()=>{
 const f=await fixture();try{const canvas=document.getElementById('mount');canvas.innerHTML='<details><summary>Other</summary><section data-pwb-role-key="other"><div role="textbox" contenteditable="true"></div></section></details>';const controller=new AbortController(),pending=revealAnnotationComposer(canvas,{appId:'app.test',instanceId:'default',roleId:'maker'},controller.signal,'Missing');controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(canvas.querySelector('details').open,false)}finally{await f.close()}
})

test('save failure and page closure during a delayed save never append to a native draft',async()=>{
 for(const scenario of ['failure','closure']){
  const f=await fixture(),canvas=React.createRef(),originalFetch=globalThis.fetch;let finish,appended=0
  const wait=new Promise(resolve=>{finish=resolve})
  globalThis.fetch=async(_url,options)=>{const request=JSON.parse(options.body);if(request.action==='list')return {ok:true,json:async()=>({records:[]})};if(scenario==='failure')throw Error('Storage unavailable');await wait;return {ok:true,json:async()=>({records:[{...request,createdAt:'2026-10-04',archived:false}]})}}
  const ctx={get:()=>({append:async()=>{appended++;return 'session'}})},render=active=>f.root.render(React.createElement('div',{ref:canvas},React.createElement('section',{'data-module-id':'web'},'Visible'),React.createElement(AnnotationLayer,{canvas,recipe,pageId:'home',instanceId:'default',active,ctx,t:k=>k})))
  try{
   await act(async()=>render(true));canvas.current.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});canvas.current.querySelector('section').getBoundingClientRect=()=>({left:0,top:44,right:400,bottom:500,width:400,height:456})
   await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='annotationStart').click())
   const aim=document.querySelector('.pwb-annotation-aim');await act(async()=>{for(const type of ['pointerdown','pointerup'])aim.dispatchEvent(new f.dom.window.MouseEvent(type,{bubbles:true,clientX:100,clientY:100,button:0}))})
   const input=document.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(f.dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,'Keep this requirement');input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}))})
   await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='annotationAppend').click())
   if(scenario==='failure'){assert.match(document.body.textContent,/Storage unavailable/);assert.equal(document.querySelector('textarea').value,'Keep this requirement')}
   else{await act(async()=>render(false));await act(async()=>{finish();await wait})}
   assert.equal(appended,0)
  }finally{finish();await f.close();globalThis.fetch=originalFetch}
 }
})


test('wrapped annotation toolbar stays outside selection and both editors as its height changes',async()=>{
 const f=await fixture(),canvas=React.createRef();let toolbarHeight=72;
 try{
  await act(async()=>f.root.render(React.createElement('div',{ref:canvas},React.createElement('section',{'data-module-id':'web'},'Visible'),React.createElement(AnnotationLayer,{canvas,recipe,pageId:'home',instanceId:'default',active:true,t:k=>k}))));
  canvas.current.getBoundingClientRect=()=>({left:0,top:100,width:424,height:600,right:424,bottom:700});
  document.querySelector('.pwb-annotation-toolbar').getBoundingClientRect=()=>({left:0,top:100,width:424,height:toolbarHeight,right:424,bottom:100+toolbarHeight});
  canvas.current.querySelector('section').getBoundingClientRect=()=>({left:0,top:180,width:424,height:520,right:424,bottom:700});
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='annotationStart').click());
  const aim=document.querySelector('[aria-label=annotationArea]');assert.equal(f.dom.window.getComputedStyle(aim).top,'72px','The selection layer must start below the wrapped toolbar');
  await act(async()=>{for(const type of ['pointerdown','pointerup'])aim.dispatchEvent(new f.dom.window.MouseEvent(type,{bubbles:true,clientX:100,clientY:280,button:0}))});
  assert.equal(f.dom.window.getComputedStyle(document.querySelector('[aria-label=annotationEditor]')).top,'82px');
  toolbarHeight=108;await act(async()=>f.dom.window.dispatchEvent(new f.dom.window.Event('resize')));
  assert.equal(f.dom.window.getComputedStyle(document.querySelector('[aria-label=annotationEditor]')).top,'118px','The open editor must follow a resized toolbar');
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('annotationHistory')).click());
  assert.equal(f.dom.window.getComputedStyle(document.querySelector('[aria-label=annotationHistory]')).top,'118px','History must use the same toolbar boundary');
 }finally{await f.close()}
})
