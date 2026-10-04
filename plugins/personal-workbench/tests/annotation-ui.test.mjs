import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {AnnotationLayer} from '../src/annotation-view.tsx'
const recipe={appId:'app.test',version:1,roles:[{id:'maker',name:'Maker'}],pages:[{id:'home',label:'Home',modules:[{id:'web',title:'Website',roleId:'maker'}]}]}
async function fixture(){const dom=new JSDOM('<div id="mount"></div>'),saved=new Map();for(const [name,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'));return {dom,root,close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const[name,value]of saved){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name]}}}}
test('canvas annotation shows its selected box, stages a requirement and appends only after explicit confirmation',async()=>{
 const f=await fixture(),canvas=React.createRef(),calls=[];let signal
 const ctx={get:()=>({append:async(key,text,cancel)=>{calls.push({key,text});signal=cancel}})}
 const render=active=>f.root.render(React.createElement('div',{ref:canvas},React.createElement('section',{'data-module-id':'web'},React.createElement('iframe',{src:'about:blank'})),React.createElement(AnnotationLayer,{canvas,recipe,pageId:'home',instanceId:'default',active,ctx,t:k=>k})))
 try{await act(async()=>render(true));canvas.current.getBoundingClientRect=()=>({left:100,top:50,width:800,height:600});for(const node of canvas.current.querySelectorAll('section,iframe'))node.getBoundingClientRect=()=>({left:110,top:100,width:400,height:400,right:510,bottom:500})
 const frame=document.querySelector('iframe');await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='annotationStart').click())
 const aim=document.querySelector('.pwb-annotation-aim'),pointer=(name,x,y)=>{const event=new f.dom.window.MouseEvent(name,{bubbles:true,clientX:x,clientY:y,button:0});aim.dispatchEvent(event)}
 await act(async()=>{pointer('pointerdown',120,110);pointer('pointermove',240,230);pointer('pointerup',240,230)})
 assert.match(document.body.textContent,/annotationLimited/);assert.equal(document.querySelector('.pwb-annotation-mark').style.top,'60px');assert.equal(calls.length,0);assert.equal(document.querySelector('iframe'),frame)
 const input=document.querySelector('textarea');await act(async()=>{Object.getOwnPropertyDescriptor(f.dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,'Enlarge the timer');input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}))})
 const confirm=[...document.querySelectorAll('button')].find(b=>b.textContent==='annotationAppend');assert.equal(confirm.disabled,false);await act(async()=>confirm.click());assert.equal(calls.length,1);assert.equal(calls[0].key.roleId,'maker');assert.match(calls[0].text,/Enlarge the timer/);assert.match(document.body.textContent,/annotationAdded/);assert.equal(document.querySelector('iframe'),frame)
 await act(async()=>render(false));assert.equal(signal.aborted,true);assert.equal(document.querySelector('.pwb-annotation-mark'),null)
 }finally{await f.close()}
})
