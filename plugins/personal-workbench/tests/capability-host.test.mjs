import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve,join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { installCapabilities } from '../src/capability-host.ts'
import { RoleBindings } from '../src/role-bindings.ts'
const source=process.env.DSH_SOURCE;assert.ok(source)
const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json'));const {Context}=require('@deepseek-ai/cordis')
const built=path=>import(pathToFileURL(resolve(source,path,'lib/index.js')).href)
const {default:Storage}=await built('packages/storage/storage');const {JsonStorageBackend}=await built('packages/storage/storage-json');const {DomainFacility}=await built('packages/storage/storage-domain')
const {SkillRegistry}=await built('packages/skill/skill')
const skill={name:'shared-proof',description:'Check a reusable capability',content:'Check the evidence before answering.',modelInvocable:true,userInvocable:true}
const agent={id:'shared-proof-agent',name:'Shared proof Agent',description:'Evidence review',persona:'Review evidence.',skillNames:[skill.name],modelInvocable:true,userInvocable:true}
async function fixture(root,applicationRoles=[]){
 const ctx=new Context();await ctx.plugin(Storage);await ctx.plugin(SkillRegistry)
 ctx.storage.backend.register('json',new JsonStorageBackend(root));const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility)
 const presets=new Map(applicationRoles.map(role=>[role.presetId,{id:role.presetId,name:role.key.roleId}])),tools=new Map(),listeners=new Map();let created,disposed=0,blocked=false
 const authority={storageDomain:facility,skills:ctx.skills,personalWorkbenchBindings:{listRoles:()=>applicationRoles,setPreset:async()=>{throw new Error('unused')}},
 agentPresets:{list:async()=>[...presets.values()].map(({id,name,description})=>({id,name,description})),register:async definition=>{assert.equal(definition.plugins[0].name,'@deepseek-ai/dsh-tool-skill');assert.equal(definition.id,'my-dsh.shared-proof-agent');presets.set(definition.id,definition);return async()=>{presets.delete(definition.id)}},mount:async()=>{},composedPreset:()=>undefined},
 tools:{register:tool=>{tools.set(tool.name,tool);return()=>tools.delete(tool.name)}},on:(name,fn)=>{listeners.set(name,fn);return()=>listeners.delete(name)},sessionController:{create:async request=>({sessionId:'opened',agentPreset:request.agentPreset})},
 agents:{create:async options=>{created=options;const events=[{type:'turn/end',seq:0,time:0,data:{turn:1,reason:{kind:blocked?'blocked':'completed'}}}];const child={id:options.sessionId,session:{append:()=>{},snapshotEvents:()=>events},followup:message=>{assert.equal(message.content[0].text,'inspect evidence')},cancel:()=>{},whenIdle:async()=>{}};await options.setup({},child);return {agent:child,dispose:async()=>{disposed++}}}}
 }
 const parent={id:'parent-proof',ctx:{agents:authority.agents,get:()=>undefined},options:{},session:{requestHeader:()=>undefined,header:{id:'parent-proof',cwd:'C:/proof',delegationDepth:0}}}
 const owner=await installCapabilities(authority)
 return {ctx,owner,tools,parent,presets,get created(){return created},get disposed(){return disposed},block:()=>{blocked=true},close:async()=>{await owner.dispose();await ctx.fiber.dispose()}}
}
test('independent Skills/Agents persist, share native registrations, reject stale writes and prevent deleting used Skills',async()=>{
 const root=await mkdtemp(join(tmpdir(),'capability-proof-'));let f
 try{f=await fixture(root);await f.owner.dispatch({action:'skill-save',skill,expectedRevision:0});assert.equal((await f.ctx.skills.get(skill.name)).content,skill.content)
 await f.owner.dispatch({action:'agent-save',agent,expectedRevision:0});assert.equal((await f.owner.catalog())[0].presetId,'my-dsh.shared-proof-agent');assert.deepEqual(f.owner.agentSkills('my-dsh.shared-proof-agent'),[skill.name])
 await assert.rejects(f.owner.dispatch({action:'agent-save',agent,expectedRevision:0}),/changed/)
 await assert.rejects(f.owner.dispatch({action:'skill-remove',name:skill.name,expectedRevision:1}),/used/)
 await f.close();f=await fixture(root);assert.equal((await f.ctx.skills.get(skill.name)).content,skill.content);assert.equal((await f.owner.catalog())[0].revision,1)
 const opened=await f.owner.dispatch({action:'agent-open',id:agent.id});assert.equal(opened.agentPreset,'my-dsh.shared-proof-agent')
 }finally{await f?.close();await rm(root,{recursive:true,force:true})}
})
test('Agent library is owned by saved records rather than native or application preset inventories',async()=>{
 const root=await mkdtemp(join(tmpdir(),'capability-private-'));let f
 const privateRole={key:{appId:'kaogong',instanceId:'default',roleId:'teacher'},presetId:'kaogong.teacher.data-analysis.v1'}
 const roles=[privateRole]
 try{
   f=await fixture(root,roles)
   f.presets.set('native-default',{id:'native-default',name:'Native default'})
   assert.deepEqual(await f.owner.catalog(),[])
   await assert.rejects(f.owner.dispatch({action:'agent-open',id:privateRole.presetId}),/Managed Agent unavailable/)
   await assert.rejects(f.owner.dispatch({action:'agent-open',id:'native-default'}),/Managed Agent unavailable/)
   assert.equal(f.created,undefined)
   await f.owner.dispatch({action:'skill-save',skill,expectedRevision:0})
   await f.owner.dispatch({action:'agent-save',agent,expectedRevision:0})
   roles.push({key:{appId:'other-app',instanceId:'default',roleId:'helper'},presetId:'my-dsh.shared-proof-agent'})
   const rows=await f.owner.catalog()
   assert.equal(rows.length,1)
   assert.equal(rows[0].id,agent.id)
   assert.equal(rows[0].managed,true)
   assert.deepEqual(rows[0].appIds,['other-app'])
   const opened=await f.owner.dispatch({action:'agent-open',id:agent.id})
   assert.equal(opened.agentPreset,'my-dsh.shared-proof-agent')
 }finally{await f?.close();await rm(root,{recursive:true,force:true})}
})
test('model Agent dispatch uses selected native preset, reports actual outcome, releases child and persists execution history',async()=>{
 const root=await mkdtemp(join(tmpdir(),'capability-exec-'));let f
 try{f=await fixture(root);await f.owner.dispatch({action:'skill-save',skill,expectedRevision:0});await f.owner.dispatch({action:'agent-save',agent,expectedRevision:0})
 const tool=f.tools.get('run_agent');const result=await tool.execute({id:agent.id,prompt:'inspect evidence'},{agent:f.parent,signal:new AbortController().signal});assert.ok(JSON.parse(result).sessionId);assert.equal(f.created.meta.agentPreset,'my-dsh.shared-proof-agent');assert.equal(f.created.meta.parentSession,'parent-proof');assert.equal(f.disposed,1);assert.equal(f.owner.history()[0].status,'completed')
 f.block();await assert.rejects(tool.execute({id:agent.id,prompt:'inspect evidence'},{agent:f.parent,signal:new AbortController().signal}),/did not complete/);assert.equal(f.disposed,2);assert.equal(f.owner.history()[0].status,'failed')
 await f.owner.dispatch({action:'agent-save',agent:{...agent,modelInvocable:false},expectedRevision:1});await assert.rejects(tool.execute({id:agent.id,prompt:'inspect evidence'},{agent:f.parent,signal:new AbortController().signal}),/disabled/);assert.equal(f.disposed,2)
 await f.close();f=await fixture(root);assert.equal(f.owner.history().length,2);assert.ok(f.tools.has('list_capabilities'))
 }finally{await f?.close();await rm(root,{recursive:true,force:true})}
})
test('explicit Agent rebinding preserves previous native sessions, survives reopening and rejects stale binding selectors',async()=>{
 const records=new Map();let number=0
 const table={get:key=>records.get(key),put:async(key,value)=>records.set(key,value)}
 const authority={validate:async()=>{},validateExisting:async()=>{},create:async record=>record.sessionId}
 const key={appId:'app-one',instanceId:'default',roleId:'advisor'}
 const make=()=>{const bindings=new RoleBindings(table,authority,()=>`session-${++number}`);bindings.registerRole({key,presetId:'original',creation:{cwd:'C:/proof'}});return bindings}
 let bindings=make();const original=await bindings.ensure(key);const selected=await bindings.setPreset(key,'my-dsh.shared-proof-agent',original.sessionId);assert.notEqual(selected.sessionId,original.sessionId);assert.deepEqual(selected.previousSessionIds,[original.sessionId]);assert.equal(bindings.definition(key).presetId,selected.presetId)
 await assert.rejects(bindings.setPreset(key,'other',original.sessionId),/changed/);await bindings.dispose();bindings=make();assert.equal((await bindings.ensure(key)).sessionId,selected.sessionId);await bindings.dispose()
})
