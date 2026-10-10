import type {} from './capability-catalog.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { randomUUID } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { appendDelegatedPolicyOverrides, captureDelegatedPolicyOverrides, childSessionMeta, resolveChildDepth, resolveChildAgentOptions, finalAssistantOutput } from '@deepseek-ai/dsh-subagent'
import { capabilityDomain } from './capability-domain.ts'
import type { AgentRecord, SkillRecord } from './capability-domain.ts'
import type { CapabilityRequest, CapabilityExecution, ManagedAgent } from './management-api.ts'

/** Independent reusable capabilities; all execution remains inside native Agent/tool policy. */
export async function installCapabilities(ctx: Context, usedSkill: (name:string)=>boolean = ()=>false) {
 const domain = await ctx.storageDomain.open(capabilityDomain)
 const agents=domain.table('agents'), skills=domain.table('skills'), executions=domain.table('executions')
 const agentDisposers=new Map<string,()=>Promise<void>>(), skillDisposers=new Map<string,()=>void>()
 const tasks=new Set<Promise<unknown>>(), controllers=new Set<AbortController>()
 let closing=false
 let mutation=Promise.resolve()
 const track=<T>(task:Promise<T>)=>{tasks.add(task);void task.finally(()=>tasks.delete(task)).catch(()=>{});return task}
 const serial=<T>(run:()=>Promise<T>)=>{const task=mutation.catch(()=>{}).then(run);mutation=task.then(()=>{},()=>{});return track(task)}
 const nativeId=(id:string)=>`my-dsh.${id}`
 const installAgent=async(row:AgentRecord)=>{
   const plugins=[{name:'@deepseek-ai/dsh-tool-skill'},{name:'@deepseek-ai/dsh-persona',config:{prefix:row.persona,suffix:row.skillNames.length?`Use these Skills when relevant: ${row.skillNames.join(', ')}. Load their instructions through the native skill tool before using them.`:''}}]
   const remove=await ctx.agentPresets.register({id:nativeId(row.id),name:row.name,description:row.description,plugins})
   agentDisposers.set(row.id,remove)
 }
 const installSkill=(row:SkillRecord)=>{skillDisposers.set(row.name,ctx.skills.register({name:row.name,description:row.description,content:row.content,source:'runtime',invocation:{userInvocable:row.userInvocable,modelInvocable:row.modelInvocable}}))}
 const uses=(id:string)=>ctx.personalWorkbenchBindings.listRoles().filter(role=>role.presetId===id).map(role=>role.key.appId)
 const catalog=async():Promise<ManagedAgent[]>=>{
   const native=await ctx.agentPresets.list()
   const savedAgents=[...agents.entries()].map(([,row])=>row)
   return savedAgents.map(saved=>{
     const presetId=nativeId(saved.id)
     const preset=native.find(row=>row.id===presetId)
     return {...saved,managed:true,presetId,appIds:[...new Set(uses(presetId))],...(!preset?{broken:'Managed Agent preset unavailable'}:preset.broken?{broken:preset.broken}:{})}
   })
 }
 const projectSkills=()=>[...skills.entries()].map(([,row])=>({name:row.name,managed:true,revision:row.revision}))
 const history=(sessionId?:string)=>[...executions.entries()].map(([,row])=>row).filter(row=>!sessionId||row.sessionId===sessionId).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,200)
 const begin=async(kind:'agent'|'skill',capabilityId:string,sessionId:string,childSessionId?:string)=>{
   const row:CapabilityExecution={id:randomUUID(),kind,capabilityId,sessionId,...(childSessionId?{childSessionId}:{}),startedAt:new Date().toISOString(),status:'running'}
   await executions.put(row.id,row);return row
 }
 const finish=async(row:CapabilityExecution,status:CapabilityExecution['status'],error?:string)=>{await executions.put(row.id,{...row,status,finishedAt:new Date().toISOString(),...(error?{error:error.slice(0,1000)}:{})})}
 const runAgent=async(id:string,prompt:string,parent:Agent,signal:AbortSignal)=>{
   const saved=agents.get(id)
   if(!saved?.modelInvocable)throw new Error('Agent model invocation is disabled')
   if(!prompt.trim()||prompt.length>32000)throw new Error('Invalid Agent task')
   const skillSnapshot=await ctx.skills.snapshot({scope:parent,cwd:parent.session.header.cwd,signal})
   if(!skillSnapshot.complete)throw new Error('Skill catalog incomplete')
   for(const name of saved.skillNames)if(!skillSnapshot.skills.some(skill=>skill.name===name&&skill.invocation.modelInvocable))throw new Error(`Assigned Skill model invocation is disabled or unavailable: ${name}`)
   const depth=resolveChildDepth(parent,1)
   const childId=randomUUID() as SessionId
   const policy=captureDelegatedPolicyOverrides(parent)
   const row=await begin('agent',id,parent.id,childId)
   const controller=new AbortController();controllers.add(controller);if(closing)controller.abort(new Error('Capability runtime closing'))
   const abort=()=>controller.abort(signal.reason);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
   let handle: Awaited<ReturnType<typeof ctx.agents.create>>|undefined
   try {
     handle=await parent.ctx.agents.create({sessionId:childId,parentAgent:parent,meta:{...childSessionMeta(parent,depth,false),agentPreset:nativeId(id)},agentOptions:resolveChildAgentOptions(parent,undefined,depth),signal:controller.signal,setup:async(childCtx,child)=>{await ctx.agentPresets.mount(childCtx,nativeId(id));appendDelegatedPolicyOverrides(child.session,policy)}})
     const child=handle.agent
     const cancel=()=>child.cancel({kind:'parent'});controller.signal.addEventListener('abort',cancel,{once:true})
     try {
       if(controller.signal.aborted)cancel();else {child.followup(createUserMessage({content:[{type:'text',text:prompt}],source:{kind:'user'}}));await child.whenIdle()}
       const events=child.session.snapshotEvents()
       const output=finalAssistantOutput(events)??[]
       const end=[...events].reverse().find(event=>event.type==='turn/end')
       if(controller.signal.aborted){await finish(row,'cancelled');throw new Error('Agent invocation cancelled')}
       if(end?.type!=='turn/end'||end.data.reason.kind!=='completed'){throw new Error(`Agent did not complete: ${end?.type==='turn/end'?end.data.reason.kind:'no turn outcome'}`)}
       await finish(row,'completed')
       return {sessionId:childId,output}
     } finally {controller.signal.removeEventListener('abort',cancel)}
   } catch(error){await finish(row,controller.signal.aborted?'cancelled':'failed',error instanceof Error?error.message:'Agent failed');throw error}
   finally {signal.removeEventListener('abort',abort);controllers.delete(controller);try{await handle?.dispose()}catch(cleanup){await finish(row,'failed','Native Agent cleanup failed');throw cleanup}}
 }
 const removes:(()=>void)[]=[]
 const removeCatalog=ctx.reflect?.provide?.('personalWorkbenchCapabilities',{agents:()=>[...agents.entries()].map(([,row])=>structuredClone(row)),skill:(name:string)=>{const row=skills.get(name);return row?structuredClone(row):undefined}});if(removeCatalog)removes.push(removeCatalog)
 try {
   for(const [,row]of skills.entries())installSkill(row)
   for(const [,row]of agents.entries())await installAgent(row)
   // A crash leaves an observable failed record rather than a permanently running invocation.
   for(const [,row]of executions.entries())if(row.status==='running')await finish(row,'failed','Runtime restarted before completion')
   if(typeof ctx.tools.register==='function'){
     removes.push(ctx.tools.register({name:'list_capabilities',description:'Discover reusable Agents and native Skills. Agent invocation requires enabled model permission. Use native skill to load Skill instructions.',parameters:{type:'object',properties:{},additionalProperties:false},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:String(value)}]},execute:async(_args,exec)=>JSON.stringify({agents:(await catalog()).filter(row=>row.modelInvocable).map(({id,name,description,skillNames})=>({id,name,description,skillNames})),skills:(await ctx.skills.snapshot({scope:exec.agent,cwd:exec.agent?.session.header.cwd,signal:exec.signal})).skills.filter(row=>row.invocation.modelInvocable).map(({name,description})=>({name,description}))})}))
     removes.push(ctx.tools.register({name:'run_agent',description:'Delegate one task to an enabled reusable Agent discovered by list_capabilities. Runs under inherited native permissions; child output and execution are recorded.',parameters:{type:'object',properties:{id:{type:'string'},prompt:{type:'string'}},required:['id','prompt'],additionalProperties:false},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:String(value)}]},execute:async(args,exec)=>{if(!exec.agent)throw new Error('Native calling Agent required');const input=args as {id:string;prompt:string};return JSON.stringify(await track(runAgent(input.id,input.prompt,exec.agent,exec.signal)))}}))
   }
   removes.push(ctx.on('tools/pre-execute',async(exec,next)=>{
     if(exec.name==='skill'&&exec.agent){
       const preset=ctx.agentPresets.composedPreset(exec.agent.ctx)
       const assigned=[...agents.entries()].find(([,row])=>nativeId(row.id)===preset)?.[1]
       if(assigned&&!assigned.skillNames.includes(String((exec.arguments as {name?:unknown}).name))){
         let applicationSkill=false
         for(const definition of ctx.personalWorkbenchBindings.listRoles()){
           const name=String((exec.arguments as {name?:unknown}).name)
           if(definition.teaching?.skillName!==name&&!definition.skillNames?.includes(name))continue
           const binding=await ctx.personalWorkbenchBindings.read(definition.key)
           if(binding?.sessionId===exec.agent.id){applicationSkill=true;break}
         }
         if(!applicationSkill)return {kind:'deny',reason:'Skill is not assigned to this Agent'}
       }
     }
     return next()
   }))
   removes.push(ctx.on('tools/result',(exec,result)=>{
     if(exec.name!=='skill'||!exec.agent)return
     const input=exec.arguments as {name?:unknown}
     if(typeof input.name!=='string')return
     const sessionId=exec.agent.id,name=input.name
     void track((async()=>{const row=await begin('skill',name,sessionId);await finish(row,result.isError?'failed':'completed',result.isError?'Native Skill invocation failed':undefined)})()).catch(()=>{})
   }))
 }catch(error){for(const remove of removes)remove();for(const remove of skillDisposers.values())remove();await Promise.allSettled([...agentDisposers.values()].map(remove=>remove()));await domain.close();throw error}
 const dispatch=(request:CapabilityRequest)=>serial(async()=>{
   if(closing)throw new Error('Capabilities unavailable')
   if(request.action==='executions')return {executions:history(request.sessionId)}
   if(request.action==='skill-read'){
     const managed=skills.get(request.name);if(managed)return {skill:managed,managed:true}
     const value=await ctx.skills.get(request.name);if(!value)throw new Error('Skill unavailable');return {skill:{name:value.name,description:value.description,content:value.content,modelInvocable:value.invocation.modelInvocable,userInvocable:value.invocation.userInvocable},managed:false}
   }
   if(request.action==='agent-bind'){
     const managed=agents.get(request.agentId);const id=managed?nativeId(managed.id):request.agentId
     if(managed&&!managed.userInvocable)throw new Error('Agent user invocation is disabled')
     if(!ctx.personalWorkbenchBindings.setPreset)throw new Error('Application binding unavailable')
     return {binding:await ctx.personalWorkbenchBindings.setPreset(request.key,id,request.expectedSessionId as SessionId|null)}
   }
   if(request.action==='agent-open'){
     const managed=agents.get(request.id)
     if(!managed)throw new Error('Managed Agent unavailable')
     if(!managed.userInvocable)throw new Error('Agent user invocation is disabled')
     return ctx.sessionController.create({agentPreset:nativeId(request.id),...(request.cwd?{cwd:request.cwd}:{})})
   }
   if(request.action==='agent-save'){
     const current=agents.get(request.agent.id);if((current?.revision??0)!==request.expectedRevision)throw new Error('Agent changed; refresh before saving')
     const snapshot=await ctx.skills.snapshot();if(!snapshot.complete)throw new Error('Skills catalog incomplete')
     for(const name of request.agent.skillNames)if(!snapshot.skills.some(row=>row.name===name&&row.invocation.userInvocable))throw new Error(`Skill unavailable: ${name}`)
     const next={...request.agent,revision:request.expectedRevision+1}
     await agentDisposers.get(next.id)?.();agentDisposers.delete(next.id)
     try{await installAgent(next);await agents.put(next.id,next)}catch(error){await agentDisposers.get(next.id)?.();agentDisposers.delete(next.id);if(current)await installAgent(current);throw error}
     return {agent:next}
   }
   if(request.action==='agent-remove'){
     const current=agents.get(request.id);if(!current||current.revision!==request.expectedRevision)throw new Error('Managed Agent changed or unavailable')
     if(uses(nativeId(request.id)).length)throw new Error('Agent is used by applications; rebind before deleting')
     await agentDisposers.get(request.id)?.();agentDisposers.delete(request.id);await agents.delete(request.id);return {removed:true}
   }
   if(request.action==='skill-save'){
     const current=skills.get(request.skill.name);if((current?.revision??0)!==request.expectedRevision)throw new Error('Skill changed; refresh before saving')
     if(!current&&(await ctx.skills.snapshot()).skills.some(row=>row.name===request.skill.name))throw new Error('Native Skill name already exists; choose a different name')
     const next={...request.skill,revision:request.expectedRevision+1};skillDisposers.get(next.name)?.();skillDisposers.delete(next.name)
     try{installSkill(next);await skills.put(next.name,next)}catch(error){skillDisposers.get(next.name)?.();skillDisposers.delete(next.name);if(current)installSkill(current);throw error}return {skill:next}
   }
   const current=skills.get(request.name);if(!current||current.revision!==request.expectedRevision)throw new Error('Managed Skill changed or unavailable')
   if([...agents.entries()].some(([,row])=>row.skillNames.includes(request.name)) || usedSkill(request.name))throw new Error('Skill is used by Agents; unassign before deleting')
   skillDisposers.get(request.name)?.();skillDisposers.delete(request.name);await skills.delete(request.name);return {removed:true}
 })
 return {catalog,projectSkills,history,dispatch,agentSkills:(presetId:string)=>[...agents.entries()].find(([,row])=>nativeId(row.id)===presetId)?.[1].skillNames??[],dispose:async()=>{closing=true;for(const remove of removes)remove();for(const controller of controllers)controller.abort();await Promise.allSettled([...tasks]);for(const remove of skillDisposers.values())remove();await Promise.allSettled([...agentDisposers.values()].map(remove=>remove()));await domain.close()}}
}

