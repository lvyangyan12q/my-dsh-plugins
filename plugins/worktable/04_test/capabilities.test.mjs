import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {RoleStore} from '../01_content/src/framework/roles.mjs'
import {CapabilityDirectory} from '../01_content/src/framework/capabilities.mjs'

test('public capabilities come only from saved management records; private ownership and disabled invocation are enforced',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-capabilities-'));let store,capabilities
 const presets=new Map([['native-default',{id:'native-default'}],['reader.private',{id:'reader.private'}]])
 const skills=new Map()
 const native={agentPresets:{list:async()=>[...presets.values()],resolve:async id=>{if(!presets.has(id))throw new Error('missing');return presets.get(id)},register:async row=>{presets.set(row.id,row);return async()=>presets.delete(row.id)},acquireScope:async()=>({key:{},[Symbol.asyncDispose]:async()=>{}})},skills:{snapshot:async()=>({complete:true,skills:[...skills.values()]}),get:async name=>skills.get(name),register:row=>{skills.set(row.name,row);return()=>skills.delete(row.name)}}}
 try{
 store=await RoleStore.open(join(dir,'roles.json'));capabilities=new CapabilityDirectory(store,native);await capabilities.restore()
 assert.deepEqual(await capabilities.list(),[])
 capabilities.contribute('reader',[{kind:'agent',id:'private',presetId:'reader.private',title:'Private',enabled:true,userInvocable:true}])
 assert.deepEqual(await capabilities.list(),[])
 await assert.rejects(()=>capabilities.validate({kind:'agent',source:'application',ownerAppId:'reader',id:'private'},'other'),/所有权/)
 const saved=await capabilities.save({kind:'agent',id:'helper',title:'Helper',content:'Be precise.',enabled:true,userInvocable:true,modelInvocable:false,skillIds:[]},0)
 assert.equal(saved.source,'managed');assert.equal((await capabilities.list()).length,1)
 assert.equal((await capabilities.validate({kind:'agent',source:'managed',id:'helper'},'reader')).presetId,'worktable.managed.helper')
 await capabilities.save({...saved,enabled:false},saved.revision)
 await assert.rejects(()=>capabilities.validate({kind:'agent',source:'managed',id:'helper'},'reader'),/停用/)
 assert.equal((await capabilities.list()).length,1)
 }finally{await capabilities?.dispose();await store?.close();await rm(dir,{recursive:true,force:true})}
})
