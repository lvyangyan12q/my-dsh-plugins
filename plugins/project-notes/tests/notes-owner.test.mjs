import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {installNotes} from '../src/notes-host.ts'
const source=process.env.DSH_SOURCE;assert.ok(source,'set DSH_SOURCE to official built rc.2')
const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json')),{Context}=require('@deepseek-ai/cordis')
const load=path=>import(pathToFileURL(resolve(source,path,'lib/index.js')).href)
const {default:Storage}=await load('packages/storage/storage'),{JsonStorageBackend}=await load('packages/storage/storage-json'),{DomainFacility}=await load('packages/storage/storage-domain')

test('notes have independent durable business state, strict revision writes and owner-rendered selected context',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'project-notes-')),ctx=new Context();let owner;
 try{
  await ctx.plugin(Storage);ctx.storage.backend.register('json',new JsonStorageBackend(folder));const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility);
  owner=await installNotes({storageDomain:facility});
  const a=owner.resource,before=await a.read('instance-A');
  const saved=await a.mutate('instance-A','create',{note:{title:'会议要点',body:'核对报价后再决定。'}},before.revision,async()=>{});
  assert.equal(saved.notes.length,1);assert.equal(saved.notes[0].title,'会议要点');assert.equal((await a.read('instance-B')).notes.length,0);
  await assert.rejects(a.mutate('instance-A','update',{id:saved.notes[0].id,note:{title:'旧草稿',body:'不得覆盖'}},before.revision,async()=>{}),/更新/);
  const context=await a.taskContext(saved,{ids:[saved.notes[0].id],filter:{search:'会议',includeArchived:false}});
  assert.match(context.text,/核对报价后再决定/);assert.doesNotMatch(context.text,/旧草稿/);
  await assert.rejects(Promise.resolve().then(()=>a.taskContext(saved,{ids:['foreign-note'],filter:{search:'',includeArchived:false}})),/选择/);
  await owner.dispose();owner=await installNotes({storageDomain:facility});assert.equal((await owner.resource.read('instance-A')).notes[0].body,'核对报价后再决定。');
 }finally{await owner?.dispose();await ctx.fiber.dispose();await rm(folder,{recursive:true,force:true})}
})
