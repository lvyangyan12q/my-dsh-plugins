import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act,useState} from 'react'
import {JSDOM} from 'jsdom'
import {PageTemplates} from '../src/page-template-view.tsx'
import {capturePageTemplate} from '../src/page-template.ts'
import {registerDisplaySource} from '../src/display-api.ts'
test('template reuse requires workspace confirmation and binds only destination roles and owned sources',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map(),oldFetch=globalThis.fetch
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const original={schemaVersion:1,appId:'target',version:1,name:'Target',description:'',workspace:'D:/target',connections:[],roles:[{id:'target-role',name:'Target role',presetId:'existing',skillNames:[]}],pages:[{id:'home',label:'Home',layout:'split',modules:[]}]}
 const template=capturePageTemplate('saved','Saved',{id:'private-page',label:'Reuse',layout:'split',modules:[{id:'private-module',type:'chart',title:'Chart',roleId:'private-role',connectionId:'private-source',config:{valueField:'count'}}]})
 let current=original,selectedPage,changeWorkspace;const calls=[]
 globalThis.fetch=async(_url,options)=>{const request=JSON.parse(options.body);calls.push(request);return{ok:true,json:async()=>({templates:[template]})}}
 const remove=registerDisplaySource({appId:'target',resource:'owned',label:'Owned source',load:async()=>assert.fail('Template selection must not load business data')})
 function Harness(){const [recipe,setRecipe]=useState(original);current=recipe;changeWorkspace=workspace=>setRecipe(old=>({...old,workspace}));return React.createElement(PageTemplates,{recipe,page:recipe.pages[0],t:k=>k,onPage:id=>{selectedPage=id},change:fn=>setRecipe(old=>{const next=structuredClone(old);fn(next);return next})})}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
 const choose=async(label,value)=>{const select=document.querySelector('select[aria-label="'+label+'"]');assert.ok(select,label);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(select,value);select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})}
 try{await act(async()=>root.render(React.createElement(Harness)));await choose('pageTemplateChoose','saved');const button=[...document.querySelectorAll('button')].find(item=>item.textContent==='pageTemplateAdd');assert.equal(button.disabled,true)
 await choose('recipeSource: slot.0','owned');await choose('recipeTaskRole: slot.0','target-role');await act(async()=>document.querySelector('input[type="checkbox"]').click());assert.equal(button.disabled,false);await act(async()=>changeWorkspace('D:/another-target'));assert.equal(button.disabled,true,'a different workspace requires its own confirmation');assert.equal(document.querySelector('input[type="checkbox"]').checked,false);await act(async()=>button.click());assert.equal(current.pages.length,1);await act(async()=>document.querySelector('input[type="checkbox"]').click());await act(async()=>button.click())
 assert.equal(current.pages.length,2);assert.equal(current.pages[0].id,'home');assert.equal(current.pages[1].id,selectedPage);assert.equal(current.pages[1].modules[0].roleId,'target-role');assert.equal(current.connections[0].sourceAppId,'target');assert.equal(current.connections[0].resource,'owned');assert.equal(current.pages[1].modules[0].connectionId,current.connections[0].id);assert.equal(original.pages.length,1);assert.equal(template.page.modules[0].roleId,undefined);assert.ok(calls.every(item=>item.action==='templates'))
 }finally{await act(async()=>root.unmount());remove();globalThis.fetch=oldFetch;dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
})
