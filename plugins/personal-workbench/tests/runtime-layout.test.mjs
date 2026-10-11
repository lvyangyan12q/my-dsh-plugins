import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {RecipePage} from '../src/recipe-view.tsx'
import {installContentModules} from '../src/content-view.tsx'
test('runtime focus, page switch and reordering retain iframe nodes; ratio and focus restore on remount',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const {createRoot}=await import('react-dom/client');let root=createRoot(document.getElementById('root'));const remove=installContentModules()
 const recipe={schemaVersion:1,appId:'layout.test',version:1,name:'Layout',description:'',roles:[],connections:[],pages:[{id:'home',label:'Home',layout:'split',splitPercent:60,modules:[{id:'b',title:'B',type:'website',config:{url:'https://example.com/b'}},{id:'a',title:'A',type:'website',config:{url:'https://example.com/a'}}]},{id:'other',label:'Other',layout:'stack',modules:[{id:'c',title:'C',type:'website',config:{url:'https://example.com/c'}}]}]}
 const edits=[]
 const render=(pageId='home',value=recipe)=>root.render(React.createElement(RecipePage,{recipe:value,pageId,appId:recipe.appId,instanceId:'first',t:k=>k,onEditModule:(...args)=>edits.push(args)}))
 const click=async label=>{const button=document.querySelector('button[aria-label="'+label+'"]');assert.ok(button,label);await act(async()=>button.click())}
 try{await act(async()=>render());const frame=document.querySelector('iframe[title="A"]');assert.ok(frame)
 const toolbar=document.querySelector('[data-module-id="a"] .pwb-module-toolbar');assert.equal(toolbar.querySelectorAll('button').length,4);assert.ok(toolbar.querySelector('[aria-label="moduleReload: a"]'));await click('canvasConfigure: a');await click('canvasChangeContent: a');assert.deepEqual(edits,[['home','a',false],['home','a',true]]);assert.equal(document.querySelector('iframe[title="A"]'),frame)
 await click('canvasFocus: a');assert.equal(document.querySelector('iframe[title="A"]'),frame);assert.equal(document.querySelector('[data-module-id="a"]').style.position,'absolute');await click('canvasRestore: a');assert.equal(document.querySelector('iframe[title="A"]'),frame)
 await act(async()=>render('other'));assert.equal(document.querySelector('iframe[title="A"]'),frame);await act(async()=>render());assert.equal(document.querySelector('iframe[title="A"]'),frame)
 const reordered={...recipe,pages:[{...recipe.pages[0],modules:[...recipe.pages[0].modules].reverse()},recipe.pages[1]]};await act(async()=>render('home',reordered));assert.equal(document.querySelector('iframe[title="A"]'),frame);assert.equal(document.querySelector('[data-module-id="a"]').style.order,'0')
 const divider=document.querySelector('[role="separator"]');await act(async()=>divider.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));assert.equal(divider.getAttribute('aria-valuenow'),'65');await click('canvasFocus: a')
 await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));await act(async()=>render());assert.equal(document.querySelector('[data-module-id="a"]').style.position,'absolute');assert.equal(document.querySelector('[role="separator"]'),null);await click('canvasRestore: a');assert.equal(document.querySelector('[role="separator"]').getAttribute('aria-valuenow'),'65')
 }finally{await act(async()=>root.unmount());remove();dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
})
