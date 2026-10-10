import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {Readable} from 'node:stream'
import {installAppLifecycle} from '../src/app-lifecycle-host.ts'
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
 const owner=await installAppLifecycle({storageDomain:facility,connection:{requestRejection:()=>rejection},reflect:{provide:()=>()=>{}}})
 return {owner,deny:v=>{rejection=v},call:async(data,method='POST',contentType='application/json')=>{
 const req=Readable.from([typeof data==='string'?data:JSON.stringify(data)]);req.method=method;req.headers={'content-type':contentType}
 let status,value;const res={setHeader:()=>{},writeHead:v=>{status=v},end:v=>{value=v?JSON.parse(v):undefined}}
 await owner.handle(req,res);return {status,value}
 },close:async()=>{await owner.dispose();await ctx.fiber.dispose()}}
}
test('real Host persists availability, rejects stale writes, and restore never touches app data or Sessions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'app-lifecycle-'));let first,second
 try{
 first=await fixture(root)
 assert.equal(first.owner.service.read('reading').enabled,true)
 const updates=await Promise.all([first.call({action:'set-enabled',appId:'reading',enabled:false,expectedRevision:0}),first.call({action:'set-enabled',appId:'reading',enabled:true,expectedRevision:0})])
 assert.deepEqual(updates.map(r=>r.status),[200,409])
 await first.close();first=undefined;second=await fixture(root)
 assert.deepEqual(second.owner.service.read('reading'),{appId:'reading',enabled:false,revision:1})
 assert.equal(second.owner.service.read('other').enabled,true)
 assert.equal((await second.call({action:'set-enabled',appId:'reading',enabled:true,expectedRevision:1})).status,200)
 assert.equal(second.owner.service.read('reading').enabled,true)
 }finally{await first?.close();await second?.close();await rm(root,{recursive:true,force:true})}
})
test('route requires authenticated bounded JSON and rejects calls after disposal',async()=>{
 const root=await mkdtemp(join(tmpdir(),'app-lifecycle-'));const f=await fixture(root)
 try{
 f.deny(401);assert.equal((await f.call('bad')).status,401);f.deny(undefined)
 assert.equal((await f.call({},'GET')).status,405);assert.equal((await f.call({},'POST','text/plain')).status,415)
 assert.equal((await f.call('bad')).status,400);assert.equal((await f.call('x'.repeat(16385))).status,413)
 assert.equal((await f.call({action:'set-enabled',appId:'reading',enabled:false,expectedRevision:0,sessionId:'forbidden'})).status,400)
 assert.equal((await f.call({action:'catalog'})).status,200)
 await f.owner.dispose();assert.equal((await f.call({action:'catalog'})).status,503)
 }finally{await f.close();await rm(root,{recursive:true,force:true})}
})
