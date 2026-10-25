import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {installKaogongRoles,kaogongRolePresets} from '../src/role-definitions.ts'
import {mountRoles} from '../../worktable/01_content/src/framework/role-host.mjs'
import {AdmissionGate} from '../../worktable/01_content/src/framework/admission.mjs'

const native=process.env.KAOGONG_TEST_RUNTIME
assert.ok(native,'Set KAOGONG_TEST_RUNTIME to built official DSH checkout')
const require=createRequire(resolve(native,'packages/client/ui-renderer/package.json'))
const {Context}=require('@deepseek-ai/cordis')
const load=async path=>await import(pathToFileURL(resolve(native,path)).href)

test('new application roles use one generic native Agent with isolated system personas and Skills', {timeout:15000}, async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kaogong-session-roles-')),ctx=new Context(),handles=new Map()
 const workspace={id:'native-workspace',path:dir,sessionIds:[]}
 ctx.baseUrl=new URL('../package.json',import.meta.url).href
 ctx.provide('workingDirectory',{ensure:async()=>dir})
 let removeRoles,enabled=true
 try{
  await ctx.plugin((await load('vendor/loader/lib/index.js')).default)
  ctx.loader.builtins.group=(await load('vendor/group/lib/index.js')).default
  for(const path of ['packages/llm/llm/lib/index.js','packages/core/session/lib/index.js','packages/session/session-projection/lib/index.js','packages/core/system-prompt/lib/index.js','packages/core/tools/lib/index.js']) await ctx.plugin((await load(path)).default)
  await ctx.plugin(await load('packages/core/tool-executor-native/lib/index.js'))
  for(const path of ['packages/interaction/user-questions/lib/index.js','packages/core/agent/lib/index.js']) await ctx.plugin((await load(path)).default)
  await ctx.plugin((await load('packages/core/agent-loop/lib/index.js')).default,{agents:[]})
  const {SkillRegistry}=await load('packages/skill/skill/lib/index.js')
  await ctx.plugin(SkillRegistry)
  await ctx.plugin((await load('packages/preset/agent-preset-registry/lib/index.js')).default,{default:'standard'})
  await ctx.agentPresets.register({id:'standard',name:'Native standard',plugins:[]})
  ctx.provide('worktableAdmission',new AdmissionGate())
  ctx.provide('profileContext',{dir})
  ctx.provide('connection',{admit:()=>({})})
  ctx.provide('webServer',{register:()=>()=>{}})
  ctx.provide('workspaceRegistry',{list:()=>[workspace]})
  await ctx.plugin(await load('packages/session/session-persistence-jsonl/lib/index.js'),{root:join(dir,'native-sessions'),compression:'none'})
  ctx.provide('sessionController',{
   create:async({sessionId,agentPreset})=>{
    const handle=await ctx.agents.create({sessionId,meta:{cwd:dir,agentPreset},setup:async agentCtx=>{await ctx.agentPresets.mount(agentCtx,agentPreset)}})
    handles.set(sessionId,handle);workspace.sessionIds.push(sessionId)
    return {sessionId,agentPreset}
   },
   projections:async({sessionId})=>{const agent=handles.get(sessionId)?.agent;return agent?{kind:'sequenced',values:{agentPreset:ctx.agentPresets.presetForSession(agent.session)}}:undefined},
  })
  ctx.provide('worktableApplications',{assertEnabled:async()=>{if(!enabled)throw Error('application disabled')},assertInstanceReady:async()=>{},snapshot:async()=>({applications:[{id:'kaogong',kind:'deep'}],instances:[{id:'instance-a',appId:'kaogong'},{id:'instance-b',appId:'kaogong'}]})})
  await ctx.plugin({apply:mountRoles})
  for(let wait=0;wait<100&&!ctx.get('worktableRoles');wait++)await new Promise(done=>setTimeout(done,10))
  assert.ok(ctx.get('worktableRoles'),'Role Host must finish async profile ownership')
  removeRoles=await installKaogongRoles(ctx,dir)
  const advisor=await ctx.worktableRoles.ensure('instance-a','class-advisor')
  const teacher=await ctx.worktableRoles.ensure('instance-b','teacher.data-analysis')
  assert.equal(advisor.presetId,'standard','New application roles must not need their own native mode')
  assert.equal(teacher.presetId,'standard')
  const {assembleContextFor}=await load('packages/core/agent/lib/index.js')
  const personaOf=async binding=>(await ctx.systemPrompt.assemble(assembleContextFor(handles.get(binding.sessionId).agent))).sections.find(row=>row.name==='deployment:persona-prefix').text
  const definitions=await kaogongRolePresets()
  assert.equal(await personaOf(advisor),definitions.find(row=>row.id==='kaogong.class-advisor.v1').plugins.find(row=>row.name==='@deepseek-ai/dsh-persona').config.prefix)
  assert.equal(await personaOf(teacher),definitions.find(row=>row.id==='kaogong.teacher.data-analysis.v1').plugins.find(row=>row.name==='@deepseek-ai/dsh-persona').config.prefix)
  assert.notEqual(await personaOf(advisor),await personaOf(teacher))
  assert.equal(await ctx.skills.get('kaogong-teach'),undefined)
  for(const binding of [advisor,teacher]){
   const agent=handles.get(binding.sessionId).agent
   assert.equal((await ctx.skills.get('kaogong-teach',{scope:agent,cwd:dir})).provider,'kaogong-packaged-teaching')
  }
  assert.deepEqual((await ctx.agentPresets.list()).map(row=>row.id).sort(),['standard'],'Kaogong registers no native mode; only the existing generic mode remains')
  const {agentEvents}=await load('packages/core/agent/lib/index.js')
  const enter=agent=>agentEvents(ctx,agent).waterfall('agent/pre-step',{messages:[],signal:new AbortController().signal},async()=> ({kind:'continue',messages:[]}))
  assert.equal((await enter(handles.get(advisor.sessionId).agent)).kind,'continue')
  enabled=false
  await assert.rejects(enter(handles.get(advisor.sessionId).agent),/application disabled/)
  enabled=true
  const plain=await ctx.agents.create({sessionId:'unbound-native',meta:{cwd:dir,agentPreset:'standard'},setup:async context=>{await ctx.agentPresets.mount(context,'standard')}})
  handles.set('unbound-native',plain)
  assert.equal(await ctx.skills.get('kaogong-teach',{scope:plain.agent,cwd:dir}),undefined,'An unrelated native Session does not inherit teaching Skills')
  assert.equal((await enter(plain.agent)).kind,'continue')
  await removeRoles();removeRoles=undefined
  await assert.rejects(enter(handles.get(advisor.sessionId).agent),/停用|未就绪|能力缺失/)
  assert.equal(await ctx.skills.get('kaogong-teach',{scope:handles.get(advisor.sessionId).agent,cwd:dir}),undefined,'Owner withdrawal releases its private Skill')
 } finally {
  await removeRoles?.()
  for(const handle of handles.values())await handle.dispose()
  await ctx.fiber.dispose()
  await rm(dir,{recursive:true,force:true})
 }
})
