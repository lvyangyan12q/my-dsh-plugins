import {test} from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import Renderer,{act} from 'react-test-renderer'
import {fixture} from './fixture.mjs'
import {createNotesViews} from '../src/notes-views.tsx'
const h=React.createElement
const visible=node=>node===null?'':typeof node==='string'?node:Array.isArray(node)?node.map(visible).join(''):visible(node.children)
test('full page writes real owned notes, summary shares selection and another instance remains empty without AI',async()=>{
 const f=await fixture({assistantConfigured:true}),previous=globalThis.fetch,prepared=[],pending=new Set();let page,summary,other,views;
 async function settle(){while(pending.size)await act(async()=>{await Promise.all([...pending])})}
 try{
  globalThis.fetch=(_url,options)=>{const input=JSON.parse(options.body);const task=f.resources.call(input).then(value=>({ok:true,json:async()=>value}),e=>({ok:false,json:async()=>({error:e.message})}));pending.add(task);void task.finally(()=>pending.delete(task));return task}
  const a=await f.instance('project-A'),b=await f.instance('project-B'),summaryView=await f.apps.createView(a.instance.id,'summary');views=createNotesViews();
  await act(async()=>{page=Renderer.create(h(views.views.page,{...a,tasks:{prepare:async input=>{prepared.push(input)}}}));summary=Renderer.create(h(views.views.summary,{...a,view:summaryView}));other=Renderer.create(h(views.views.page,b))})
  await settle()
  const input=label=>page.root.findByProps({'aria-label':label});for(const label of ['搜索便签','显示归档','便签标题','便签正文']){const control=input(label);assert.ok(control.props.id);assert.equal(page.root.findByProps({htmlFor:control.props.id}).type,'label')}assert.equal(input('显示归档').props.type,'checkbox');
  await act(async()=>{input('便签标题').props.onChange({target:{value:'核对合同'}});input('便签正文').props.onChange({target:{value:'周五前核对金额和交付日期。'}})})
  await act(async()=>{await page.root.findByProps({'aria-label':'保存便签'}).props.onClick()})
  await settle()
  assert.match(visible(summary.toJSON()),/便签：1/);assert.match(visible(page.toJSON()),/核对合同/);assert.doesNotMatch(visible(other.toJSON()),/核对合同/)
  assert.equal(prepared.length,0)
  await act(async()=>{await page.root.findByProps({'aria-label':'选择便签 核对合同'}).props.onClick()})
  assert.match(visible(summary.toJSON()),/已选：核对合同/)
  await act(async()=>{await page.root.findAllByType('button').find(button=>button.children.join('')==='准备便签整理任务').props.onClick()})
  assert.equal(prepared.length,1);assert.equal(prepared[0].roleId,'assistant');assert.equal(prepared[0].contexts[0].resourceId,'project-notes-records');assert.equal(prepared[0].contexts[0].selection.ids.length,1);assert.match(prepared[0].text,/operator-chosen-skill/)
  await act(async()=>{input('搜索便签').props.onChange({target:{value:'不匹配'}})})
  assert.match(visible(summary.toJSON()),/便签：0/)
 }finally{await act(async()=>{page?.unmount();summary?.unmount();other?.unmount()});views?.dispose();globalThis.fetch=previous;await f.close()}
})
test('closing the editor while its authorized write returns still updates the surviving same-instance summary',async()=>{
 const f=await fixture(),previous=globalThis.fetch;let page,summary,views,release,started;const writing=new Promise(resolve=>started=resolve),pending=new Set();
 async function settle(){while(pending.size)await act(async()=>{await Promise.all([...pending])})}
 try{
  globalThis.fetch=(_url,options)=>{const input=JSON.parse(options.body);const task=(async()=>{const value=await f.resources.call(input);if(input.action==='create'){started();await new Promise(resolve=>release=resolve)}return {ok:true,json:async()=>value}})();pending.add(task);void task.finally(()=>pending.delete(task));return task}
  const a=await f.instance('A'),view=await f.apps.createView(a.instance.id,'summary');views=createNotesViews();await act(async()=>{page=Renderer.create(h(views.views.page,a));summary=Renderer.create(h(views.views.summary,{...a,view}))});await settle();
  await act(async()=>{page.root.findByProps({'aria-label':'便签标题'}).props.onChange({target:{value:'关闭后仍保留'}})})
  let save;await act(async()=>{save=page.root.findByProps({'aria-label':'保存便签'}).props.onClick();await writing;page.unmount();page=undefined});release();await act(async()=>{await save});await settle();
  assert.match(visible(summary.toJSON()),/便签：1/)
 }finally{release?.();await act(async()=>{page?.unmount();summary?.unmount()});views?.dispose();globalThis.fetch=previous;await f.close()}
})
test('revoked shared notes disappear from full page and same-instance summary after refresh while the rejection remains visible',async()=>{
 const f=await fixture(),previous=globalThis.fetch,pending=new Set();let page,summary,views;
 async function settle(){while(pending.size)await act(async()=>{await Promise.all([...pending])})}
 try{
  globalThis.fetch=(_url,options)=>{const task=f.resources.call(JSON.parse(options.body)).then(value=>({ok:true,json:async()=>value}),e=>({ok:false,json:async()=>({error:e.message})}));pending.add(task);void task.finally(()=>pending.delete(task));return task}
  const a=await f.instance('A'),b=await f.instance('B'),r=f.owner.resource;const empty=await r.read(a.instance.id);await r.mutate(a.instance.id,'create',{note:{title:'SHARED_SECRET_TITLE',body:'Source content'}},empty.revision,async()=>{});
  const grant=await f.resources.share({ownerViewId:a.view.id,consumerInstanceId:b.instance.id,resourceId:r.resourceId}),view=await f.apps.createView(b.instance.id,'summary');views=createNotesViews();
  await act(async()=>{page=Renderer.create(h(views.views.page,b));summary=Renderer.create(h(views.views.summary,{...b,view}))});await settle();assert.match(visible(page.toJSON()),/SHARED_SECRET_TITLE/);assert.match(visible(summary.toJSON()),/便签：1/)
  await f.resources.revoke(grant.id,grant.revision);await act(async()=>{page.root.findAllByType('button').find(button=>button.children.join('')==='刷新便签与权限').props.onClick()});await settle();
  assert.doesNotMatch(visible(page.toJSON()),/SHARED_SECRET_TITLE/);assert.match(visible(page.toJSON()),/撤销/);assert.match(visible(summary.toJSON()),/便签：0/);assert.doesNotMatch(visible(summary.toJSON()),/SHARED_SECRET_TITLE/)
 }finally{await act(async()=>{page?.unmount();summary?.unmount()});views?.dispose();globalThis.fetch=previous;await f.close()}
})
