import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act,useState} from 'react'
import {JSDOM} from 'jsdom'
import {RecipeCanvas} from '../src/recipe-canvas.tsx'

test('a user configures the chosen pane in-place without losing another pane or its identity',async()=>{
 const dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),original=new Map()
 for(const [name,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})}
 const initial={schemaVersion:1,appId:'canvas.test',version:1,name:'Canvas',description:'',pages:[{id:'home',label:'Home',layout:'grid',modules:[{id:'left',title:'',type:'empty',config:{}},{id:'right',title:'Existing page',type:'website',config:{url:'https://example.org/keep'}}]}],connections:[],roles:[]}
 let current=initial
 function Harness(){const [recipe,setRecipe]=useState(initial);current=recipe;return React.createElement(RecipeCanvas,{recipe,t:k=>k,change:fn=>setRecipe(old=>{const next=structuredClone(old);fn(next);return next})})}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'))
 const click=async label=>{const button=document.querySelector(`button[aria-label="${label}"]`);assert.ok(button,label);await act(async()=>button.click())}
 try{
  await act(async()=>root.render(React.createElement(Harness)))
  assert.equal(document.querySelector('input[aria-label="moduleUrl: left"]'),null)
  await click('recipeModulewebsite: left')
  const input=document.querySelector('input[aria-label="moduleUrl: left"]');assert.ok(input)
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'https://example.com/new');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
  assert.equal(current.pages[0].modules[0].id,'left');assert.equal(current.pages[0].modules[0].config.url,'https://example.com/new')
  assert.equal(current.pages[0].modules[1].config.url,'https://example.org/keep')
  assert.ok(document.querySelector('[data-module-id="left"] input[aria-label="moduleUrl: left"]'))
  await click('canvasDone: left');assert.equal(document.querySelector('input[aria-label="moduleUrl: left"]'),null)
  await click('canvasChangeContent: left');assert.equal(current.pages[0].modules[0].type,'empty');assert.equal(current.pages[0].modules[0].id,'left')
  assert.equal(current.pages[0].modules[1].config.url,'https://example.org/keep')
 const divider=document.querySelector('[role="separator"]');assert.ok(divider)
 await act(async()=>divider.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));assert.equal(current.pages[0].splitPercent,55)
 const {recipeSchema}=await import('../src/recipe-schema.ts');assert.equal(recipeSchema.parse(current).pages[0].splitPercent,55);assert.equal(recipeSchema.safeParse({...current,pages:[{...current.pages[0],splitPercent:99}]}).success,false)
 const titles=document.querySelectorAll('.pwb-canvas-pane-header');const drag=new dom.window.Event('dragstart',{bubbles:true});Object.defineProperty(drag,'dataTransfer',{value:{setData:()=>{},effectAllowed:''}})
 await act(async()=>titles[0].dispatchEvent(drag));await act(async()=>titles[1].dispatchEvent(new dom.window.Event('drop',{bubbles:true,cancelable:true})))
 assert.deepEqual(current.pages[0].modules.map(m=>m.id),['right','left']);assert.equal(current.pages[0].modules[0].config.url,'https://example.org/keep')
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [name,descriptor]of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}}
})
