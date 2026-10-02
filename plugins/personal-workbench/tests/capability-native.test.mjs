import { Readable } from 'node:stream'
import { installRoles } from '../src/role-host.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve,join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { installCapabilities } from '../src/capability-host.ts'
import { installAssignmentRuntime } from '../src/management-runtime.ts'
const source=process.env.DSH_SOURCE;assert.ok(source)
const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json'));const {Context}=require('@deepseek-ai/cordis')
const built=path=>import(pathToFileURL(resolve(source,path,'lib/index.js')).href)
const {MockAdapter,textResponse}=await import(pathToFileURL(resolve(source,'packages/core/agent-loop/tests/mock-adapter.ts')).href)
const {default:JsonlPersistence}=await built('packages/session/session-persistence-jsonl')
const {default:Storage}=await built('packages/storage/storage');const {JsonStorageBackend}=await built('packages/storage/storage-json');const {DomainFacility}=await built('packages/storage/storage-domain')
const {SkillRegistry}=await built('packages/skill/skill');const {default:LLM,ToolCallId,createUserMessage}=await built('packages/llm/llm');const {default:Sessions,SessionId}=await built('packages/core/session');const {default:Projection}=await built('packages/session/session-projection');const {default:Prompt}=await built('packages/core/system-prompt');const {default:Tools}=await built('packages/core/tools');const {default:Agents}=await built('packages/core/agent');const {default:Loop}=await built('packages/core/agent-loop');const {default:Presets}=await built('packages/preset/agent-preset-registry')
const Loader=(await import(pathToFileURL(createRequire(resolve(source,'packages/preset/agent-preset-registry/package.json')).resolve('@deepseek-ai/cordis-plugin-loader')).href)).default
const Group=(await import(pathToFileURL(createRequire(resolve(source,'packages/preset/agent-preset-registry/package.json')).resolve('@deepseek-ai/cordis-plugin-group')).href)).default

test('official native Agent loop composes reusable preset, discovers tools, loads assigned Skill, inherits delegation policies and records durable success',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-capabilities-'));const ctx=new Context();let owner,removeRuntime,parentHandle
 try{
  ctx.baseUrl=pathToFileURL(resolve(import.meta.dirname,'../../../package.json')).href
  await ctx.plugin(Loader);ctx.loader.builtins.group=Group
  await ctx.plugin(LLM);await ctx.plugin(Sessions);await ctx.plugin(Projection);await ctx.plugin(Prompt,{personaPrefix:''});await ctx.plugin(Tools);await ctx.plugin(Agents);await ctx.plugin(Loop,{agents:[]});await ctx.plugin(SkillRegistry);await ctx.plugin(Presets,{default:'native-proof-parent'})
  await ctx.plugin(Storage);ctx.storage.backend.register('json',new JsonStorageBackend(root));const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility)
  const services=ctx.plugin({apply:child=>{child.effect(()=>child.reflect.provide('storageDomain',facility));child.effect(()=>child.reflect.provide('personalWorkbenchBindings',{listRoles:()=>[],read:async()=>null}));child.effect(()=>child.reflect.provide('sessionController',{projections:async()=>null}))}});await services
  owner=await installCapabilities(ctx);removeRuntime=installAssignmentRuntime(ctx,()=>undefined,id=>owner.agentSkills(id))
  await owner.dispatch({action:'skill-save',expectedRevision:0,skill:{name:'native-proof',description:'Native evidence proof',content:'Native proof instructions: verify before answering.',modelInvocable:true,userInvocable:true}})
  await owner.dispatch({action:'agent-save',expectedRevision:0,agent:{id:'native-proof',name:'Native proof',description:'Reusable',persona:'You inspect evidence.',skillNames:['native-proof'],modelInvocable:true,userInvocable:true}})
  let childHeader;const childEvents=[];ctx.on('agent/created',({agent})=>{if(agent.session.header.parentSession){childHeader=agent.session.header;childEvents.push(...agent.session.snapshotEvents())}});const adapter=new MockAdapter([textResponse('Verified by reusable Agent'),'hang']);ctx.llm.registerAdapter(['mock'],adapter)
  parentHandle=await ctx.agents.create({sessionId:SessionId('native-capability-parent'),meta:{cwd:root},agentOptions:{provider:'mock',model:'mock'}})
  const parent=parentHandle.agent
  const scopeServices=parent.ctx.plugin({apply:child=>{child.effect(()=>child.reflect.provide('sandboxPolicy',{overrideOf:()=> 'workspace-write'}));child.effect(()=>child.reflect.provide('approval',{overrideOf:()=> 'ask'}))}});await scopeServices
  assert.ok(ctx.tools.schemas(parent).some(row=>row.name==='run_agent'))
  const result=await ctx.tools.execute({name:'run_agent',arguments:{id:'native-proof',prompt:'inspect evidence'},callId:ToolCallId('native-capability-call'),agent:parent,signal:new AbortController().signal})
  assert.equal(result.isError,false,JSON.stringify(result.content));assert.equal(owner.history()[0].status,'completed');assert.equal(adapter.requests.length,1)
  const messages=adapter.requests[0].messages;assert.match(JSON.stringify(messages),/Native proof instructions/);assert.match(JSON.stringify(messages),/You inspect evidence/)
  assert.ok(adapter.requests[0].tools.some(row=>row.name==='skill'));assert.ok(adapter.requests[0].tools.some(row=>row.name==='list_capabilities'))
  const childId=owner.history()[0].childSessionId;assert.equal(ctx.agents.get(childId),undefined,'child must be disposed quiescently')
  const events=childEvents;assert.ok(events.some(row=>row.type==='sandbox/mode'&&row.data.mode==='workspace-write'));assert.ok(events.some(row=>row.type==='approval/policy'&&row.data.policy==='never'));assert.equal(childHeader.agentPreset,'my-dsh.native-proof')

  const saved=(await owner.catalog()).find(row=>row.id==='native-proof')
  await owner.dispatch({action:'agent-save',expectedRevision:1,agent:{id:saved.id,name:saved.name,description:saved.description,persona:saved.persona,skillNames:saved.skillNames,userInvocable:true,modelInvocable:false}})
  const denied=await ctx.tools.execute({name:'run_agent',arguments:{id:'native-proof',prompt:'inspect evidence'},callId:ToolCallId('disabled-proof'),agent:parent,signal:new AbortController().signal})
  assert.equal(denied.isError,true);assert.equal(owner.history().length,1);assert.equal(adapter.requests.length,1)
  await owner.dispatch({action:'agent-save',expectedRevision:2,agent:{id:saved.id,name:saved.name,description:saved.description,persona:saved.persona,skillNames:saved.skillNames,userInvocable:true,modelInvocable:true}})
  const cancel=new AbortController();const running=ctx.tools.execute({name:'run_agent',arguments:{id:'native-proof',prompt:'inspect evidence'},callId:ToolCallId('cancel-proof'),agent:parent,signal:cancel.signal})
  for(let attempt=0;adapter.requests.length<2&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal(adapter.requests.length,2,'native hanging model request must be live before cancellation');cancel.abort(new Error('test cancellation'));const cancelled=await running
  assert.equal(cancelled.isError,true);assert.equal(owner.history()[0].status,'cancelled');assert.equal(ctx.agents.get(owner.history()[0].childSessionId),undefined)
  await owner.dispose();owner=await installCapabilities(ctx);assert.equal(owner.history().length,2);assert.ok(owner.history().some(row=>row.status==='completed'));assert.ok(owner.history().some(row=>row.status==='cancelled'))
 }finally{await parentHandle?.dispose();await removeRuntime?.();await owner?.dispose();await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})}
})






test('application teacher reuses independent Agent while preserving original native conversation and scoped packaged teaching rules',async()=>{
 const root=await mkdtemp(join(tmpdir(),'reusable-teacher-'));const ctx=new Context();let capabilities,roles,removeRuntime;const handles=[]
 try{
  ctx.baseUrl=pathToFileURL(resolve(import.meta.dirname,'../../../package.json')).href
  await ctx.plugin(Loader);ctx.loader.builtins.group=Group
  await ctx.plugin(LLM);await ctx.plugin(Sessions);await ctx.plugin(Projection);await ctx.plugin(Prompt,{personaPrefix:''});await ctx.plugin(Tools);await ctx.plugin(Agents);await ctx.plugin(Loop,{agents:[]});await ctx.plugin(SkillRegistry);await ctx.plugin(Presets,{default:'app-teacher'})
  await ctx.plugin(Storage);ctx.storage.backend.register('json',new JsonStorageBackend(root));const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility)
  await ctx.plugin(JsonlPersistence,{root:join(root,'sessions')})
  const services=ctx.plugin({apply:child=>{
    child.effect(()=>child.reflect.provide('storageDomain',facility));child.effect(()=>child.reflect.provide('connection',{requestRejection:()=>undefined}));
    child.effect(()=>child.reflect.provide('sessionController',{
      projections:async({sessionId})=>{const agent=ctx.agents.get(sessionId);return agent?{values:{agentPreset:agent.session.header.agentPreset}}:null},
      create:async(request)=>{const handle=await ctx.agents.create({sessionId:request.sessionId,meta:{cwd:request.cwd,agentPreset:request.agentPreset},agentOptions:{provider:'mock',model:'mock'},setup:async childCtx=>{await ctx.agentPresets.mount(childCtx,request.agentPreset)}});handles.push(handle);return {sessionId:handle.agent.id,agentPreset:request.agentPreset}},
    }))
  }});await services
  await ctx.agentPresets.register({id:'app-teacher',plugins:[{name:pathToFileURL(resolve(import.meta.dirname,'fixtures/reusable-teaching.mjs')).href},{name:'@deepseek-ai/dsh-tool-skill'}]})
  const adapter=new MockAdapter([textResponse('Original lesson retained'),textResponse('Reused Agent teaching response')]);ctx.llm.registerAdapter(['mock'],adapter)
  roles=await installRoles(ctx);capabilities=await installCapabilities(ctx);removeRuntime=installAssignmentRuntime(ctx,()=>undefined,id=>capabilities.agentSkills(id))
  await capabilities.dispatch({action:'agent-save',expectedRevision:0,agent:{id:'shared-teacher',name:'Reusable teacher',description:'Cross app teacher',persona:'You are the independently managed teacher.',skillNames:[],modelInvocable:true,userInvocable:true}})
  const key={appId:'proof-app',instanceId:'default',roleId:'teacher',subject:'math'}
  ctx.personalWorkbenchBindings.registerRole({key,presetId:'app-teacher',creation:{cwd:root},teaching:{skillName:'app-teaching-proof',provider:'app-proof-provider'}})
  const original=await ctx.personalWorkbenchBindings.ensure(key);const originalAgent=ctx.agents.get(original.sessionId);originalAgent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'/app-teaching-proof old lesson'}]}));await originalAgent.whenIdle();const originalEvents=JSON.stringify(originalAgent.session.snapshotEvents())
  const {binding}=await capabilities.dispatch({action:'agent-bind',key,agentId:'shared-teacher',expectedSessionId:original.sessionId});assert.notEqual(binding.sessionId,original.sessionId);assert.deepEqual(binding.previousSessionIds,[original.sessionId]);assert.equal(JSON.stringify(originalAgent.session.snapshotEvents()),originalEvents)
  const reused=ctx.agents.get(binding.sessionId);assert.equal(ctx.agentPresets.composedPreset(reused.ctx),'my-dsh.shared-teacher');const scoped=await ctx.skills.get('app-teaching-proof',{scope:reused});assert.equal(scoped.provider,'app-proof-provider');assert.equal(await ctx.skills.get('app-teaching-proof'),undefined,'app teaching rules must not leak into the global library')
  const req=Readable.from([JSON.stringify({action:'teach',key,evidence:{kind:'lesson',context:{subject:'math',title:'proof lesson',limit:1}}})]);req.method='POST';req.headers={'content-type':'application/json'};let status,payload
  await roles.handle(req,{writeHead:code=>{status=code},end:data=>{payload=JSON.parse(data)}});assert.equal(status,200,JSON.stringify(payload));assert.match(payload.prompt,/app-teaching-proof/)
  reused.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:payload.prompt}]}));await reused.whenIdle();assert.equal(adapter.requests.length,2);assert.match(JSON.stringify(adapter.requests[1].messages),/App teaching proof: wait for the learner response/);assert.match(JSON.stringify(adapter.requests[1].messages),/independently managed teacher/);assert.equal(JSON.stringify(originalAgent.session.snapshotEvents()),originalEvents)
 }finally{await removeRuntime?.();await capabilities?.dispose();await roles?.dispose();await Promise.allSettled(handles.map(handle=>handle.dispose()));await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})}
})
