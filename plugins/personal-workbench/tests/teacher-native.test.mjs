import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {runInNewContext} from 'node:vm'
import {TeacherWindow} from '../src/teacher-window.ts'
const ID='durable-reading-reviewer'
async function nativeFixture(){
 const source=process.env.DSH_SOURCE;assert.ok(source)
 const require=createRequire(resolve(source,'packages/api/session-controller/package.json'))
 const {Context}=require('@deepseek-ai/cordis')
 const libs=new Map()
 for(const [id,path]of [['@deepseek-ai/dsh-api-gateway/client','packages/api/gateway/lib/client.js'],['native','packages/api/session-controller/lib/client.js']]){
  let api;runInNewContext(await readFile(resolve(source,path),'utf8'),{console,AbortController,AbortSignal,queueMicrotask,setTimeout,clearTimeout,window:{__ModuleLoader__:{load:({factory})=>api=factory(name=>libs.get(name)??require(name))}}});libs.set(id,api)
 }
 const root=new Context(),history=[],listeners=new Set(),gates=[];let finishList
 const list=new Promise(resolve=>finishList=resolve)
 const generation={getSnapshot:()=>undefined,subscribe:()=>()=>{}}
 const remote={$on:()=>()=>{},$stream:options=>new (libs.get('@deepseek-ai/dsh-api-gateway/client').RemoteStream)({generation},options),session:{list:()=>list,async *follow(request,signal){
  history.push(request.address)
  const gate=gates.shift()
  if(gate)await new Promise(resolve=>{gate.then(resolve);if(signal.aborted)resolve();else signal.addEventListener('abort',resolve,{once:true})})
  if(signal.aborted)return
  yield {type:'snapshot',header:{version:1,id:ID,createdAt:0,isSeeded:false},cursor:-1,records:[],hasMore:false,projections:{asOfSeq:-1,values:{}},assistantStream:{revision:0}}
  await new Promise(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',resolve,{once:true})})
 }},commands:{},subagents:{}}
 root.reflect.provide('remote',remote);root.reflect.provide('connection',{generation});root.reflect.provide('typert',{contexts:{registerClient:()=>{}}})
 libs.get('native').apply(root)
 const workspaces={getSnapshot:()=>({phase:'ready',state:'idle',archivedSessionIds:[]}),subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}}
 const owner=new TeacherWindow(root.sessions,async()=>ID,workspaces)
 return {root,owner,history,holdHistory:()=>{let release;gates.push(new Promise(resolve=>release=resolve));return release},finishList:(items=[{sessionId:ID,running:false,blank:false,agentAvailable:true,updatedAt:1}])=>finishList({ok:true,value:{items}})}
}
test('real native catalog hydration opens existing durable role on first gesture without retry or replacement',async()=>{
 const f=await nativeFixture()
 try{
  const baseline=f.root.sessions.refresh(),opening=f.owner.open()
  await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(f.owner.getSnapshot().phase,'loading')
  assert.deepEqual(f.history,[])
  f.finishList();await baseline;await opening
  assert.equal(f.owner.getSnapshot().phase,'open')
  assert.equal(f.owner.getSnapshot().reference.sessionId,ID)
  assert.deepEqual(JSON.parse(JSON.stringify(f.history)),[{kind:'session',sessionId:ID}])
 }finally{f.finishList();f.owner.dispose();await f.root.fiber.dispose()}
})

test('real native catalog absence stays unavailable and never creates a substitute Session',async()=>{
 const f=await nativeFixture()
 try{const opening=f.owner.open();f.finishList([]);await opening;assert.equal(f.owner.getSnapshot().phase,'error');assert.deepEqual(f.history,[])}
 finally{f.finishList();f.owner.dispose();await f.root.fiber.dispose()}
})
test('close while the real native catalog initializes abandons only this window and never opens history later',async()=>{
 const f=await nativeFixture()
 try{const opening=f.owner.open();await new Promise(resolve=>setTimeout(resolve,0));f.owner.close();await opening;f.finishList();await f.root.sessions.refresh();assert.equal(f.owner.getSnapshot().phase,'closed');assert.deepEqual(f.history,[])}
 finally{f.finishList();f.owner.dispose();await f.root.fiber.dispose()}
})

test('real native reference initial ready can settle during superseding address hydration; same generation opens naturally',async()=>{
 const f=await nativeFixture();let releaseFirst,releaseNext,extra
 try{
  f.finishList();await f.root.sessions.refresh()
  releaseFirst=f.holdHistory();const opening=f.owner.open()
  for(let i=0;i<30&&!f.history.length;i++)await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(f.history.length,1)
  const binding=f.root.sessions.binding(ID)
  releaseNext=f.holdHistory()
  extra=f.root.sessions.retain({parentSessionId:'parent',childSessionId:ID,mode:'continuable'},{source:'personalWorkbenchTeacher'})
  for(let i=0;i<30&&f.history.length<2;i++)await new Promise(resolve=>setTimeout(resolve,0))
  await extra.ready
  assert.equal(binding.session.getSnapshot().openState,'loading')
  assert.equal(f.owner.getSnapshot().phase,'loading')
  assert.equal(f.root.sessions.binding(ID),binding)
  releaseNext();await opening
  assert.equal(f.owner.getSnapshot().phase,'open')
  assert.equal(f.owner.getSnapshot().reference.binding,binding)
  assert.equal(f.owner.getSnapshot().reference.sessionId,ID)
 }finally{releaseFirst?.();releaseNext?.();extra?.release();f.finishList();f.owner.dispose();await f.root.fiber.dispose()}
})
