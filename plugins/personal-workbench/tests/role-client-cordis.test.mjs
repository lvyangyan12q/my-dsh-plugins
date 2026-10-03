import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {RoleClient} from '../src/role-client.ts'

test('real Cordis session scope declares conversation dependency and retains exact command lease through send',async()=>{
 const source=process.env.DSH_SOURCE;assert.ok(source)
 const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json'))
 const {Context,Service}=require('@deepseek-ai/cordis')
 const {createScope,scopeOf}=await import(pathToFileURL(resolve(source,'packages/core/scope/lib/index.js')).href)
 const root=new Context(),sent=[],released=[];let settle
 const waiting=new Promise(resolve=>settle=resolve)
 class Conversation extends Service {constructor(ctx){super(ctx,'conversation')} async send(text){sent.push({id:scopeOf(this.ctx),text});await waiting}}
 let provider=root.plugin(Conversation);await provider
 let scope
 const mint=root.plugin(child=>{scope=createScope(child,'exact-role-session')});await mint
 assert.throws(()=>scope.ctx.conversation,/without inject/,'native binding inherits minting plugin dependency API')
 const binding={session:{getSnapshot:()=>({openState:'open',removed:false}),subscribe:()=>()=>{}},ctx:scope.ctx}
 const ctx={workspaces:{list:{getSnapshot:()=>({phase:'ready',state:'idle',archivedSessionIds:[]}),subscribe:()=>()=>{}}},sessions:{
 retain(id){return {sessionId:id,binding,ready:Promise.resolve(binding),release:()=>released.push(id)}},
 async using(id,options,action){const ref=this.retain(id);try{return await action(ref)}finally{ref.release()}}
 }}
 const key={appId:'reading',instanceId:'one',roleId:'reviewer'}
 const owner=new RoleClient(ctx,async()=>({ok:true,json:async()=>({binding:{version:1,key,sessionId:'exact-role-session',presetId:'reviewer',phase:'ready',previousSessionIds:[]}})}))
 try {
  const command=owner.send(key,'edited context')
  // Capture failure immediately so the red case has no unhandled rejection.
  let failure;command.catch(error=>failure=error)
  for(let i=0;i<20&&!sent.length&&!failure;i++)await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(failure,undefined)
  assert.deepEqual(sent,[{id:'exact-role-session',text:'edited context'}])
  owner.teacher.close();assert.equal(released.length,1,'only UI hold releases during pending command')
  await provider.dispose();provider=root.plugin(Conversation);await provider
  await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(sent.length,1,'dependency re-admission cannot replay an in-flight send')
  settle();await command;assert.equal(released.length,2)
  await provider.dispose()
  await assert.rejects(owner.send(key,'missing service'),/conversation service unavailable/)
  assert.equal(sent.length,1);assert.equal(released.length,3,'unavailable dependency releases the command hold')
 }finally{settle();owner.dispose();await scope.dispose();await mint.dispose();await provider.dispose();await root.fiber.dispose()}
})
