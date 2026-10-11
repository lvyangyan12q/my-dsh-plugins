import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {Readable} from 'node:stream'
import {installRecipes} from '../src/recipe-host.ts'
const source=process.env.DSH_SOURCE
assert.ok(source)
const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json'))
const {Context}=require('@deepseek-ai/cordis')
const built=p=>import(pathToFileURL(resolve(source,p,'lib/index.js')).href)
const {default:Storage}=await built('packages/storage/storage')
const {JsonStorageBackend}=await built('packages/storage/storage-json')
const {DomainFacility}=await built('packages/storage/storage-domain')
async function fixture(root){
 const ctx=new Context();await ctx.plugin(Storage)
 const backend=new JsonStorageBackend(root);ctx.storage.backend.register('json',backend)
 const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility)
 let rejection
 const owner=await installRecipes({storageDomain:facility,connection:{requestRejection:()=>rejection},reflect:{provide:()=>()=>{}}})
 return {owner,deny:v=>{rejection=v},call:async(data,method='POST',contentType='application/json')=>{
 const req=Readable.from([typeof data==='string'?data:JSON.stringify(data)]);req.method=method;req.headers={'content-type':contentType}
 let status,value;const res={setHeader:()=>{},writeHead:v=>{status=v},end:v=>{value=v?JSON.parse(v):undefined}}
 await owner.handle(req,res);return {status,value}
 },close:async()=>{await owner.dispose();await ctx.fiber.dispose()}}
}

const recipe=(version=1,type='stats')=>({schemaVersion:1,appId:'app.reading',version,name:'Reading',description:'',pages:[{id:'home',label:'Home',layout:'grid',modules:[{id:'summary',type,title:'Summary',config:{}}]}],connections:[],roles:[]})
test('durable drafts, isolated preview, CAS activation and invalid replacement preserve running version',async()=>{
 const root=await mkdtemp(join(tmpdir(),'recipe-host-'));let first,second
 try{first=await fixture(root);const saved=await first.call({action:'save',expectedRevision:0,recipe:recipe()});assert.equal(saved.status,200);assert.equal(saved.value.record.running,undefined)
 assert.equal((await first.call({action:'preview',appId:'app.reading',expectedRevision:1})).status,200);assert.equal(first.owner.service.list()[0].running,undefined)
 const result=await Promise.all([first.call({action:'activate',appId:'app.reading',expectedRevision:1}),first.call({action:'activate',appId:'app.reading',expectedRevision:1})]);assert.deepEqual(result.map(r=>r.status),[200,409])
 assert.equal((await first.call({action:'save',expectedRevision:2,recipe:recipe(2,'missing-plugin')})).status,200)
 const rejected=await first.call({action:'activate',appId:'app.reading',expectedRevision:3});assert.equal(rejected.status,409);assert.equal(rejected.value.error.split('Unavailable module: missing-plugin').length-1,1);assert.equal(first.owner.service.list()[0].running.version,1)
 await first.close();first=undefined;second=await fixture(root);assert.equal(second.owner.service.list()[0].running.version,1);assert.equal(second.owner.service.list()[0].draft.version,2)
 const fixed=recipe(2);fixed.connections=[{id:'private',sourceAppId:'other',resource:'data'}];await second.owner.service.save(fixed,3);await assert.rejects(second.owner.service.preview('app.reading',4),error=>{assert.equal(error.message.split('Unavailable data connection: private').length-1,1);return true})
 const duplicate=recipe(2);duplicate.pages.push(duplicate.pages[0]);await second.owner.service.save(duplicate,4);await assert.rejects(second.owner.service.activate('app.reading',5),/Duplicate page/);assert.equal(second.owner.service.list()[0].running.version,1)
 }finally{await first?.close();await second?.close();await rm(root,{recursive:true,force:true})}
})
test('Host route rejects unauthenticated, oversized, unsupported schema and embedded data/code',async()=>{const root=await mkdtemp(join(tmpdir(),'recipe-route-'));const f=await fixture(root);try{f.deny(401);assert.equal((await f.call({action:'catalog'})).status,401);f.deny(undefined);assert.equal((await f.call({},'GET')).status,405);assert.equal((await f.call({},'POST','text/plain')).status,415);assert.equal((await f.call('bad')).status,400);assert.equal((await f.call('x'.repeat(262145))).status,413);const unsupported={...recipe(),schemaVersion:2};assert.equal((await f.call({action:'save',expectedRevision:0,recipe:unsupported})).status,400);const data=recipe();data.pages[0].modules[0].config={records:[{secret:1}]};assert.equal((await f.call({action:'save',expectedRevision:0,recipe:data})).status,400);const code={...recipe(),code:'eval(1)'};assert.equal((await f.call({action:'save',expectedRevision:0,recipe:code})).status,400);await f.owner.dispose();assert.equal((await f.call({action:'catalog'})).status,503)}finally{await f.close();await rm(root,{recursive:true,force:true})}})

test('code-owned application identities reject drafts and activation without changing running recipe',async()=>{const root=await mkdtemp(join(tmpdir(),'recipe-owned-'));const f=await fixture(root);try{const release=f.owner.service.reserveAppId('installed-owner');const row={...recipe(),appId:'installed-owner'};await assert.rejects(f.owner.service.save(row,0),/installed application/);release();await f.owner.service.save(row,0);const unreserve=f.owner.service.reserveAppId('installed-owner');await assert.rejects(f.owner.service.activate('installed-owner',1),/installed application/);assert.equal(f.owner.service.list()[0].running,undefined);unreserve()}finally{await f.close();await rm(root,{recursive:true,force:true})}})

test('only owned installed data sources activate and withdrawing a plugin preserves running recipe',async()=>{const root=await mkdtemp(join(tmpdir(),'recipe-source-'));const f=await fixture(root);try{const row=recipe();row.connections=[{id:'data',sourceAppId:row.appId,resource:'owned'}];row.pages[0].modules[0].connectionId='data';await f.owner.service.save(row,0);await assert.rejects(f.owner.service.preview(row.appId,1),/Unavailable data connection/);const remove=f.owner.service.registerDataSource({appId:row.appId,resource:'owned'});await f.owner.service.preview(row.appId,1);await f.owner.service.activate(row.appId,1);await f.owner.service.save({...row,version:2},2);remove();await assert.rejects(f.owner.service.preview(row.appId,3),/Unavailable data connection/);await assert.rejects(f.owner.service.activate(row.appId,3),/Unavailable data connection/);assert.equal(f.owner.service.list()[0].running.version,1);const fresh=f.owner.service.registerDataSource({appId:row.appId,resource:'owned'});remove();await f.owner.service.preview(row.appId,3);fresh()}finally{await f.close();await rm(root,{recursive:true,force:true})}})
test('conversation module without a declared target role cannot be previewed or activated',async()=>{
 const root=await mkdtemp(join(tmpdir(),'recipe-missing-role-')),f=await fixture(root);try{await f.owner.service.save(recipe(),0);await f.owner.service.activate('app.reading',1);await f.owner.service.save(recipe(2,'role-chat'),2);await assert.rejects(f.owner.service.preview('app.reading',3),/Missing role/);await assert.rejects(f.owner.service.activate('app.reading',3),/Missing role/);assert.equal(f.owner.service.list()[0].running.version,1)}finally{await f.close();await rm(root,{recursive:true,force:true})}
})

test('page templates persist sanitized structures and missing rebinding blocks activation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'recipe-template-'));let first,second
 try{first=await fixture(root);const page={id:'private',label:'Template page',layout:'split',splitPercent:65,modules:[{id:'private-module',title:'Chart',type:'chart',connectionId:'private-data',roleId:'private-role',config:{valueField:'count',taskPrompt:'private-task'}}]}
 const saved=await first.call({action:'save-template',label:'Reusable',page});assert.equal(saved.status,200);assert.equal(saved.value.template.page.modules[0].roleId,undefined);assert.equal(saved.value.template.page.modules[0].connectionId,undefined);assert.ok(!JSON.stringify(saved.value).includes('private-task'));assert.equal(first.owner.service.list().length,0)
 await first.close();first=undefined;second=await fixture(root);const list=await second.call({action:'templates'});assert.equal(list.value.templates.length,1);assert.equal(list.value.templates[0].id,saved.value.template.id);assert.equal(list.value.templates[0].page.splitPercent,65)
 const draft={...recipe(),pages:[{...list.value.templates[0].page,id:'new-page'}]};await second.owner.service.save(draft,0);await assert.rejects(second.owner.service.preview(draft.appId,1),/reused template/);assert.equal(second.owner.service.list()[0].running,undefined)
 second.deny(401);assert.equal((await second.call({action:'templates'})).status,401)
 }finally{await first?.close();await second?.close();await rm(root,{recursive:true,force:true})}
})

test('catalog reports real withdrawn Host modules and owned sources without changing the running recipe',async()=>{
 const root=await mkdtemp(join(tmpdir(),'recipe-dependencies-')),f=await fixture(root)
 try{
  const row=recipe(1,'extension.actual');row.connections=[{id:'data',sourceAppId:row.appId,resource:'owned'}];row.pages[0].modules[0].connectionId='data'
  const removeModule=f.owner.service.registerModule({id:'extension.actual'}),removeSource=f.owner.service.registerDataSource({appId:row.appId,resource:'owned'})
  await f.owner.service.save(row,0);await f.owner.service.activate(row.appId,1)
  const before=structuredClone(f.owner.service.list())
  assert.ok((await f.call({action:'catalog'})).value.dependencies[row.appId].every(dep=>dep.available))
  removeModule();removeSource()
  const after=await f.call({action:'catalog'});assert.equal(after.status,200)
  assert.deepEqual(after.value.dependencies[row.appId],[{id:'extension.actual',available:false,reason:'Unavailable module: extension.actual'},{id:'connection:data',available:false,reason:'Unavailable data connection: data'}])
  assert.deepEqual(f.owner.service.list(),before)
  const restoreModule=f.owner.service.registerModule({id:'extension.actual'}),restoreSource=f.owner.service.registerDataSource({appId:row.appId,resource:'owned'})
  assert.ok((await f.call({action:'catalog'})).value.dependencies[row.appId].every(dep=>dep.available));restoreSource();restoreModule()
 }finally{await f.close();await rm(root,{recursive:true,force:true})}
})
