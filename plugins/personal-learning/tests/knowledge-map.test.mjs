import {test} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import {KnowledgeExplorer} from '../src/knowledge-map.mjs'

test('learner chooses a demo concept, opens its lesson and returns to the same selection',async()=>{
 const dom=new JSDOM('<div id="root"></div>'),saved=new Map()
 for(const [k,v] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true})}
 const root=createRoot(document.getElementById('root'))
 try{
  await act(()=>root.render(React.createElement(KnowledgeExplorer)))
  const click=async text=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent===text);assert.ok(b,text);await act(()=>b.click())}
  await click('知识地图')
  assert.match(document.body.textContent,/示例知识地图/)
  for(const type of ['先修','组成','应用'])assert.match(document.body.textContent,new RegExp(type))
  await click('贝叶斯定理');assert.match(document.body.textContent,/尚无关联课程/);assert.equal(document.querySelector('iframe'),null)
  await click('条件概率');await click('打开条件概率样课');assert.ok(document.querySelector('iframe'))
  await click('返回知识地图');assert.equal(document.querySelector('[aria-pressed="true"][data-concept]').textContent,'条件概率')
 }finally{await act(()=>root.unmount());dom.window.close();for(const[k,d]of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
})
