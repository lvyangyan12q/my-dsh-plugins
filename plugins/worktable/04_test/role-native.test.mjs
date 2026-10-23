import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,mkdir,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRoleAuthority} from '../01_content/src/framework/role-native.mjs'

test('native role creation preserves allocated ID and declared preset, attaches registered workspace and flushes before ready',async()=>{
 let stored;const order=[];const row={sessionId:'reserved',presetId:'worktable.managed.reader',creation:{cwd:'D:/work'}}
 const ctx={workspaceRegistry:{list:()=>[{id:'work',path:'D:/work',sessionIds:['reserved']}]},sessionController:{create:async request=>{order.push(request);stored={header:{id:'reserved',cwd:'D:/work'}};return {sessionId:'reserved',agentPreset:row.presetId}},projections:async()=>({kind:'sequenced',values:{agentPreset:row.presetId}})},sessionPersistence:{stat:async()=>stored,flush:async()=>order.push('flush')}}
 const authority=createRoleAuthority(ctx,{validateRole:async()=>({presetId:row.presetId})})
 assert.equal(await authority.create(row),'reserved')
 assert.deepEqual(order,[{sessionId:'reserved',agentPreset:row.presetId,workspaceId:'work'},'flush'])
 await authority.validateExisting(row)
 ctx.sessionController.projections=async()=>({kind:'sequenced',values:{agentPreset:'other'}})
 await assert.rejects(()=>authority.validateExisting(row),/Agent/)
 ctx.sessionController.projections=async()=>null
 await assert.rejects(()=>authority.validateExisting(row),/缺失/)
})

const binding={sessionId:'reserved',presetId:'reader',creation:{cwd:'D:/work'}}
function nativeFixture(){
 const state={stored:{header:{id:'reserved',cwd:'D:/work'}},projection:{kind:'sequenced',values:{agentPreset:'reader'}},workspace:{id:'work',path:'D:/work',sessionIds:['reserved']},created:0}
 state.ctx={workspaceRegistry:{list:()=>[state.workspace]},sessionPersistence:{stat:async()=>state.stored,flush:async()=>{}},sessionController:{projections:async()=>state.projection,create:async()=>{state.created++;return {sessionId:'reserved',agentPreset:'reader'}}}}
 state.authority=createRoleAuthority(state.ctx,{validateRole:async()=>({presetId:'reader'})});return state
}
test('migration hints are refused before checking a cached Agent and never recreate history',async()=>{
 const f=nativeFixture();f.projection={kind:'migration-required',values:{agentPreset:'stale'}}
 await assert.rejects(()=>f.authority.validateExisting(binding),{code:'session-migration-required'})
 assert.equal(f.created,0)
})

test('explicit recovery validates the reserved identity without issuing create',async()=>{
 const f=nativeFixture()
 assert.equal(await f.authority.recoverCreation(binding),'reserved')
 assert.equal(f.created,0)
 f.stored=undefined;f.projection=null
 await assert.rejects(()=>f.authority.recoverCreation(binding),{code:'creation-unknown'})
 assert.equal(f.created,0)
})

for(const [name,change,code] of [
 ['missing header',f=>{f.stored=undefined},'session-missing'],
 ['wrong stored identity',f=>{f.stored.header.id='different'},'native-identity'],
 ['header requires migration',f=>{f.stored.formatStatus='migration-required'},'session-migration-required'],
 ['changed preset',f=>{f.projection.values.agentPreset='other'},'agent-changed'],
 ['changed directory',f=>{f.stored.header.cwd='D:/other'},'workspace-changed'],
 ['missing workspace membership',f=>{f.workspace.sessionIds=[]},'workspace-membership'],
 ['missing registered workspace',f=>{f.workspace.path='D:/other'},'workspace-unavailable']
])test(`existing role rejects ${name} without creation`,async()=>{
 const f=nativeFixture();change(f)
 await assert.rejects(()=>f.authority.validateExisting(binding),{code});assert.equal(f.created,0)
})
test('first creation refuses a conflicting ID before invoking native create',async()=>{
 const f=nativeFixture()
 await assert.rejects(()=>f.authority.create(binding),{code:'native-conflict'});assert.equal(f.created,0)
})
for(const [name,create,code] of [
 ['different returned ID',async()=>({sessionId:'unexpected',agentPreset:'reader'}),'native-identity'],
 ['different returned preset',async()=>({sessionId:'reserved',agentPreset:'other'}),'native-identity'],
 ['lost create reply',async()=>{throw new Error('transport lost')},'creation-unknown']
])test(`creation ${name} is refused without a fallback create`,async()=>{
 const f=nativeFixture();f.stored=undefined;let calls=0
 f.ctx.sessionController.create=async()=>{calls++;return create()}
 await assert.rejects(()=>f.authority.create(binding),{code});assert.equal(calls,1)
})
test('registered directory aliases must resolve to the same real directory without rewriting the Session header',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-role-alias-'))
 try{
  const actual=join(dir,'actual'),alias=join(dir,'alias');await mkdir(actual);await symlink(actual,alias,process.platform==='win32'?'junction':'dir')
  const f=nativeFixture();f.workspace.path=actual;f.stored.header.cwd=actual
  await f.authority.validateExisting({...binding,creation:{cwd:alias}})
  assert.equal(f.stored.header.cwd,actual)
 }finally{await rm(dir,{recursive:true,force:true})}
})
