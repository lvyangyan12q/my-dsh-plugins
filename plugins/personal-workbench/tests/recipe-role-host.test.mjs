import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {installRecipes} from '../src/recipe-host.ts'
import {installRecipeRoles} from '../src/recipe-role-host.ts'
import {RoleBindings} from '../src/role-bindings.ts'
import {roleBindingsDomain} from '../src/role-domain.ts'
import {installCapabilities} from '../src/capability-host.ts'
import {capabilityDomain} from '../src/capability-domain.ts'
const source=process.env.DSH_SOURCE;assert.ok(source)
const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json')),{Context}=require('@deepseek-ai/cordis')
const built=p=>import(pathToFileURL(resolve(source,p,'lib/index.js')).href)
const {default:Storage}=await built('packages/storage/storage'),{JsonStorageBackend}=await built('packages/storage/storage-json'),{DomainFacility}=await built('packages/storage/storage-domain')
const key={appId:'app.reading',instanceId:'first',roleId:'analyst'}
const recipe=(version=1,presetId='my-dsh.analyst')=>({schemaVersion:1,appId:key.appId,version,name:'Reading',description:'',pages:[{id:'home',label:'Home',layout:'stack',modules:[{id:'chat',type:'role-chat',title:'Analyst',roleId:'analyst',config:{}}]}],connections:[],roles:[{id:'analyst',name:'Analyst',presetId,skillNames:['summarize']}]})
const agent=id=>({id,name:id,description:'Analyst',persona:'Analyze',skillNames:['summarize'],modelInvocable:true,userInvocable:true,revision:1})
const skill={name:'summarize',description:'Summary',content:'Summarize evidence',modelInvocable:true,userInvocable:true,revision:1}
async function fixture(root,native){
 const host=new Context();await host.plugin(Storage);host.storage.backend.register('json',new JsonStorageBackend(root));const facility=new DomainFacility(host,{backend:'json',routes:{}});host.storage.mount('domain',facility)
 let disabled=false,missing=false,workspace=true,owner
 const ctx={storageDomain:facility,get:name=>ctx[name],connection:{requestRejection:()=>undefined},reflect:{provide:(name,value)=>{ctx[name]=value;return()=>{delete ctx[name]}}},personalWorkbenchApps:{read:()=>({enabled:!disabled})},workspaceRegistry:{list:()=>workspace?[{path:root,status:async()=> 'ok'}]:[]},on:()=>()=>{},tools:{},agentPresets:{register:async()=>async()=>{},list:async()=>[{id:'my-dsh.analyst'},{id:'my-dsh.editor'}],resolve:async id=>({id,broken:missing?'Missing':undefined}),acquireScope:async id=>({key:{preset:id},[Symbol.asyncDispose]:async()=>{}})},skills:{register:()=>()=>{},snapshot:async()=>({complete:true,skills:[{name:'summarize',invocation:{userInvocable:true}}]})}}
 const recipes=await installRecipes(ctx),domain=await facility.open(roleBindingsDomain),capabilities=await facility.open(capabilityDomain)
 if(!capabilities.table('agents').get('analyst')){await capabilities.table('agents').put('analyst',agent('analyst'));await capabilities.table('agents').put('editor',agent('editor'));await capabilities.table('skills').put('summarize',skill)}
 const bindings=new RoleBindings(domain.table('bindings'),{validate:definition=>owner.service.validate(definition),validateExisting:async row=>{assert.equal(native.headers.get(row.sessionId),row.presetId)},create:async row=>{native.created.push(row);native.headers.set(row.sessionId,row.presetId);return row.sessionId}});ctx.personalWorkbenchBindings=bindings
 await capabilities.close();const capabilityOwner=await installCapabilities(ctx)
 owner=await installRecipeRoles(ctx)
 return {owner,recipes,bindings,capabilities:capabilityOwner,ctx,disable:value=>disabled=value,missing:value=>missing=value,workspace:value=>workspace=value,close:async()=>{await owner.dispose();await bindings.dispose();await domain.close();await capabilityOwner.dispose();await recipes.dispose();await host.fiber.dispose()}}
}
test('real Host persistence restores instance roles and exact native bindings; explicit Agent change preserves old histories',async()=>{
 const root=await mkdtemp(join(tmpdir(),'recipe-roles-')),native={headers:new Map(),created:[]};let first,second
 try{
  first=await fixture(root,native);await first.recipes.service.save(recipe(),0);await first.recipes.service.preview(key.appId,1);await first.recipes.service.activate(key.appId,1)
  assert.equal(native.created.length,0);assert.equal(first.bindings.listRoles().length,0)
  await first.owner.service.register(key);assert.equal(native.created.length,0);const old=await first.bindings.ensure(key)
  const other={...key,instanceId:'second'};await first.owner.service.register(other);const separate=await first.bindings.ensure(other);assert.notEqual(separate.sessionId,old.sessionId);assert.equal(old.creation.cwd,root)
  await first.close();first=undefined;second=await fixture(root,native);assert.equal(second.bindings.listRoles().length,2);assert.equal((await second.bindings.read(key)).sessionId,old.sessionId);assert.equal(native.created.length,2)
  await second.recipes.service.save(recipe(2,'my-dsh.editor'),2);await second.recipes.service.activate(key.appId,3);await second.owner.service.register(key);assert.equal(native.created.length,2,'Agent config and declaration update do not create a Session')
  await second.owner.service.register(key,true);const replaced=await second.bindings.ensure(key);assert.equal(replaced.presetId,'my-dsh.editor');assert.notEqual(replaced.sessionId,old.sessionId);assert.deepEqual(replaced.previousSessionIds,[old.sessionId]);assert.equal(native.headers.get(old.sessionId),'my-dsh.analyst');assert.equal((await second.bindings.read(other)).sessionId,separate.sessionId)
  const agentOnly=recipe(3,'my-dsh.editor');agentOnly.roles[0].skillNames=[];await second.recipes.service.save(agentOnly,4);await second.recipes.service.activate(key.appId,5);await second.owner.service.register(key);assert.deepEqual(second.bindings.definition(key).skillNames,[])
  second.disable(true);await assert.rejects(second.owner.service.register(key),/disabled/);await assert.rejects(second.bindings.ensure(key),/disabled/)
  second.disable(false);second.missing(true);await assert.rejects(second.bindings.ensure(key),/Unavailable Agent/);second.missing(false)
  await second.capabilities.dispatch({action:'agent-save',agent:{...agent('editor'),userInvocable:false},expectedRevision:1});await assert.rejects(second.bindings.ensure(key),/Unavailable Agent/);await second.capabilities.dispatch({action:'agent-save',agent:agent('editor'),expectedRevision:2})
  await second.capabilities.dispatch({action:'skill-save',skill:{...skill,userInvocable:false},expectedRevision:1});await assert.rejects(second.bindings.ensure(key),/Unavailable Skill/);assert.equal(native.created.length,3)
 }finally{await first?.close();await second?.close();await rm(root,{recursive:true,force:true})}
})
test('unsupported role, subject and unavailable trusted workspace cannot allocate a native Session',async()=>{
 const root=await mkdtemp(join(tmpdir(),'recipe-role-fail-')),native={headers:new Map(),created:[]},f=await fixture(root,native)
 try {await f.recipes.service.save(recipe(),0);await f.recipes.service.activate(key.appId,1);await assert.rejects(f.owner.service.register({...key,roleId:'missing'}),/unavailable/);await assert.rejects(f.owner.service.register({...key,subject:'invented'}),/unavailable/);f.workspace(false);await assert.rejects(f.owner.service.register(key),/workspace/);assert.deepEqual(native.created,[])}finally{await f.close();await rm(root,{recursive:true,force:true})}
})

test('selected trusted workspace controls new instances and cannot silently move existing sessions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'recipe-selected-root-')),native={headers:new Map(),created:[]},f=await fixture(root,native)
 const selected=join(root,'selected'),other=join(root,'other')
 f.ctx.workspaceRegistry.list=()=>[root,selected,other].map(path=>({path,status:async()=> 'ok'}))
 try{const draft={...recipe(),workspace:selected};await f.recipes.service.save(draft,0);await f.recipes.service.activate(key.appId,1)
  assert.equal(await f.owner.service.workspace(key.appId,key.instanceId),selected);await f.owner.service.register(key);const binding=await f.bindings.ensure(key);assert.equal(binding.creation.cwd,selected)
  await f.recipes.service.save({...draft,version:2,workspace:other},2);await f.recipes.service.activate(key.appId,3)
  await assert.rejects(f.owner.service.workspace(key.appId,key.instanceId),/workspace.*changed|changed.*workspace/i);await assert.rejects(f.owner.service.register(key),/workspace.*changed|changed.*workspace/i)
  assert.equal((await f.bindings.read(key)).sessionId,binding.sessionId);assert.equal(native.created.length,1)
  assert.equal(await f.owner.service.workspace(key.appId,'new-instance'),other)
  await f.recipes.service.save({...draft,version:3,workspace:join(root,'unregistered')},4);await assert.rejects(f.recipes.service.activate(key.appId,5),/workspace/i)
  assert.equal(f.recipes.service.list()[0].running.workspace,other)
 }finally{await f.close();await rm(root,{recursive:true,force:true})}
})
