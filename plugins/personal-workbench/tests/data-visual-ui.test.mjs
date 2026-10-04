import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {DisplayStore} from '../src/display-store.ts'
import {DisplayModule} from '../src/display-view.tsx'
test('chart and map use filtered owned records, preserve zero values and link selection to detail',async()=>{
 const dom=new JSDOM('<div id="root"></div>'),saved=new Map()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
 const store=new DisplayStore({appId:'owned',resource:'records',label:'Owned',load:async()=>({records:[{id:'zero',title:'Zero',fields:{value:0,lat:0,lon:0,category:'a'}},{id:'negative',title:'Negative',fields:{value:-5,lat:30,lon:120,category:'b'}},{id:'bad',title:'Invalid coordinates',fields:{value:'5',lat:200,lon:null,category:'b'}}],filters:[{field:'category',label:'Category'}],stats:[]})},{appId:'owned',instanceId:'one',preview:false})
 try{await store.reload();await act(async()=>root.render(React.createElement(React.Fragment,null,React.createElement(DisplayModule,{type:'chart',store,t:k=>k,config:{valueField:'value'}}),React.createElement(DisplayModule,{type:'map',store,t:k=>k,config:{latitudeField:'lat',longitudeField:'lon'}}),React.createElement(DisplayModule,{type:'detail',store,t:k=>k}))))
 assert.ok(document.querySelector('[aria-label="Zero: 0"]'));assert.ok(document.querySelector('[aria-label="Negative: -5"]'));assert.equal(document.querySelectorAll('[data-map-record]').length,2)
 await act(async()=>document.querySelector('[data-map-record="zero"]').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));assert.equal(store.getSnapshot().selectedId,'zero');assert.equal(document.querySelector('.pwb-display-detail h4').textContent,'Zero')
 await act(async()=>store.setFilter('category','b'));assert.equal(store.getSnapshot().selectedId,undefined);assert.equal(document.querySelectorAll('[data-map-record]').length,1);assert.equal(document.querySelector('[aria-label="Zero: 0"]'),null)
 await act(async()=>store.setSearch('missing'));assert.equal(document.querySelectorAll('svg').length,0);assert.match(document.body.textContent,/displayNoMatches/)
 }finally{await act(async()=>root.unmount());store.dispose();dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
})

test('recipe registers chart/map through an owned shared connection and blocks cross-application sources',async()=>{
 const {RecipePage}=await import('../src/recipe-view.tsx'),{installDisplayModules}=await import('../src/display-view.tsx'),{registerDisplaySource}=await import('../src/display-api.ts'),{recipeSchema}=await import('../src/recipe-schema.ts')
 const dom=new JSDOM('<div id="root"></div>'),saved=new Map()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));let loads=0
 const remove=installDisplayModules(),withdraw=registerDisplaySource({appId:'owned',resource:'locations',label:'Locations',load:async scope=>{loads++;assert.equal(scope.appId,'owned');assert.equal(scope.instanceId,'one');return {records:[{id:'origin',title:'Origin',fields:{count:3,lat:0,lon:0}}],filters:[],stats:[]}}})
 const recipe=recipeSchema.parse({schemaVersion:1,appId:'owned',version:1,name:'Owned',description:'',roles:[],connections:[{id:'geo',sourceAppId:'owned',resource:'locations'}],pages:[{id:'home',label:'Home',layout:'split',modules:[{id:'chart',type:'chart',title:'Chart',connectionId:'geo',config:{valueField:'count'}},{id:'map',type:'map',title:'Map',connectionId:'geo',config:{latitudeField:'lat',longitudeField:'lon'}}]}]})
 try{await act(async()=>root.render(React.createElement(RecipePage,{recipe,pageId:'home',appId:'owned',instanceId:'one',t:k=>k})));assert.equal(loads,1);assert.ok(document.querySelector('[aria-label="Origin: 3"]'));assert.equal(document.querySelectorAll('[data-map-record]').length,1)
 const foreign={...recipe,appId:'foreign'};await act(async()=>root.render(React.createElement(RecipePage,{recipe:foreign,pageId:'home',appId:'foreign',instanceId:'one',t:k=>k})));assert.equal(loads,1);assert.equal(document.querySelector('svg'),null);assert.match(document.body.textContent,/displayUnavailable/)
 }finally{await act(async()=>root.unmount());withdraw();remove();dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
})


test('chart renders accepted finite extremes around zero without invalid SVG geometry',async()=>{
 const dom=new JSDOM('<div id="root"></div>'),saved=new Map()
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
 const store=new DisplayStore({appId:'owned',resource:'records',label:'Owned',load:async()=>({records:[{id:'negative',title:'Negative limit',fields:{value:-Number.MAX_VALUE}},{id:'positive',title:'Positive limit',fields:{value:Number.MAX_VALUE}},{id:'zero',title:'Zero',fields:{value:0}}],filters:[],stats:[]})},{appId:'owned',instanceId:'one',preview:false})
 try{
  await store.reload();assert.equal(store.getSnapshot().phase,'ready')
  await act(async()=>root.render(React.createElement(DisplayModule,{type:'chart',store,t:k=>k,config:{valueField:'value'}})))
  const chart=document.querySelector('svg');assert.ok(chart)
  for(const element of chart.querySelectorAll('[x],[x1],[x2],[width]'))for(const attribute of ['x','x1','x2','width'])if(element.hasAttribute(attribute))assert.ok(Number.isFinite(Number(element.getAttribute(attribute))),attribute+' must remain finite')
  assert.equal(Number(chart.querySelector('line').getAttribute('x1')),360)
  const bar=id=>chart.querySelector('[aria-label="'+(id==='negative'?'Negative limit: '+(-Number.MAX_VALUE):id==='positive'?'Positive limit: '+Number.MAX_VALUE:'Zero: 0')+'"] rect:nth-of-type(2)')
  assert.equal(Number(bar('negative').getAttribute('x')),160);assert.equal(Number(bar('negative').getAttribute('width')),200)
  assert.equal(Number(bar('positive').getAttribute('x')),360);assert.equal(Number(bar('positive').getAttribute('width')),200)
  assert.equal(Number(bar('zero').getAttribute('x')),360);assert.equal(Number(bar('zero').getAttribute('width')),2)
  await act(async()=>chart.querySelector('[aria-label="Positive limit: '+Number.MAX_VALUE+'"]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})))
  assert.equal(store.getSnapshot().selectedId,'positive')
 }finally{await act(async()=>root.unmount());store.dispose();dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
})
