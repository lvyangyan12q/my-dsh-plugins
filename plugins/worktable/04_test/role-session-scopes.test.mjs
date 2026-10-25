import assert from 'node:assert/strict'
import {test} from 'node:test'
import {RoleSessionScopes} from '../01_content/src/framework/role-session-scopes.mjs'

function fixture(){
 const scopes=new RoleSessionScopes(),effects=[],agent={ctx:{on(){},effect(install){effects.push(install())}}}
 let mounts=0,removals=0,validations=0
 const withdraw=scopes.contribute('app',{
  prepare(){assert.fail('Only the actual Agent mount path is under test')},
  async mount(){mounts++;if(mounts>1)throw Error('deployment:persona-prefix is already registered');await Promise.resolve();return()=>{removals++}},
 })
 const binding={appId:'app',instanceId:'one',roleId:'teacher',sessionId:'session-one',presetId:'standard',creation:{cwd:'/workspace'},agent:{source:'application',id:'teacher'}}
 return {scopes,agent,binding,withdraw,effects,mount:b=>scopes.mount({},b,{},agent,async()=>{validations++},async()=>{}),counts:()=>({mounts,removals,validations})}
}

test('concurrent same-Agent mounts install one private provider and validate the queued reuse',async()=>{
 const f=fixture()
 try{
  await Promise.all([f.mount(f.binding),f.mount(structuredClone(f.binding))])
  assert.deepEqual(f.counts(),{mounts:1,removals:0,validations:2})
  await f.withdraw()
  assert.deepEqual(f.counts(),{mounts:1,removals:1,validations:2})
 }finally{await f.scopes.close();for(const dispose of f.effects)await dispose()}
})

test('a queued different binding cannot reuse the Agent mounted by the first operation',async()=>{
 const f=fixture()
 try{
  const values=await Promise.allSettled([f.mount(f.binding),f.mount({...f.binding,instanceId:'other',sessionId:'session-two'})])
  assert.equal(values[0].status,'fulfilled');assert.equal(values[1].status,'rejected')
  assert.equal(values[1].reason.code,'session-scope-changed')
  assert.deepEqual(f.counts(),{mounts:1,removals:0,validations:1})
 }finally{await f.withdraw();await f.scopes.close();for(const dispose of f.effects)await dispose()}
})
