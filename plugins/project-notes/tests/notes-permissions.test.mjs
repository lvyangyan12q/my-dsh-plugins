import {test} from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import Renderer,{act} from 'react-test-renderer'
import {fixture} from './fixture.mjs'
import {createNotesViews} from '../src/notes-views.tsx'
const h=React.createElement
for(const actions of [['read'],['read','create'],['read','update'],['read','create','update','archive']])test('mounted Notes action rights '+actions.join('+'),async()=>{
 const f=await fixture(),previous=globalThis.fetch,pending=new Set(),submitted=[];let page,views
 async function settle(){while(pending.size)await act(async()=>{await Promise.all([...pending])})}
 const button=label=>page.root.findAllByType('button').find(b=>b.props['aria-label']===label||b.children.join('')===label)
 try{
  globalThis.fetch=(_url,options)=>{const input=JSON.parse(options.body);if(input.action!=='read')submitted.push(input.action);const task=f.resources.call(input).then(value=>({ok:true,json:async()=>value}),error=>({ok:false,json:async()=>({error:error.message})}));pending.add(task);void task.finally(()=>pending.delete(task));return task}
  const owner=await f.instance('owner'),consumer=await f.instance('consumer'),resource=f.owner.resource,empty=await resource.read(owner.instance.id)
  await resource.mutate(owner.instance.id,'create',{note:{title:'Existing note',body:'Keep original'}},empty.revision,async()=>{})
  const grant=await f.resources.share({ownerViewId:owner.view.id,consumerInstanceId:consumer.instance.id,resourceId:resource.resourceId});await f.resources.permissions(grant.id,grant.revision,actions)
  views=createNotesViews();await act(async()=>{page=Renderer.create(h(views.views.page,consumer))});await settle()
  assert.equal(page.root.findByType('fieldset').props.disabled,!actions.includes('create'),'a new draft requires create rather than update')
  await act(async()=>{button('选择便签 Existing note').props.onClick()})
  assert.equal(button('编辑此便签').props.disabled,!actions.includes('update'));assert.equal(button('归档此便签').props.disabled,!actions.includes('archive'))
  if(actions.includes('create')){
   await act(async()=>page.root.findByProps({'aria-label':'便签标题'}).props.onChange({target:{value:'New authorized note'}}))
   await act(async()=>{await button('保存便签').props.onClick()});await settle();assert.deepEqual(submitted,['create'])
  }
  if(actions.includes('update')){
   await act(async()=>{button('编辑此便签').props.onClick()});assert.equal(page.root.findByType('fieldset').props.disabled,false,'existing draft requires update')
   await act(async()=>page.root.findByProps({'aria-label':'便签标题'}).props.onChange({target:{value:'Updated authorized note'}}))
   await act(async()=>{await button('保存便签').props.onClick()});await settle();assert.equal(submitted.at(-1),'update');assert.equal(page.root.findByType('fieldset').props.disabled,!actions.includes('create'),'cleared editor returns to new-draft rights')
  }
  if(actions.includes('archive')){await act(async()=>{await button('归档此便签').props.onClick()});await settle();assert.equal(submitted.at(-1),'archive')}
  assert.ok(submitted.every(action=>actions.includes(action)),'mounted UI submits only the exact granted mutation actions')
 }finally{await act(async()=>page?.unmount());views?.dispose();globalThis.fetch=previous;await f.close()}
})
