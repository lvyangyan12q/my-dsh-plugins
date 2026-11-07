import {test} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'

const lab={
 version:1,
 parameters:[
  {id:'N',label:'样本 N',min:20,max:200,step:10,initial:100},
  {id:'B',label:'B 的数量',min:1,max:100,step:1,initial:40},
  {id:'AB',label:'A∩B',min:0,max:40,step:1,initial:30},
 ],
 readouts:[
  {id:'joint',label:'P(A∩B)',numerator:'AB',denominator:'N'},
  {id:'cond',label:'P(A|B)',numerator:'AB',denominator:'B'},
 ],
 prediction:{question:'把范围缩到 B，A 占的比例会——',options:[{id:'up',label:'变大',feedback:'对：分母变小。'},{id:'same',label:'不变'}],correct:'up'},
 restate:{prompt:'说明为什么分母变成 40',checks:[{id:'den',label:'提到分母',keywords:['分母']},{id:'narrow',label:'提到缩小',keywords:['缩小']},{id:'num',label:'提到 40',keywords:['40']}]},
}

test('lab bench hides numbers until the prediction, then unlocks restate and completion',async()=>{
 const base=new URL('../',import.meta.url)
 await build({stdin:{contents:"export {LabPanel} from './src/lab-panel.tsx'",resolveDir:fileURLToPath(base),loader:'tsx'},outfile:fileURLToPath(new URL('.checks/lab-page.mjs',base)),bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic'})
 const {LabPanel}=await import('../.checks/lab-page.mjs')
 const dom=new JSDOM('<div id="root"></div>')
 const previous={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT}
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})
 const course={id:'c1',instanceId:'i',version:1,title:'条件概率',html:'<h1>条件概率</h1>',lab}
 let predictionCalls=0,restateCalls=0,completeCalls=0
 const request=async body=>{
  if(body.action==='course-list')return[course]
  if(body.action==='continuation-read')return{position:{courseId:'c1',parameters:{N:100,B:40,AB:30}}}
  if(body.action==='continuation-save')return{}
  if(body.action==='request-list')return[]
  if(body.action==='teaching-workspaces')return[]
  if(body.action==='evidence-save'&&body.kind==='prediction'){predictionCalls++;return{correct:true,feedbackText:'对：分母变小。'}}
  if(body.action==='evidence-save'&&body.kind==='explanation'){restateCalls++;return{checks:[{id:'den',label:'提到分母',passed:true},{id:'narrow',label:'提到缩小',passed:true},{id:'num',label:'提到 40',passed:true}],passed:true}}
  if(body.action==='lab-complete'){completeCalls++;return{id:'done',passed:true}}
  throw Error('unexpected '+body.action)
 }
 const root=createRoot(document.getElementById('root'))
 try{
  await act(async()=>root.render(React.createElement(LabPanel,{instanceId:'i',request,openSession:()=>{}})))
  const readouts=()=>[...document.querySelectorAll('.pl-readouts dd')].map(node=>node.textContent)
  assert.deepEqual(readouts(),['?','?'])
  assert.equal([...document.querySelectorAll('.pl-control input')].every(input=>input.disabled),true)
  assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent.includes('把这一节记下来')),false)

  await act(async()=>[...document.querySelectorAll('.pl-opt')].find(button=>button.textContent.includes('变大')).click())
  assert.equal(predictionCalls,1)
  assert.deepEqual(readouts(),['30%','75%'])
  assert.equal([...document.querySelectorAll('.pl-control input')].every(input=>input.disabled),false)
  assert.match(document.querySelector('.pl-fb').textContent,/分母变小/)

  const textarea=document.querySelector('#pl-restate')
  const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set
  await act(async()=>{setter.call(textarea,'分母从 100 缩小到 40');textarea.dispatchEvent(new dom.window.InputEvent('input',{bubbles:true,inputType:'insertText',data:'分母从 100 缩小到 40'}))})
  const submit=[...document.querySelectorAll('button')].find(button=>button.textContent==='提交')
  await act(async()=>submit.click())
  assert.equal(restateCalls,1)
  assert.equal(document.querySelectorAll('.pl-checks li[data-passed="true"]').length,3)

  await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent.includes('把这一节记下来')).click())
  assert.equal(completeCalls,1)
  assert.match(document.querySelector('.pl-done').textContent,/已记入/)
 }finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous)}
})
