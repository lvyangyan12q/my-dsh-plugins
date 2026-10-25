import assert from 'node:assert/strict'
import {test} from 'node:test'
import {registerHooks} from 'node:module'
import {spawnSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {mkdtemp,rm,mkdir,copyFile,readFile,writeFile,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {pathToFileURL,fileURLToPath} from 'node:url'

import {mountRoles} from '../../worktable/01_content/src/framework/role-host.mjs'
import {AdmissionGate} from '../../worktable/01_content/src/framework/admission.mjs'

const native=process.env.KAOGONG_TEST_RUNTIME
assert.ok(native,'Set KAOGONG_TEST_RUNTIME to built official DSH checkout')
if(!process.env.KAOGONG_NATIVE_ENTRY){
 await test('plain compiled Native recognizes its public scope without TSX or config discovery',()=>{
  const code=`
   import {registerHooks} from 'node:module';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
   const native=${JSON.stringify(native)},load=p=>import(pathToFileURL(join(native,p)).href),{Context}=await load('vendor/cordis/lib/index.js'),ctx=new Context(),home=await mkdtemp(join(tmpdir(),'kaogong-plain-compiled-'));
   const hook=registerHooks({resolve(specifier,context,next){if(specifier==='get-tsconfig')throw Error('Compiled Native must not discover source configuration');return next(specifier,context)}});
   try{await ctx.plugin((await load('vendor/loader/lib/index.js')).default);ctx.loader.builtins.group=(await load('vendor/group/lib/index.js')).default;
    for(const p of ['packages/core/session/lib/index.js','packages/session/session-projection/lib/index.js','packages/core/agent/lib/index.js','packages/preset/agent-preset-registry/lib/index.js'])await ctx.plugin((await load(p)).default,p.includes('agent-preset-registry')?{default:'standard'}:undefined);
    await ctx.agentPresets.register({id:'standard',plugins:[]});const {PluginPackages,createRuntimeResolution,initProfile,loadProfileDirectory}=await load('packages/boot/app-boot/lib/index.js'),profileDir=join(home,'profiles','web'),installAnchor=join(native,'apps/cli/package.json');initProfile(profileDir,[]);await ctx.plugin(PluginPackages,{resolution:await createRuntimeResolution({installAnchor,home,profile:loadProfileDirectory('dsh',profileDir,installAnchor)})});
    const {nativeRoleScope}=await import(${JSON.stringify(new URL('../src/native-role-scope.ts',import.meta.url).href)}),actual=await nativeRoleScope(ctx),compiled=await load('packages/core/scope/lib/index.js');if(actual!==compiled)throw Error('Expected exact compiled scope');console.log('plain compiled scope matched');
   }finally{await ctx.fiber.dispose();hook.deregister();await rm(home,{recursive:true,force:true})}
  `
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:30000,windowsHide:true,env:{...process.env,NODE_TEST_CONTEXT:undefined,TSX_TSCONFIG_PATH:undefined}})
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/plain compiled scope matched/)
 })
 for(const mode of ['compiled','source','source-default'])await test('official '+mode+' entry keeps application personas in the actual Native scope',async()=>{
  const directory=new URL('../.scratch/',import.meta.url);await mkdir(directory,{recursive:true});const config=fileURLToPath(new URL('compiled-'+randomUUID()+'.json',directory))
  await writeFile(config,JSON.stringify({compilerOptions:{target:'ES2024',module:'ESNext',moduleResolution:'Bundler'}}))
  try{const result=spawnSync(process.execPath,['--import',mode==='source-default'?'tsx/esm':pathToFileURL(resolve(native,'node_modules/tsx/dist/loader.mjs')).href,'--test',fileURLToPath(import.meta.url)],{cwd:mode==='source-default'?native:undefined,encoding:'utf8',timeout:60000,windowsHide:true,env:{...process.env,NODE_TEST_CONTEXT:undefined,KAOGONG_NATIVE_ENTRY:mode==='source-default'?'source':mode,KAOGONG_NATIVE_DEFAULT_CONFIG:mode==='source-default'?'1':undefined,TSX_TSCONFIG_PATH:mode==='source-default'?undefined:mode==='source'?resolve(native,'tsconfig.json'):config}});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/new application roles use one generic native Agent/,'Nested entry must run the actual composition assertions')}finally{await rm(config,{force:true})}
 })
}else{
const load=async path=>await import(pathToFileURL(resolve(native,process.env.KAOGONG_NATIVE_ENTRY==='source'?path.replace('/lib/','/src/').replace(/\.js$/,'.ts'):path)).href)
const {Context}=await load('vendor/cordis/lib/index.js')
// Official installs may keep a second same-version dsh-scope next to optional plugin dependencies.
// Its private Symbol must not become the identity of the host Agent/Prompt/Skill scope.
await mkdir(new URL('../.scratch/',import.meta.url),{recursive:true})
const dependencyCopy=await mkdtemp(resolve(fileURLToPath(new URL('../.scratch/',import.meta.url)),'scope-copy-'))
await copyFile(resolve(native,'packages/core/scope/lib/index.js'),join(dependencyCopy,'scope.mjs'))
const roleScopeUrl=new URL('../src/role-session-scope.ts',import.meta.url).href
let configDiscoveries=0
const hooks=registerHooks({resolve(specifier,context,next){if(specifier==='get-tsconfig'&&context.parentURL===new URL('../src/native-role-scope.ts',import.meta.url).href)configDiscoveries++;if(specifier==='@deepseek-ai/dsh-scope'&&context.parentURL===roleScopeUrl)return {url:pathToFileURL(join(dependencyCopy,'scope.mjs')).href,shortCircuit:true};return next(specifier,context)}})
const {installKaogongRoles,kaogongRolePresets}=await import('../src/role-definitions.ts')

test('new application roles use one generic native Agent with isolated system personas and Skills', {timeout:30000}, async()=>{
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
  await ctx.agentPresets.register({id:'standard',name:'Native standard',plugins:[{name:pathToFileURL(resolve(native,'packages/preset/persona/lib/index.js')).href,config:{prefix:'Native standard persona.',suffix:'Native standard suffix.'}}]})
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
   projections:async({sessionId})=>{const agent=handles.get(sessionId)?.agent;if(agent)return {kind:'sequenced',values:{agentPreset:ctx.agentPresets.presetForSession(agent.session)}};using observation=await ctx.sessionQuery.observeSession(sessionId);return {kind:'sequenced',values:observation.projections.values}},
  })
  ctx.provide('worktableApplications',{assertEnabled:async()=>{if(!enabled)throw Error('application disabled')},assertInstanceReady:async()=>{},snapshot:async()=>({applications:[{id:'kaogong',kind:'deep'}],instances:[{id:'instance-a',appId:'kaogong'},{id:'instance-b',appId:'kaogong'}]})})
  await ctx.plugin({apply:mountRoles})
  for(let wait=0;wait<100&&!ctx.get('worktableRoles');wait++)await new Promise(done=>setTimeout(done,10))
  assert.ok(ctx.get('worktableRoles'),'Role Host must finish async profile ownership')
  removeRoles=await installKaogongRoles(ctx,dir)
  await assert.rejects(ctx.worktableRoles.ensure('instance-a','class-advisor'),/NATIVE_ROLE_SCOPE_METADATA_UNAVAILABLE/,'A resolvable development peer cannot stand in for running Native installation metadata')
  await removeRoles();removeRoles=undefined
  const {PluginPackages,createRuntimeResolution,initProfile,loadProfileDirectory}=await load('packages/boot/app-boot/lib/index.js')
  const installAnchor=resolve(native,'apps/cli/package.json'),profileDir=join(dir,'profiles','web'),profileScope=join(profileDir,'node_modules','@deepseek-ai','dsh-scope')
  initProfile(profileDir,[]);await mkdir(join(profileScope,'lib'),{recursive:true})
  await copyFile(resolve(native,'packages/core/scope/package.json'),join(profileScope,'package.json'));await copyFile(resolve(native,'packages/core/scope/lib/index.js'),join(profileScope,'lib/index.js'))
  const manifest=JSON.parse(await readFile(join(profileDir,'package.json'),'utf8'));manifest.dependencies={'@deepseek-ai/dsh-scope':'0.2.1-rc.3'};await writeFile(join(profileDir,'package.json'),JSON.stringify(manifest))
  const resolution=await createRuntimeResolution({installAnchor,home:dir,profile:loadProfileDirectory('dsh',profileDir,installAnchor)})
  const originalScope=resolution.entries.find(row=>row.name==='@deepseek-ai/dsh-scope'&&row.scope==='installation')
  for(const entries of [resolution.entries.filter(row=>row!==originalScope),[...resolution.entries,originalScope]]){
   const metadata=await ctx.plugin(PluginPackages,{resolution:{...resolution,entries}})
   try{removeRoles=await installKaogongRoles(ctx,dir);await assert.rejects(ctx.worktableRoles.ensure('instance-a','class-advisor'),/NATIVE_ROLE_SCOPE_INSTALLATION_IDENTITY_UNAVAILABLE/,'Missing or duplicate installation identity must never fall back to a profile/dev peer')}
   finally{await removeRoles?.();removeRoles=undefined;await metadata.dispose()}
  }
  await ctx.plugin(PluginPackages,{resolution})
  const installationScope=ctx.pluginPackages.resolution.entries.filter(row=>row.name==='@deepseek-ai/dsh-scope'&&row.scope==='installation')
  assert.equal(installationScope.length,1)
  assert.notEqual(await realpath(profileScope),await realpath(installationScope[0].packageDir),'The actual official profile fixture retains a second physical same-version scope package')
  if(process.env.KAOGONG_NATIVE_DEFAULT_CONFIG){
   const {nativeRoleScope}=await import('../src/native-role-scope.ts'),originalCwd=process.cwd(),configured=process.env.TSX_TSCONFIG_PATH
   const near=join(dir,'unrelated-project');await mkdir(near,{recursive:true});await writeFile(join(near,'tsconfig.json'),JSON.stringify({compilerOptions:{paths:{'@deepseek-ai/dsh-scope':[join(native,'packages/core/scope/src/index.ts')]}}}))
   try{
    process.chdir(near);delete process.env.TSX_TSCONFIG_PATH
    await assert.rejects(nativeRoleScope(ctx),/NATIVE_ROLE_SCOPE_RUNTIME_UNRECOGNIZED/,'A nearer external config must not grant authority to source files outside its validated installation boundary')
    process.env.TSX_TSCONFIG_PATH=join(native,'tsconfig.json')
    await nativeRoleScope(ctx)
    process.env.TSX_TSCONFIG_PATH=join(near,'tsconfig.json');await writeFile(join(near,'tsconfig.json'),'{ invalid config')
    await assert.rejects(nativeRoleScope(ctx),/NATIVE_ROLE_SCOPE_RUNTIME_UNRECOGNIZED|NATIVE_ROLE_SOURCE_CONFIG_UNSUPPORTED/,'A bad explicit override must not fall back to automatic discovery')
   }finally{process.chdir(originalCwd);if(configured===undefined)delete process.env.TSX_TSCONFIG_PATH;else process.env.TSX_TSCONFIG_PATH=configured}
  }
  if(process.env.KAOGONG_NATIVE_ENTRY==='source'&&!process.env.KAOGONG_NATIVE_DEFAULT_CONFIG){
   const configured=process.env.TSX_TSCONFIG_PATH;delete process.env.TSX_TSCONFIG_PATH
   try{removeRoles=await installKaogongRoles(ctx,dir);await assert.rejects(ctx.worktableRoles.ensure('instance-a','class-advisor'),/NATIVE_ROLE_SCOPE_RUNTIME_UNRECOGNIZED/,'A source Native graph without explicit source configuration must not guess a source directory');assert.equal(handles.size,0)}finally{await removeRoles?.();removeRoles=undefined;process.env.TSX_TSCONFIG_PATH=configured}
  }
  const globalBefore=(await ctx.systemPrompt.assemble()).sections.map(({name,text})=>[name,text])
  removeRoles=await installKaogongRoles(ctx,dir)
  const advisor=await ctx.worktableRoles.ensure('instance-a','class-advisor')
  const teacher=await ctx.worktableRoles.ensure('instance-b','teacher.data-analysis')
  ctx.provide('agentDefaultModel',{currentSelection:()=>({provider:'offline',model:'not-called'})})
  await ctx.plugin((await load('packages/session-query/session-query-sqlite/lib/index.js')).default,{path:':memory:'})
  const {ApiSessionAgentController}=await load('packages/api/session-controller/src/agent.ts');const coldController=new ApiSessionAgentController(ctx)
  const {createUserMessage}=await load('packages/llm/llm/lib/index.js'),{agentEvents:historyEvents}=await load('packages/core/agent/lib/index.js')
  const historyAgent=handles.get(advisor.sessionId).agent
  const invocation=createUserMessage({content:[{type:'text',text:'/kaogong-teach'}],source:{kind:'user'}})
  historyAgent.session.append('turn/start',{turn:1});historyAgent.session.append('user/message',invocation,{surfaceOp:'append'})
  const historyStep=await historyEvents(ctx,historyAgent).waterfall('agent/pre-step',{messages:[invocation],turn:1,step:1,signal:new AbortController().signal},async()=>({kind:'enter',messages:[invocation]}))
  const injections=historyStep.messages.filter(message=>message.id!==invocation.id)
  assert.ok(injections.some(message=>message.source.kind==='skill-invocation'),'Use the real Skill invocation path to persist historical instructions')
  for(const message of injections)historyAgent.session.append('user/message',message,{surfaceOp:'append'})
  historyAgent.session.append('turn/end',{turn:1,reason:{kind:'completed'}})
  await ctx.sessionPersistence.flush()
  const old=handles.get(advisor.sessionId);await old.dispose();handles.delete(advisor.sessionId)
  assert.equal(ctx.agents.get(advisor.sessionId),undefined,'The next open must be cold, not reuse a live Agent')
  const cold=await Promise.all([
   ctx.worktableRoles.open('instance-a','class-advisor',advisor.sessionId,advisor.revision),
   coldController.resolveAgent(advisor.sessionId),
   ...Array.from({length:12},()=>ctx.worktableRoles.read('instance-b','teacher.data-analysis')),
  ])
  assert.ok(cold[1].agent,cold[1].error?.message)
  assert.ok(cold[1].agent.session.snapshotEvents().some(event=>event.type==='user/message'&&event.data.source.kind==='skill-invocation'),'Cold restore replays the real persisted Skill instruction history')
  assert.deepEqual(cold.slice(2).map(row=>row.unavailable).filter(Boolean),[])
  handles.set(advisor.sessionId,{agent:cold[1].agent,dispose:()=>ctx.agents.get(advisor.sessionId)?.ctx.fiber.dispose()})
  assert.equal((await ctx.skills.get('kaogong-teach',{scope:cold[1].agent,cwd:dir})).provider,'kaogong-packaged-teaching')
  const observations=await Promise.all(Array.from({length:24},(_,i)=>i%2?ctx.worktableRoles.read('instance-a','class-advisor'):ctx.worktableRoles.assertNativeSession(handles.get(advisor.sessionId).agent).then(()=>({unavailable:null}))))
  assert.deepEqual(observations.map(row=>row.unavailable).filter(Boolean),[],'Concurrent role inspection must not destabilize an already mounted Native Skill catalog')
  const brokenRoot=join(dir,'broken-skills');await mkdir(join(brokenRoot,'unreadable','SKILL.md'),{recursive:true})
  const broken=await ctx.plugin(await load('packages/skill/skill-filesystem/lib/index.js'),{providerName:'broken-directory-fixture',includeDefaultRoots:false,customSkillDirs:[brokenRoot],watch:false})
  try{
   assert.equal((await ctx.skills.snapshot({scope:cold[1].agent,cwd:dir})).complete,false)
   assert.equal((await ctx.worktableRoles.read('instance-a','class-advisor')).unavailable.code,'catalog-incomplete','Serializing our scopes must not bypass a truly unreadable Skill directory')
   await assert.rejects(ctx.worktableRoles.assertNativeSession(cold[1].agent),/角色Skills目录不完整/)
  }finally{await broken.dispose()}
  assert.equal((await ctx.worktableRoles.read('instance-a','class-advisor')).unavailable,null,'A failed validation must not poison the critical-section queue')
  assert.equal((await ctx.worktableRoles.ensure('instance-a','class-advisor')).sessionId,advisor.sessionId,'Repeated role opening must not mount a second persona')
  assert.equal(advisor.presetId,'standard','New application roles must not need their own native mode')
  assert.equal(teacher.presetId,'standard')
  const {assembleContextFor}=await load('packages/core/agent/lib/index.js')
  const personaOf=async binding=>(await ctx.systemPrompt.assemble(assembleContextFor(handles.get(binding.sessionId).agent))).sections.find(row=>row.name==='deployment:persona-prefix').text
  const definitions=await kaogongRolePresets()
  assert.equal(await personaOf(advisor),definitions.find(row=>row.id==='kaogong.class-advisor.v1').plugins.find(row=>row.name==='@deepseek-ai/dsh-persona').config.prefix)
  assert.equal(await personaOf(teacher),definitions.find(row=>row.id==='kaogong.teacher.data-analysis.v1').plugins.find(row=>row.name==='@deepseek-ai/dsh-persona').config.prefix)
  assert.notEqual(await personaOf(advisor),await personaOf(teacher))
  assert.deepEqual((await ctx.systemPrompt.assemble()).sections.map(({name,text})=>[name,text]),globalBefore,'Identity probes and role overlays must never mutate deployment/global prompt sections')
  const foreignScope=await import(pathToFileURL(join(dependencyCopy,'scope.mjs')).href)
  assert.equal(foreignScope.scopeOf(handles.get(advisor.sessionId).agent.ctx),undefined,'The fixture preserves a second incompatible same-version scope identity')
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
  assert.equal((await ctx.systemPrompt.assemble(assembleContextFor(plain.agent))).sections.find(row=>row.name==='deployment:persona-prefix').text,'Native standard persona.','Unrelated standard Native sessions retain their own persona')
  assert.equal(await ctx.skills.get('kaogong-teach',{scope:plain.agent,cwd:dir}),undefined,'An unrelated native Session does not inherit teaching Skills')
  if(process.env.KAOGONG_NATIVE_ENTRY==='compiled')assert.equal(configDiscoveries,0,'A recognized compiled runtime must never consult automatic source configuration')
  assert.equal((await enter(plain.agent)).kind,'continue')
  await removeRoles();removeRoles=undefined
  assert.equal(await personaOf(advisor),'Native standard persona.','Withdrawing the app releases only its own overlay and preserves the Native standard persona')
  await assert.rejects(enter(handles.get(advisor.sessionId).agent),/停用|未就绪|能力缺失/)
  assert.equal(await ctx.skills.get('kaogong-teach',{scope:handles.get(advisor.sessionId).agent,cwd:dir}),undefined,'Owner withdrawal releases its private Skill')
 } finally {
  await removeRoles?.()
  for(const handle of handles.values())await handle.dispose()
  await ctx.fiber.dispose()
  await rm(dir,{recursive:true,force:true})
  hooks.deregister();await rm(dependencyCopy,{recursive:true,force:true})
 }
})

}
