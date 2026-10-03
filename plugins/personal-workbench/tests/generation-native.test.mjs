import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {Readable} from 'node:stream'
import {installGeneration} from '../src/generation-host.ts'
import {installRecipes} from '../src/recipe-host.ts'
import {recipeHostDependencies} from '../src/recipe-api.ts'
import {generationHostDependencies} from '../src/generation-api.ts'
const source=process.env.DSH_SOURCE;assert.ok(source)
const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json'));const {Context}=require('@deepseek-ai/cordis')
const built=p=>import(pathToFileURL(resolve(source,p,'lib/index.js')).href)
const {MockAdapter,textResponse,maxTokensResponse}=await import(pathToFileURL(resolve(source,'packages/core/agent-loop/tests/mock-adapter.ts')).href)
const {default:LLM,ToolCallId}=await built('packages/llm/llm'),{default:Sessions}=await built('packages/core/session'),{default:Projection}=await built('packages/session/session-projection'),{default:Prompt}=await built('packages/core/system-prompt'),{default:Tools}=await built('packages/core/tools'),{default:Agents}=await built('packages/core/agent'),{default:Loop}=await built('packages/core/agent-loop'),{default:Presets}=await built('packages/preset/agent-preset-registry'),{SkillRegistry}=await built('packages/skill/skill'),{default:SessionController}=await built('packages/api/session-controller')
const {default:DefaultModel}=await built('packages/core/agent-default-model')
const {default:Storage}=await built('packages/storage/storage'),{JsonStorageBackend}=await built('packages/storage/storage-json'),{DomainFacility}=await built('packages/storage/storage-domain')
const Loader=(await import(pathToFileURL(createRequire(resolve(source,'packages/preset/agent-preset-registry/package.json')).resolve('@deepseek-ai/cordis-plugin-loader')).href)).default
const Group=(await import(pathToFileURL(createRequire(resolve(source,'packages/preset/agent-preset-registry/package.json')).resolve('@deepseek-ai/cordis-plugin-group')).href)).default
const recipe=(version=1,type='stats')=>({schemaVersion:1,appId:'app.generated',version,name:'Generated reading dashboard',description:'Native output',pages:[{id:'home',label:'Home',layout:'grid',modules:[{id:'count',type,title:'Count',config:{}}]}],connections:[],roles:[]})
const validResponse=(version=1)=>textResponse(JSON.stringify(recipe(version)))
async function fixture(script){
 const root=await mkdtemp(join(tmpdir(),'platform-generator-')),ctx=new Context();let recipes,generation
 try{
  ctx.baseUrl=pathToFileURL(resolve(import.meta.dirname,'../../../package.json')).href;await ctx.plugin(Loader);ctx.loader.builtins.group=Group
  await ctx.plugin(LLM);await ctx.plugin(Sessions);await ctx.plugin(Projection);await ctx.plugin(Prompt,{personaPrefix:''});await ctx.plugin(Tools,{mode:'ptc'});await ctx.plugin(Agents);await ctx.plugin(Loop,{agents:[]});await ctx.plugin(SkillRegistry);await ctx.plugin(Presets,{default:'my-dsh.platform-generator'})
  await ctx.plugin(Storage);ctx.storage.backend.register('json',new JsonStorageBackend(root));const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility)
  ctx.provide('storageDomain',facility);ctx.provide('connection',{requestRejection:()=>undefined});ctx.provide('personalWorkbenchCapabilities',{agents:()=>[],skill:()=>undefined})
  ctx.provide('typert',{lookups:{configure:()=>()=>{}},contexts:{configureHost:()=>()=>{}}});ctx.provide('sessionQuery',{});ctx.provide('workspaceRegistry',{archivedSessionIds:[],get:()=>undefined});ctx.provide('attachments',{imageLimits:{maxImageBytes:1,maxImagesPerMessage:1,maxMessageImageBytes:1,maxImagePixels:1,maxImageDimension:1,mediaTypes:[]}});ctx.provide('fs',{});ctx.provide('fileUploads',{registerAgentResolver:()=>()=>{},resolve:()=>undefined})
  const selection={provider:'mock',model:'configured-model',reasoningEffort:'high'};let saves=0
  ctx.skills.register({name:'private-proof',description:'metadata',content:'private-skill-body',source:'runtime',invocation:{userInvocable:true,modelInvocable:true}})
  await ctx.plugin(DefaultModel,selection);ctx.agentDefaultModel.saveSelection=async()=>{saves++}
  await ctx.plugin(SessionController,{nativeOpen:false})
  // The root Context deliberately has unrestricted access; production never installs owners there.
  // Install through the exact declared child scopes so Cordis dependency enforcement remains active.
  let recipeScope,generationScope
  await ctx.plugin({name:'strict-recipe-owner',inject:recipeHostDependencies,apply:async child=>{recipeScope=child;recipes=await installRecipes(child)}})
  assert.throws(()=>recipeScope.agentDefaultModel,/without inject/,'default model is also a real plugin-owned service')
  assert.throws(()=>recipeScope.tools,/without inject/,'this fixture must enforce undeclared property access')
  await ctx.plugin({name:'strict-generation-owner',inject:generationHostDependencies,apply:async child=>{generationScope=child;generation=await installGeneration(child)}})
  assert.throws(()=>generationScope.skills,/without inject/,'generation cannot silently borrow undeclared service access')
  const adapter=new MockAdapter(script,{efforts:[{id:'high',name:'High'}],defaultEffort:'high'});ctx.llm.registerAdapter(['mock'],adapter)
  let executions=0;const tool={name:'write_fixture',description:'must never execute',parameters:{type:'object',properties:{}},output:{schema:{type:'object'},render:()=>[]},execute:async()=>{executions++;return {content:[],isError:false}}};ctx.tools.register(tool)
  return {ctx,root,adapter,recipes,generation,tool,saves:()=>saves,executions:()=>executions,start:(version=1,expectedRevision=0)=>generation.dispatch({action:'start',requirement:'Create a reading dashboard',appId:'app.generated',version,expectedRevision}),close:async()=>{await generation.dispose();await recipes.dispose();await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})}}
 }catch(error){await generation?.dispose();await recipes?.dispose();await ctx.fiber.dispose();await rm(root,{recursive:true,force:true});throw error}
}
async function live(f,count=1){for(let i=0;i<200&&f.adapter.requests.length<count;i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.adapter.requests.length,count)}
test('real native Session Controller uses configured model and effort, returns editable draft and preserves running recipe',async()=>{
 const f=await fixture([validResponse(2)]);try{
  await f.recipes.service.save(recipe(),0);await f.recipes.service.activate('app.generated',1);const running=JSON.stringify(f.recipes.service.list()[0].running)
  assert.equal(f.adapter.requests.length,0);const job=f.start(2,2),done=await f.generation.settled(job.id);assert.equal(done.status,'completed',done.error);assert.equal(done.record.revision,3);assert.equal(done.record.draft.version,2);assert.equal(JSON.stringify(done.record.running),running)
  assert.equal(f.adapter.requests.length,1);const request=f.adapter.requests[0];assert.equal(request.provider,'mock');assert.equal(request.model,'configured-model');assert.equal(request.reasoningEffort,'high');assert.deepEqual(request.tools??[],[]);assert.equal(f.saves(),0)
  const agent=f.ctx.agents.get(done.sessionId);assert.equal(agent.session.header.agentPreset,'my-dsh.platform-generator');assert.deepEqual(agent.ctx.tools.schemas(agent),[]);assert.equal(agent.session.requestHeader().config.reasoningEffort,'high')
  assert.equal(agent.session.snapshotEvents().some(event=>event.type==='sandbox/mode'||event.type==='approval/policy'),false,'generator must not append native policy overrides');assert.doesNotMatch(JSON.stringify(request.messages),/private-skill-body/);
  await f.recipes.service.preview('app.generated',3);assert.equal(JSON.stringify(f.recipes.service.list()[0].running),running);await f.recipes.service.activate('app.generated',3);assert.equal(f.recipes.service.list()[0].running.version,2)
 }finally{await f.close()}
})
test('native scoped guard denies global, late scoped and nested execution; cancellation drains a hanging model',async()=>{
 const f=await fixture(['hang']);try{const job=f.start();await live(f);const current=f.generation.dispatch({action:'status',id:job.id}),agent=f.ctx.agents.get(current.sessionId)
 assert.deepEqual(agent.ctx.tools.schemas(agent),[])
 const global=await agent.ctx.tools.execute({name:'write_fixture',arguments:{},callId:ToolCallId('global'),agent,signal:new AbortController().signal});assert.equal(global.isError,true)
 agent.ctx.tools.register({...f.tool,name:'late_scoped'});const nestedToken={};const nested=await agent.ctx.tools.execute({name:'late_scoped',arguments:{},callId:ToolCallId('nested'),agent,signal:new AbortController().signal,parent:nestedToken});assert.equal(nested.isError,true);assert.match(JSON.stringify(nested.content),/Application generation does not permit tool execution/);assert.equal(f.executions(),0)
 f.generation.dispatch({action:'cancel',id:job.id});const done=await f.generation.settled(job.id);assert.equal(done.status,'cancelled');assert.equal(agent.status,'idle');assert.deepEqual(f.recipes.service.list(),[])
 }finally{await f.close()}
})
test('malformed, unsupported and incomplete native outputs never save; Agent failure is visible',async()=>{
 const invalid=[textResponse('not json'),textResponse(JSON.stringify({...recipe(),schemaVersion:2})),textResponse(JSON.stringify(recipe(1,'unregistered'))),maxTokensResponse(JSON.stringify(recipe())),()=>{throw new Error('Native provider failed')}]
 const f=await fixture(invalid);try{for(let i=0;i<invalid.length;i++){const done=await f.generation.settled(f.start().id);assert.equal(done.status,'failed',JSON.stringify(done));assert.ok(done.error);assert.deepEqual(f.recipes.service.list(),[])}}finally{await f.close()}
})
test('generation CAS rejects concurrent editing and service close cancels/drains real requests',async()=>{
 const f=await fixture(['hang','hang']);try{const first=f.start();await live(f);await f.recipes.service.save(recipe(),0);f.generation.dispatch({action:'cancel',id:first.id});await f.generation.settled(first.id);assert.throws(()=>f.start(),/Recipe changed/)
 const second=f.start(1,1);await live(f,2);const agent=f.ctx.agents.get(f.generation.dispatch({action:'status',id:second.id}).sessionId);await f.generation.dispose();assert.equal((await f.generation.settled(second.id)).status,'cancelled');assert.equal(agent.status,'idle');assert.equal(f.recipes.service.list()[0].revision,1)
 }finally{await f.close()}
})
test('authenticated bounded route rejects invalid requests without model calls',async()=>{
 const f=await fixture([]);try{const call=async(body,method='POST',type='application/json')=>{const req=Readable.from([body]);req.method=method;req.headers={'content-type':type};let status;await f.generation.handle(req,{setHeader:()=>{},writeHead:s=>{status=s},end:()=>{}});return status};f.ctx.connection.requestRejection=()=>401;assert.equal(await call('{}'),401);f.ctx.connection.requestRejection=()=>undefined;assert.equal(await call('{}','GET'),405);assert.equal(await call('{}','POST','text/plain'),415);assert.equal(await call('x'.repeat(32769)),413);assert.equal(await call('{'),409);assert.equal(f.adapter.requests.length,0)}finally{await f.close()}
})

test('completed real model output loses CAS to an intervening manual edit without overwriting draft',async()=>{
 const f=await fixture([validResponse()]);let release;const gate=new Promise(r=>{release=r}),original=f.adapter.stream.bind(f.adapter);f.adapter.stream=async function* (options){let first=true;for await(const chunk of original(options)){yield chunk;if(first){first=false;await gate}}}
 try{const job=f.start();await live(f);const manual={...recipe(),name:'Manual edit wins'};await f.recipes.service.save(manual,0);release();const done=await f.generation.settled(job.id);assert.equal(done.status,'failed');assert.match(done.error,/Recipe changed/);assert.equal(f.recipes.service.list()[0].draft.name,'Manual edit wins');assert.equal(f.recipes.service.list()[0].revision,1)}finally{release();await f.close()}
})
test('generated drafts reject unknown preset, Skill, connection and extra executable fields',async()=>{
 const rows=[{...recipe(),roles:[{id:'reader',name:'Reader',presetId:'stock-reader',skillNames:['missing-skill']}]},{...recipe(),roles:[{id:'reader',name:'Reader',presetId:'missing-preset',skillNames:[]}]},{...recipe(),connections:[{id:'private',sourceAppId:'another-app',resource:'secret'}]},{...recipe(),code:'console.log(1)'}]
 const f=await fixture(rows.map(row=>textResponse(JSON.stringify(row))));const remove=await f.ctx.agentPresets.register({id:'stock-reader',plugins:[]});try{for(const row of rows){const done=await f.generation.settled(f.start().id);assert.equal(done.status,'failed');assert.deepEqual(f.recipes.service.list(),[])}}finally{await remove();await f.close()}
})

test('cancelling before native admission sends no model request and preserves empty draft storage',async()=>{const f=await fixture([]);try{const job=f.start();f.generation.dispatch({action:'cancel',id:job.id});assert.equal((await f.generation.settled(job.id)).status,'cancelled');assert.equal(f.adapter.requests.length,0);assert.deepEqual(f.recipes.service.list(),[])}finally{await f.close()}})
