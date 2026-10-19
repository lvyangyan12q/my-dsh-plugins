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
 const native={agentPresets:{compositionInventory:async()=>[...presets.values()].map(row=>({id:row.id,rows:(row.plugins??[]).map(plugin=>({moduleName:plugin.name,enabled:true,fiberState:2}))})),list:async()=>[...presets.values()],resolve:async id=>{if(!presets.has(id))throw new Error('missing');return presets.get(id)},register:async row=>{presets.set(row.id,row);return async()=>presets.delete(row.id)},acquireScope:async()=>({key:{},[Symbol.asyncDispose]:async()=>{}})},skills:{snapshot:async()=>({complete:true,skills:[...skills.values()]}),get:async name=>skills.get(name),register:row=>{skills.set(row.name,row);return()=>skills.delete(row.name)}}}
 try{
 store=await RoleStore.open(join(dir,'roles.json'));capabilities=new CapabilityDirectory(store,native);await capabilities.restore()
 assert.deepEqual(await capabilities.list(),[])
 capabilities.contribute('reader',[{kind:'agent',id:'private',presetId:'reader.private',title:'Private',enabled:true,userInvocable:true}])
 assert.deepEqual(await capabilities.list(),[])
 await assert.rejects(()=>capabilities.validate({kind:'agent',source:'application',ownerAppId:'reader',id:'private'},'other'),/所有权/)
 const saved=await capabilities.save({kind:'agent',id:'helper',title:'Helper',content:'Be precise.',enabled:true,userInvocable:true,modelInvocable:false,skillIds:[],baseComposition:'workspace-basic-v1'},0)
 assert.equal(saved.source,'managed');assert.equal((await capabilities.list()).length,1)
 assert.equal((await capabilities.validate({kind:'agent',source:'managed',id:'helper'},'reader')).presetId,'worktable.managed.helper')
 await capabilities.save({...saved,enabled:false},saved.revision)
 await assert.rejects(()=>capabilities.validate({kind:'agent',source:'managed',id:'helper'},'reader'),/停用/)
 assert.equal((await capabilities.list()).length,1)
 }finally{await capabilities?.dispose();await store?.close();await rm(dir,{recursive:true,force:true})}
})
test('role automatic Skills require model permission, while explicit user lookup uses user permission',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-skill-invocation-'));let store,capabilities;const presets=new Map(),skills=new Map()
 const native={agentPresets:{compositionInventory:async()=>[...presets.values()].map(row=>({id:row.id,rows:(row.plugins??[]).map(plugin=>({moduleName:plugin.name,enabled:true,fiberState:2}))})),resolve:async id=>presets.get(id),register:async row=>{presets.set(row.id,row);return async()=>presets.delete(row.id)},acquireScope:async()=>({key:{},[Symbol.asyncDispose]:async()=>{}})},skills:{snapshot:async()=>({complete:true,skills:[...skills.values()]}),get:async name=>skills.get(name),register:row=>{skills.set(row.name,row);return()=>skills.delete(row.name)}}}
 try{
 store=await RoleStore.open(join(dir,'roles.json'));capabilities=new CapabilityDirectory(store,native)
 const skill=await capabilities.save({kind:'skill',id:'summary',title:'Summary',content:'Summarize.',enabled:true,userInvocable:true,modelInvocable:false},0)
 await capabilities.save({kind:'agent',id:'reader',title:'Reader',content:'Read.',enabled:true,userInvocable:true,modelInvocable:true,skillIds:['summary'],baseComposition:'workspace-basic-v1'},0)
 const reference={kind:'skill',source:'managed',id:'summary'},definition={agent:{kind:'agent',source:'managed',id:'reader'},creation:{cwd:dir}}
 await capabilities.validate(reference,'reader',dir,'user')
 await assert.rejects(()=>capabilities.validateRole(definition,'reader'),/模型调用/)
 await capabilities.save({...skill,userInvocable:false,modelInvocable:true},skill.revision)
 await capabilities.validateRole(definition,'reader')
 await assert.rejects(()=>capabilities.validate(reference,'reader',dir,'user'),/用户调用/)
 }finally{await capabilities?.dispose();await store?.close();await rm(dir,{recursive:true,force:true})}
})
test('legacy management records retain their old composition and require an explicit saved base selection before role use',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-legacy-base-'));let store,capabilities;const presets=new Map()
 const native={agentPresets:{compositionInventory:async()=>[...presets.values()].map(row=>({id:row.id,rows:(row.plugins??[]).map(plugin=>({moduleName:plugin.name,enabled:true,fiberState:2}))})),resolve:async id=>presets.get(id),register:async row=>{presets.set(row.id,row);return async()=>presets.delete(row.id)}},skills:{snapshot:async()=>({complete:true,skills:[]})}}
 try{
 store=await RoleStore.open(join(dir,'roles.json'))
 const old={kind:'agent',id:'reading-helper',presetId:'worktable.managed.reading-helper',title:'Reader',content:'Existing private instructions.',enabled:true,userInvocable:true,modelInvocable:true,skillIds:[],source:'managed',revision:1}
 await store.change(data=>{data.capabilities.push(old);return old})
 capabilities=new CapabilityDirectory(store,native);await capabilities.restore()
 assert.deepEqual(presets.get(old.presetId).plugins.map(row=>row.name),['@deepseek-ai/dsh-tool-skill','@deepseek-ai/dsh-persona'])
 assert.equal((await capabilities.list())[0].content,old.content)
 await assert.rejects(()=>capabilities.validate({kind:'agent',source:'managed',id:old.id},'reader'),/基础能力/)
 await assert.rejects(()=>capabilities.save({...old},old.revision),/显式选择/)
 const saved=await capabilities.save({...old,baseComposition:'workspace-basic-v1'},old.revision)
 assert.equal(saved.id,old.id);assert.equal(saved.content,old.content);assert.equal(saved.revision,2)
 assert.equal(presets.get(old.presetId).plugins.length,5)
 }finally{await capabilities?.dispose();await store?.close();await rm(dir,{recursive:true,force:true})}
})
test('a cwd-specific Skill provider mismatch never poisons the same managed Skill in another instance context',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-skill-context-'));let store,capabilities;const skills=new Map()
 const native={skills:{snapshot:async()=>({complete:true,skills:[...skills.values()]}),register:row=>{skills.set(row.name,row);return()=>skills.delete(row.name)},get:async(id,options)=>options.cwd==='bad-context'?{...skills.get(id),provider:'other-provider'}:skills.get(id)}}
 try{
 store=await RoleStore.open(join(dir,'roles.json'));capabilities=new CapabilityDirectory(store,native)
 await capabilities.save({kind:'skill',id:'summary',title:'Summary',content:'Summarize.',enabled:true,userInvocable:true,modelInvocable:true},0)
 const ref={kind:'skill',source:'managed',id:'summary'}
 await assert.rejects(()=>capabilities.validate(ref,'app','bad-context','user'),/来源不同/)
 await capabilities.validate(ref,'app','healthy-context','user')
 assert.equal((await capabilities.list())[0].unavailable,undefined)
 }finally{await capabilities?.dispose();await store?.close();await rm(dir,{recursive:true,force:true})}
})
