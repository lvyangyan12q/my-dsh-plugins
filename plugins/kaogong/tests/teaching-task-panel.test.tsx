import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import {TeachingTasks} from '../src/study-task-panel.tsx'

test('the Native learning tab shows only its own Session tasks and sends only the explicit prepared task',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'})
  const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true}
  const saved=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
  for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})
  const row={id:'prepared',revision:1,status:'prepared',text:'continue lesson',contexts:[],sessionId:'native-teacher',roleId:'teacher'}
  const rows=[row,{...row,id:'unknown',status:'unknown'},{...row,id:'foreign',sessionId:'another-session',roleId:'foreign-role'}]
  const sent:unknown[]=[]
  const tasks={list:async()=>rows,submit:async(id:string,revision:number)=>{sent.push([id,revision]);return row}}
  const root=createRoot(document.getElementById('root')!)
  try{
    await act(async()=>root.render(<TeachingTasks tasks={tasks as never} sessionId="native-teacher"/>))
    assert.doesNotMatch(document.body.textContent??'',/foreign-role/)
    assert.equal(sent.length,0)
    const sends=[...document.querySelectorAll('button')].filter(button=>button.textContent==='发送到原生对话')
    assert.equal(sends.length,1)
    await act(async()=>sends[0].click())
    assert.deepEqual(sent,[['prepared',1]])
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key)}
})
