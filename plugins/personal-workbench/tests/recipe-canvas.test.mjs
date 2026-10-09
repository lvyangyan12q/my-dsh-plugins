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
 const titles=document.querySelectorAll('.pwb-canvas-pane-header')
 const pointer=async(target,type,x,y,id=1)=>{const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperty(event,'pointerId',{value:id});await act(async()=>target.dispatchEvent(event))}
 document.elementFromPoint=()=>titles[1]
 // Small clicks, cancelled gestures, other pointers and toolbar actions must not move panes.
 await pointer(titles[0],'pointerdown',20,20);await pointer(titles[0],'pointerup',22,20)
 assert.deepEqual(current.pages[0].modules.map(m=>m.id),['left','right'])
 await pointer(titles[0],'pointerdown',20,20);await pointer(titles[0],'pointermove',320,20);await pointer(titles[0],'pointercancel',320,20);await pointer(titles[0],'pointerup',320,20)
 assert.deepEqual(current.pages[0].modules.map(m=>m.id),['left','right'])
 await pointer(titles[0],'pointerdown',20,20);await pointer(titles[0],'pointerup',320,20,2)
 assert.deepEqual(current.pages[0].modules.map(m=>m.id),['left','right'])
 await act(async()=>titles[0].dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await pointer(titles[0],'pointerup',320,20)
 assert.deepEqual(current.pages[0].modules.map(m=>m.id),['left','right'])
 await pointer(titles[0].querySelector('button'),'pointerdown',20,20);await pointer(titles[0],'pointerup',320,20)
 assert.deepEqual(current.pages[0].modules.map(m=>m.id),['left','right'])
 await pointer(titles[0],'pointerdown',20,20);await pointer(titles[0],'pointermove',320,20);await pointer(titles[0],'pointerup',320,20)

 assert.deepEqual(current.pages[0].modules.map(m=>m.id),['right','left']);assert.equal(current.pages[0].modules[0].config.url,'https://example.org/keep')
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [name,descriptor]of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}}
})

test('unrecognized module type keeps its draft identity and shows a readable type rather than a locale key', async () => {
 const {renderToStaticMarkup}=await import('react-dom/server')
 const recipe={schemaVersion:1,appId:'custom.contract',version:2,name:'Draft',description:'',pages:[{id:'home',label:'Home',layout:'stack',modules:[{id:'external',type:'external-widget',title:'My external widget',config:{reference:'keep'}}]}],connections:[],roles:[]}
 const before=structuredClone(recipe)
 const html=renderToStaticMarkup(React.createElement(RecipeCanvas,{recipe,change:()=>assert.fail('viewing unknown types must not rewrite a draft'),t:key=>key==='moduleType'?'Content type':key}))
 assert.ok(html.includes('Content type: external-widget'),'unknown module must show a readable type')
 assert.equal(html.includes('recipeModuleexternal-widget'),false,'unregistered locale keys must not leak into the canvas')
 assert.ok(html.includes('My external widget'))
 assert.deepEqual(recipe,before)
})

test('all supported public data modules retain their localized labels even without a canvas picker card', async () => {
 const {renderToStaticMarkup}=await import('react-dom/server')
 for(const [type,label] of [['list','数据列表'],['detail','详情'],['filter','筛选']]){
 const recipe={schemaVersion:1,appId:'known.types',version:1,name:'Known',description:'',pages:[{id:'home',label:'Home',layout:'stack',modules:[{id:'known',type,title:'Existing',config:{}}]}],connections:[],roles:[]}
 const html=renderToStaticMarkup(React.createElement(RecipeCanvas,{recipe,change:()=>assert.fail('render must not mutate'),t:key=>key==='recipeModule'+type?label:key==='moduleType'?'内容类型':key}))
 assert.ok(html.includes(label),'supported '+type+' must retain its localized label')
 assert.equal(html.includes('内容类型: '+type),false)
 }
})
