import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, writeFile, lstat, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { mountKaogong } from '../src/production-host.ts'

const native=process.env.DSH_SOURCE??'D:/programming/workspace/deepseek-harness'
const require=createRequire(resolve(native,'packages/client/ui-renderer/package.json'))
const {Context}=require('@deepseek-ai/cordis')
const load=file=>import(pathToFileURL(resolve(native,file)).href)
const {default:Storage}=await load('packages/storage/storage/lib/index.js')
const {JsonStorageBackend}=await load('packages/storage/storage-json/lib/index.js')
const {DomainFacility}=await load('packages/storage/storage-domain/lib/index.js')
async function fixture(){
 const home=await mkdtemp(join(tmpdir(),'kaogong-current-handoff-')),profile=join(home,'profiles','old'),directory=join(profile,'worktable-platform')
 await mkdir(directory,{recursive:true});await mkdir(join(home,'profiles','independent'),{recursive:true})
 const metadata={applications:{schema:1,applications:[],instances:[{id:'current-a',appId:'kaogong',title:'保留档案',revision:1,projectId:null,createdAt:1,lastOpenedAt:2},{id:'library-a',appId:'kaogong-library',title:'当前资料库',revision:1,projectId:null,createdAt:1,lastOpenedAt:1}],views:[{id:'current-view-a',instanceId:'current-a',type:'page'},{id:'current-view-b',instanceId:'current-a',type:'practice'},{id:'library-view',instanceId:'library-a',type:'page'}],deepApplicationIds:['kaogong','kaogong-library']},resources:{schema:1,connections:[]},roles:{schema:1,bindings:[],capabilities:[]},tasks:{schema:4,bindings:[],capabilities:[],tasks:[]},migrations:{schema:1,baselines:[],plans:[]}}
 const save=async()=>{for(const[n,data]of Object.entries(metadata))await writeFile(join(directory,n+'.v1.json'),JSON.stringify(data))};await save()
 const context=new Context();await context.plugin(Storage);const backend=new JsonStorageBackend(join(home,'storages'));context.storage.backend.register('json',backend)
 const routes=new Map(),ctx={storageDomain:new DomainFacility(context,{backend:'json'}),profileContext:{home,dir:join(home,'profiles','independent')},sessionPersistence:{stat:async sessionId=>({header:{id:sessionId,cwd:home},formatStatus:'current'})},sessionController:{projections:async()=>({kind:'sequenced',values:{agentPreset:'standard'}}),prompt:async()=>{throw Error('test forbids resending Native task')}},workspaceRegistry:{list:()=>[{id:'workspace-current',path:home,sessionIds:['existing-native']}]},connection:{admit:()=>({peer:{}})},webServer:{register:route=>{routes.set(route.path,route);return()=>routes.delete(route.path)}},tools:{register:()=>()=>{}},on:()=>()=>{}}
 let stop=await mountKaogong(ctx,{currentSourceProfile:profile,questionImageRoot:{get:()=>undefined},mineru:{get:()=>undefined}})
 const request=async(body,path='/api/kaogong/study')=>{const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{url:path,method:body?'POST':'GET',headers:{'content-type':'application/json'}});const res={status:0,headersSent:false,writeHead(status){this.status=status;this.headersSent=true},end(value){this.value=JSON.parse(value)}};await routes.get(path.split('?')[0]).handler(req,res);return res}
 return{home,profile,directory,metadata,save,ctx,request,async restart(){await stop();stop=await mountKaogong(ctx,{currentSourceProfile:profile,questionImageRoot:{get:()=>undefined},mineru:{get:()=>undefined}})},async close(){await stop();await backend.close();await context.fiber.dispose();const scan=async p=>{const s=await lstat(p);assert.equal(s.isSymbolicLink(),false);if(s.isDirectory())for(const n of await readdir(p))await scan(join(p,n))};await scan(home);await rm(home,{recursive:true})}}
}

test('current study handoff previews exact IDs without writing and confirms once across profiles in the same Native home',async()=>{
 const app=await fixture()
 try{
  assert.equal((await app.request()).value.profiles.length,0)
  const preview=await app.request({action:'current-preview'})
  assert.equal(preview.status,200,JSON.stringify(preview.value))
  assert.deepEqual(preview.value.profiles.map(row=>row.id),['current-a','library-a'])
  assert.equal((await app.request()).value.profiles.length,0)
  const accepted=await app.request({action:'current-confirm',id:preview.value.id,digest:preview.value.digest,confirmed:true})
  assert.equal(accepted.status,200,JSON.stringify(accepted.value))
  const state=(await app.request()).value
  assert.deepEqual(state.profiles.map(row=>row.id),['current-a','library-a'])
  assert.equal(state.views.filter(row=>row.profileId==='current-a').length,2)
  await app.restart()
  assert.equal((await app.request({action:'current-confirm',id:preview.value.id,digest:preview.value.digest,confirmed:true})).status,200)
  assert.equal((await app.request()).value.profiles.length,2)
 }finally{await app.close()}
})

test('current role identity and revoked grants survive, while old prepared payloads require a fresh preparation',async()=>{
 const app=await fixture()
 try{
  app.metadata.roles.bindings=[{key:JSON.stringify(['current-a','teacher']),appId:'kaogong',instanceId:'current-a',roleId:'teacher',sessionId:'existing-native',presetId:'standard',phase:'ready',revision:7,creation:{cwd:app.home},previousSessionIds:[],agent:{kind:'agent',source:'application',ownerAppId:'kaogong',id:'teacher'}}]
  app.metadata.resources.connections=[{id:'grant-old',ownerAppId:'kaogong-library',consumerAppId:'kaogong',ownerInstanceId:'library-a',consumerInstanceId:'current-a',resourceId:'materials',status:'revoked',revision:3,allowedActions:['read']}]
  app.metadata.tasks.tasks=[{id:'old-prepared',appId:'kaogong',instanceId:'current-a',roleId:'teacher',sessionId:'existing-native',status:'prepared',revision:1,bindingRevision:7,instanceRevision:1,text:'old source context',source:{viewId:'current-view-a'},contexts:[]}];await app.save()
  const original=await readFile(join(app.directory,'roles.v1.json'))
  const preview=(await app.request({action:'current-preview'})).value
  assert.equal((await app.request({action:'current-confirm',id:preview.id,digest:preview.digest,confirmed:true})).status,200)
  const binding=(await app.request({action:'role-read',viewId:'current-view-b',roleId:'teacher'})).value.binding
  assert.equal(binding.sessionId,'existing-native');assert.equal(binding.revision,7);assert.equal(binding.creation.cwd,app.home)
  const source=(await app.request({action:'source-list',viewId:'current-view-a'})).value.connections[0]
  assert.equal(source.status,'revoked');assert.equal(source.revision,3)
  assert.equal((await app.request({action:'task-submit',viewId:'current-view-a',id:'old-prepared',revision:1})).status,409)
  assert.equal((await app.request({action:'task-list',viewId:'current-view-a'})).value[0].status,'prepared')
  assert.deepEqual(await readFile(join(app.directory,'roles.v1.json')),original)
 }finally{await app.close()}
})

test('changed source digest refuses confirmation and carried accepted or uncertain teaching never resends',async()=>{
 const app=await fixture()
 try{
  app.metadata.tasks.tasks=[{id:'accepted-task',appId:'kaogong',instanceId:'current-a',roleId:'teacher',sessionId:'existing-native',requestId:'accepted-request',status:'accepted',revision:2,ownerFinalization:'done',source:{viewId:'current-view-a'},contexts:[]},{id:'uncertain-task',appId:'kaogong',instanceId:'current-a',roleId:'teacher',sessionId:'existing-native',requestId:'uncertain-request',status:'unknown',revision:2,source:{viewId:'current-view-a'},contexts:[]}];await app.save()
  const first=(await app.request({action:'current-preview'})).value
  app.metadata.applications.instances[0].title='明确更新后的标题';await app.save()
  assert.equal((await app.request({action:'current-confirm',id:first.id,digest:first.digest,confirmed:true})).status,409)
  assert.equal((await app.request()).value.profiles.length,0)
  const next=(await app.request({action:'current-preview'})).value
  assert.equal((await app.request({action:'current-confirm',id:next.id,digest:next.digest,confirmed:true})).status,200)
  assert.deepEqual((await app.request({action:'task-list',viewId:'current-view-a'})).value.map(row=>[row.id,row.status,row.requestId]),[['accepted-task','accepted','accepted-request'],['uncertain-task','unknown','uncertain-request']])
  assert.equal((await app.request({action:'task-submit',viewId:'current-view-a',id:'accepted-task',revision:2})).status,409)
  assert.equal((await app.request({action:'task-submit',viewId:'current-view-a',id:'uncertain-task',revision:2})).status,409)
  assert.equal((await app.request({action:'task-recover',viewId:'current-view-a',id:'accepted-task'})).status,200)
  assert.equal((await app.request({action:'current-preview',sourceProfile:'arbitrary'})).status,409)
 }finally{await app.close()}
})

test('unknown source provisioning and cross-home metadata cannot activate retained profiles',async()=>{
 const app=await fixture()
 try{
  app.metadata.applications.provisions=[{kind:'instance-admission',id:'current-a',operationId:'unfinished-operation',state:'pending'}];app.metadata.applications.schema=5;await app.save()
  const preview=await app.request({action:'current-preview'})
  assert.equal(preview.status,200);assert.ok(preview.value.conflicts.length)
  assert.equal((await app.request({action:'current-confirm',id:preview.value.id,digest:preview.value.digest,confirmed:true})).status,409)
  assert.equal((await app.request()).value.profiles.length,0)
  app.ctx.profileContext.home=tmpdir()
  assert.equal((await app.request({action:'current-preview'})).status,409)
 }finally{await app.close()}
})

test('ambiguous active source grants are refused instead of selecting a first match',async()=>{
 const app=await fixture()
 try{const grant={ownerAppId:'kaogong-library',consumerAppId:'kaogong',ownerInstanceId:'library-a',consumerInstanceId:'current-a',resourceId:'materials',status:'active',revision:1,allowedActions:['read']};app.metadata.resources.connections=[{...grant,id:'one'},{...grant,id:'two'}];await app.save();assert.equal((await app.request({action:'current-preview'})).status,409);assert.equal((await app.request()).value.profiles.length,0)}finally{await app.close()}
})

test('unnamed retained profiles remain distinguishable and continuation must explicitly select one learner',async()=>{
 const app=await fixture()
 try{delete app.metadata.applications.instances[0].title;app.metadata.applications.instances.push({id:'current-b',appId:'kaogong',revision:1,projectId:null,createdAt:1,lastOpenedAt:1});app.metadata.applications.views.push({id:'view-b',instanceId:'current-b',type:'page'});await app.save();const preview=(await app.request({action:'current-preview'})).value;assert.match(preview.profiles[0].title,/current-a/);assert.equal((await app.request({action:'current-confirm',id:preview.id,digest:preview.digest,confirmed:true})).status,409);assert.equal((await app.request({action:'current-confirm',id:preview.id,digest:preview.digest,confirmed:true,continueProfileId:'current-b'})).status,200);assert.equal((await app.request()).value.lastProfileId,'current-b')}finally{await app.close()}
})
