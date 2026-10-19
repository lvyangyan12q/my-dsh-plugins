import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {Readable} from 'node:stream'
import {installReading} from '../src/reading-host.ts'
const source=process.env.DSH_SOURCE;assert.ok(source)
const official=createRequire(resolve(source,'packages/client/ui-renderer/package.json'))
const {Context}=official('@deepseek-ai/cordis')
const built=p=>import(pathToFileURL(resolve(source,p,'lib/index.js')).href)
const {default:Storage}=await built('packages/storage/storage')
const {JsonStorageBackend}=await built('packages/storage/storage-json')
const {DomainFacility}=await built('packages/storage/storage-domain')
test('owner requires current business revision and closes the arbitrary instance HTTP bypass',async()=>{const folder=await mkdtemp(join(tmpdir(),'reading-grants-')),ctx=new Context();let owner;try{await ctx.plugin(Storage);ctx.storage.backend.register('json',new JsonStorageBackend(folder));const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility);owner=await installReading({storageDomain:facility,connection:{requestRejection:()=>undefined}});const record={title:'Owner book',author:'',category:'',status:'reading',minutes:12,notes:''};const created=await owner.resource.mutate('a','create',{record},owner.read('a').revision,async()=>{});assert.match(created.revision,/^1:/);await assert.rejects(owner.resource.mutate('a','update',{recordId:created.records[0].id,record:{...record,title:'stale overwrite'}},'0:'+created.revision.split(':')[1],async()=>{}),/已更新/);assert.equal(owner.read('a').records[0].title,'Owner book');let status;const req=Readable.from([JSON.stringify({action:'read',instanceId:'a'})]);req.method='POST';req.headers={'content-type':'application/json'};await owner.handle(req,{setHeader(){},writeHead(code){status=code},end(){}});assert.equal(status,403)}finally{await owner?.dispose();await ctx.fiber.dispose();await rm(folder,{recursive:true,force:true})}})

test('Host references use real reading owner; revoke fences queued writes and new instances never inherit grants',async()=>{
  const {ApplicationDirectory}=await import('../../worktable/01_content/src/framework/applications.mjs'),{ResourceDirectory}=await import('../../worktable/01_content/src/framework/resources.mjs')
  const folder=await mkdtemp(join(tmpdir(),'reading-owner-reference-')),ctx=new Context();let owner
  try{
    await ctx.plugin(Storage);ctx.storage.backend.register('json',new JsonStorageBackend(folder));const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility)
    owner=await installReading({storageDomain:facility,connection:{requestRejection:()=>undefined}})
    const apps=new ApplicationDirectory(join(folder,'apps.json'));await apps.contribute({id:'reading-statistics',title:'Reading',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]})
    const a=await apps.createInstance('reading-statistics','A'),b=await apps.createInstance('reading-statistics','B'),c=await apps.createInstance('reading-statistics','C'),av=await apps.createView(a.id),bv=await apps.createView(b.id),cv=await apps.createView(c.id)
    const grants=new ResourceDirectory(join(folder,'grants.json'),apps);grants.register(owner.resource)
    const request=(viewId,action,extra={})=>grants.call({viewId,resourceId:'reading-records',action,...extra})
    const record={title:'A private record',author:'',category:'',status:'reading',minutes:19,notes:'Owned by A'}
    await request(av.id,'create',{payload:{record},expectedRevision:owner.read(a.id).revision});const version1=owner.read(a.id).revision;const share=await grants.share({ownerViewId:av.id,consumerInstanceId:b.id,resourceId:'reading-records'})
    assert.equal((await request(bv.id,'read')).value.records[0].title,record.title);assert.equal(owner.read(b.id).records.length,0);assert.equal((await request(cv.id,'read')).value.records.length,0)
    await assert.rejects(request(bv.id,'create',{payload:{record},expectedRevision:version1,expectedConnectionRevision:share.revision}),{code:'action-denied'})
    const writable=await grants.permissions(share.id,share.revision,['read','create','update','delete']);const edited=await request(bv.id,'update',{payload:{recordId:owner.read(a.id).records[0].id,record:{...record,minutes:40}},expectedRevision:version1,expectedConnectionRevision:writable.revision});assert.match(edited.value.revision,/^2:/);assert.equal(owner.read(a.id).records[0].minutes,40);assert.equal(owner.read(b.id).records.length,0)
    await assert.rejects(request(bv.id,'update',{payload:{recordId:edited.value.records[0].id,record},expectedRevision:version1,expectedConnectionRevision:writable.revision}),/已更新/)
    let release,started;const entered=new Promise(resolve=>{started=resolve}),block=new Promise(resolve=>{release=resolve})
    const first=owner.resource.mutate(a.id,'create',{record:{...record,title:'Before revoke'}},owner.read(a.id).revision,async()=>{started();await block});await entered
    const queued=request(bv.id,'create',{payload:{record:{...record,title:'Must not commit'}},expectedRevision:owner.read(a.id).revision,expectedConnectionRevision:writable.revision});const outcome=queued.catch(error=>error)
    await grants.revoke(writable.id,writable.revision);release();await first;assert.equal((await outcome).code,'revoked');assert.equal(owner.read(a.id).records.length,2);await assert.rejects(request(bv.id,'read'),{code:'revoked'})
    const reloaded=new ResourceDirectory(join(folder,'grants.json'),apps);reloaded.register(owner.resource);await assert.rejects(reloaded.call({viewId:bv.id,resourceId:'reading-records',action:'read'}),{code:'revoked'});assert.equal(owner.read(a.id).records[0].minutes,40)
  }finally{await owner?.dispose();await ctx.fiber.dispose();await rm(folder,{recursive:true,force:true})}
})

test('new owner writes retain exact v1 business rows readable by old schema; old writes invalidate revisions',async()=>{
  const {readingDomain}=await import('../src/reading-host.ts'),folder=await mkdtemp(join(tmpdir(),'reading-rollback-')),ctx=new Context();let owner,legacy
  try{
    await ctx.plugin(Storage);ctx.storage.backend.register('json',new JsonStorageBackend(folder));const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility);owner=await installReading({storageDomain:facility,connection:{requestRejection:()=>undefined}})
    await owner.initialize('old-kept','empty');const original=owner.read('old-kept').revision;await owner.dispose();owner=undefined
    legacy=await facility.open(readingDomain);const row=legacy.table('instances').get('old-kept');assert.deepEqual(Object.keys(row).sort(),['initialized','instanceId','records']);row.records.push({id:'legacy-book',title:'Written by old product',author:'',category:'',status:'reading',minutes:17,notes:''});await legacy.table('instances').put('old-kept',row);await legacy.close();legacy=undefined
    owner=await installReading({storageDomain:facility,connection:{requestRejection:()=>undefined}});assert.equal(owner.read('old-kept').records[0].minutes,17);assert.notEqual(owner.read('old-kept').revision,original);await assert.rejects(owner.resource.mutate('old-kept','delete',{recordId:'legacy-book',confirmed:true},original,async()=>{}),/已更新/)
  }finally{await legacy?.close();await owner?.dispose();await ctx.fiber.dispose();await rm(folder,{recursive:true,force:true})}
})


test('client refuses a response from another owner or consumer instead of remapping it',async()=>{
  const {requestReading}=await import('../src/reading-data-client.ts'),previous=globalThis.fetch
  try{
    globalThis.fetch=async()=>({ok:true,json:async()=>({value:{instanceId:'wrong-owner',records:[],initialized:false},connection:null})})
    await assert.rejects(requestReading({action:'read',instanceId:'consumer',viewId:'registered-view'}),/归属不匹配/)
    globalThis.fetch=async()=>({ok:true,json:async()=>({value:{instanceId:'owner',records:[],initialized:false},connection:{consumerInstanceId:'other-consumer',ownerInstanceId:'owner',status:'active'}})})
    await assert.rejects(requestReading({action:'read',instanceId:'consumer',viewId:'registered-view'}),/归属不匹配/)
  }finally{globalThis.fetch=previous}
})

test('reading owns selected/filter task context and pins business revision until native admission releases its lease',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'reading-task-context-')),ctx=new Context();let owner;
 try{
 await ctx.plugin(Storage);ctx.storage.backend.register('json',new JsonStorageBackend(folder));const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility);owner=await installReading({storageDomain:facility,connection:{requestRejection:()=>undefined}});
 const row=await owner.initialize('A','examples');const selection={ids:['walden'],filter:{category:'',status:'finished',search:'Walden'}};
 const context=owner.resource.taskContext(row,selection);assert.match(context.text,/瓦尔登湖/);assert.doesNotMatch(context.text,/Pride and Prejudice/);assert.deepEqual(JSON.parse(context.text).selectedIds,['walden']);
 assert.throws(()=>owner.resource.taskContext(row,{...selection,ids:['other-instance-record']}),/已变化/);
 let entered,release;const started=new Promise(resolve=>entered=resolve);const lease=owner.resource.withTaskLease(async()=>{entered();await new Promise(resolve=>release=resolve)});await started;
 let changed=false;const update=owner.resource.mutate('A','update',{recordId:'walden',record:{title:'New owner title',author:'',category:'',status:'reading',minutes:5,notes:''}},row.revision,async()=>{}).then(()=>changed=true);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(changed,false);assert.equal(owner.read('A').records[0].title,'Walden / 瓦尔登湖');release();await lease;await update;assert.equal(owner.read('A').records[0].title,'New owner title');
 }finally{await owner?.dispose();await ctx.fiber.dispose();await rm(folder,{recursive:true,force:true})}
})
