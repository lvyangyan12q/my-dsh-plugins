import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRoleAuthority} from '../01_content/src/framework/role-native.mjs'

test('native role creation preserves allocated ID and declared preset, attaches registered workspace and flushes before ready',async()=>{
 const order=[];const row={sessionId:'reserved',presetId:'worktable.managed.reader',creation:{cwd:'D:/work'}}
 const ctx={workspaceRegistry:{list:()=>[{id:'work',path:'D:/work',sessionIds:['reserved']}]},sessionController:{create:async request=>{order.push(request);return {sessionId:'reserved',agentPreset:row.presetId}},inspect:async()=>({meta:{cwd:'D:/work'}}),projections:async()=>({values:{agentPreset:row.presetId}})},sessionPersistence:{flush:async()=>order.push('flush')}}
 const authority=createRoleAuthority(ctx,{validateRole:async()=>({presetId:row.presetId})})
 assert.equal(await authority.create(row),'reserved')
 assert.deepEqual(order,[{sessionId:'reserved',agentPreset:row.presetId,workspaceId:'work'},'flush'])
 await authority.validateExisting(row)
 ctx.sessionController.projections=async()=>({values:{agentPreset:'other'}})
 await assert.rejects(()=>authority.validateExisting(row),/Agent/)
 ctx.sessionController.projections=async()=>null
 await assert.rejects(()=>authority.validateExisting(row),/缺失/)
})
