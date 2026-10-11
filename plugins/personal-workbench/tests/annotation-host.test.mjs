import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {Readable} from 'node:stream'
import {installAnnotationRecords} from '../src/annotation-host.ts'
const source=process.env.DSH_SOURCE;assert.ok(source)
const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json')),{Context}=require('@deepseek-ai/cordis')
const built=p=>import(pathToFileURL(resolve(source,p,'lib/index.js')).href)
const {default:Storage}=await built('packages/storage/storage'),{JsonStorageBackend}=await built('packages/storage/storage-json'),{DomainFacility}=await built('packages/storage/storage-domain')
async function fixture(root,recipe){
 const host=new Context();await host.plugin(Storage);host.storage.backend.register('json',new JsonStorageBackend(join(root,'storage')));const facility=new DomainFacility(host,{backend:'json',routes:{}});host.storage.mount('domain',facility)
 let rejection,enabled=true
 const owner=await installAnnotationRecords({storageDomain:facility,connection:{requestRejection:()=>rejection},personalWorkbenchApps:{read:()=>({enabled})},personalWorkbenchRecipes:{list:()=>[{appId:recipe.appId,running:recipe}]},personalWorkbenchRecipeRoles:{workspace:async()=>root}})
 return {deny:value=>{rejection=value},disable:()=>{enabled=false},call:async(data,method='POST')=>{const req=Readable.from([JSON.stringify(data)]);req.method=method;req.headers={'content-type':'application/json'};let status,value;await owner.handle(req,{setHeader:()=>{},writeHead:n=>{status=n},end:body=>{value=body?JSON.parse(body):undefined}});return {status,value}},close:async()=>{await owner.dispose();await host.fiber.dispose()}}
}
const recipe=()=>({appId:'app.test',version:1,roles:[{id:'maker'}],pages:[{id:'home',modules:[{id:'one',type:'custom',roleId:'maker',config:{mode:'generate'}},{id:'two',type:'custom',roleId:'maker',config:{mode:'generate'}},{id:'files',type:'resources',config:{basePath:'docs'}},{id:'manual',type:'custom',config:{mode:'file',path:'docs/page.html'}}]}]})

const scope={appId:'app.test',instanceId:'first',pageId:'home'}
const save={action:'save',...scope,recipeVersion:1,roleId:'maker',requirement:'Enlarge title',annotation:{id:'mark-one',moduleId:'one',moduleTitle:'Timer',box:{x:20,y:60,width:100,height:80},canvas:{width:800,height:600,scrollX:0,scrollY:0},text:'Visible title',limited:true}}
test('annotation records persist independently of native drafts, isolate scope, and archive reversibly',async()=>{
 const root=await mkdtemp(join(tmpdir(),'annotation-host-')),r=recipe();let f
 try{f=await fixture(root,r);assert.equal((await f.call({...scope,action:'list'})).value.records.length,0)
  const first=await f.call(save);assert.equal(first.status,200);assert.equal(first.value.records[0].requirement,'Enlarge title')
  assert.equal((await f.call(save)).value.records.length,1,'Retrying save must be idempotent')
  assert.equal((await f.call({...scope,instanceId:'second',action:'list'})).value.records.length,0)
  assert.equal((await f.call({...scope,pageId:'other',action:'list'})).value.records.length,0)
  await f.close();f=await fixture(root,r);assert.equal((await f.call({...scope,action:'list'})).value.records[0].annotation.limited,true)
  assert.equal((await f.call({...scope,action:'archive',id:'mark-one',archived:true})).value.records[0].archived,true)
  assert.equal((await f.call({...scope,action:'archive',id:'mark-one',archived:false})).value.records[0].archived,false)
  r.version=2;assert.equal((await f.call({...scope,action:'list'})).value.records[0].recipeVersion,1)
  assert.equal((await f.call(save)).status,409)
 }finally{await f?.close();await rm(root,{recursive:true,force:true})}
})
test('annotation records reject stale modules, roles, invalid coordinates and unauthorized calls',async()=>{
 const root=await mkdtemp(join(tmpdir(),'annotation-boundary-')),r=recipe();let f
 try{f=await fixture(root,r)
  for(const request of [{...save,appId:'foreign'},{...save,roleId:'missing'},{...save,annotation:{...save.annotation,moduleId:'missing'}},{...save,annotation:{...save.annotation,box:{...save.annotation.box,x:1000}}}])assert.equal((await f.call(request)).status,409)
  assert.equal((await f.call({...save,requirement:' '})).status,400)
  assert.equal((await f.call({...save,annotation:{...save.annotation,box:{...save.annotation.box,width:-1}}})).status,400)
  f.deny(401);assert.equal((await f.call(save)).status,401);f.deny(undefined)
  assert.equal((await f.call(save,'GET')).status,405);f.disable();assert.equal((await f.call(save)).status,409)
 }finally{await f?.close();await rm(root,{recursive:true,force:true})}
})

test('annotations accept the same long module titles as valid application recipes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'annotation-title-')),r=recipe();let f
 try{r.pages[0].modules[0].title='t'.repeat(500);f=await fixture(root,r)
  const result=await f.call({...save,annotation:{...save.annotation,moduleTitle:r.pages[0].modules[0].title}})
  assert.equal(result.status,200);assert.equal(result.value.records[0].annotation.moduleTitle.length,500)
 }finally{await f?.close();await rm(root,{recursive:true,force:true})}
})

test('editing a saved annotation preserves target, geometry and archive state across reopen',async()=>{
 const root=await mkdtemp(join(tmpdir(),'annotation-edit-')),r=recipe();let f
 try { f=await fixture(root,r); const original=(await f.call(save)).value.records[0];
  await f.call({...scope,action:'archive',id:'mark-one',archived:true});
  const updated=await f.call({...scope,action:'update',id:'mark-one',recipeVersion:1,requirement:'Make this saved title clearer',roleId:'maker'});
  assert.equal(updated.status,200); const record=updated.value.records[0];
  assert.equal(record.requirement,'Make this saved title clearer');assert.deepEqual(record.annotation,original.annotation);assert.equal(record.createdAt,original.createdAt);assert.equal(record.archived,true);
  await f.close();f=await fixture(root,r);assert.equal((await f.call({...scope,action:'list'})).value.records[0].requirement,'Make this saved title clearer');
  assert.equal((await f.call({...scope,action:'update',id:'missing',recipeVersion:1,requirement:'Missing',roleId:'maker'})).status,409);
  r.version=2;assert.equal((await f.call({...scope,action:'update',id:'mark-one',recipeVersion:2,requirement:'Must not migrate',roleId:'maker'})).status,409);
  assert.equal((await f.call({...scope,action:'list'})).value.records[0].recipeVersion,1);
  r.version=1;r.pages[0].modules=r.pages[0].modules.filter(row=>row.id!=='one');assert.equal((await f.call({...scope,action:'update',id:'mark-one',recipeVersion:1,requirement:'Must not relocate',roleId:'maker'})).status,409);
  const retained=(await f.call({...scope,action:'list'})).value.records[0];assert.equal(retained.requirement,'Make this saved title clearer');assert.deepEqual(retained.annotation,original.annotation);

 } finally { await f?.close();await rm(root,{recursive:true,force:true}) }
})

 test('optional screenshot survives annotation reopen and edits without native upload',async()=>{
 const root=await mkdtemp(join(tmpdir(),'annotation-image-host-'));let f;const screenshot={name:'region.png',type:'image/png',data:'iVBORw0KGgo='};
 try{f=await fixture(root,recipe());const saved=await f.call({...save,screenshot});assert.equal(saved.status,200);assert.deepEqual(saved.value.records[0].screenshot,screenshot);await f.close();f=await fixture(root,recipe());assert.deepEqual((await f.call({...scope,action:'list'})).value.records[0].screenshot,screenshot);const updated=await f.call({...scope,action:'update',id:'mark-one',recipeVersion:1,requirement:'New request',roleId:'maker'});assert.deepEqual(updated.value.records[0].screenshot,screenshot);assert.equal((await f.call({...save,screenshot:{...screenshot,type:'image/svg+xml'}})).status,400);assert.equal((await f.call({...save,screenshot:{...screenshot,data:'not base64!'}})).status,400)}finally{await f?.close();await rm(root,{recursive:true,force:true})}
 })

 test('page screenshot budget refuses growth without losing notes and credits replacements',async()=>{
 const root=await mkdtemp(join(tmpdir(),'annotation-capacity-'));let f;const image=bytes=>({name:'region.png',type:'image/png',data:Buffer.alloc(bytes).toString('base64')}),mark=id=>({...save,annotation:{...save.annotation,id}});
 try{f=await fixture(root,recipe());const first=await f.call({...mark('first'),screenshot:image(8*1024*1024)});assert.equal(first.status,200,first.value.error);assert.equal((await f.call({...mark('second'),screenshot:image(8*1024*1024)})).status,200);
 const overflow=await f.call({...mark('third'),screenshot:image(1024*1024)});assert.equal(overflow.status,409);assert.match(overflow.value.error,/16 MiB.*smaller screenshot/i);assert.equal((await f.call({...scope,action:'list'})).value.records.length,2);
 assert.equal((await f.call({...mark('first'),screenshot:image(8*1024*1024)})).status,200,'Replacing the same image must not double count it');assert.equal((await f.call(mark('text-only'))).status,200,'Text-only notes remain available at the image budget');
 assert.equal((await f.call({...mark('first'),screenshot:image(7*1024*1024)})).status,200);assert.equal((await f.call({...mark('third'),screenshot:image(1024*1024)})).status,200,'Replacing with a smaller image releases capacity');
 await f.close();f=await fixture(root,recipe());const reopened=(await f.call({...scope,action:'list'})).value.records;assert.equal(reopened.length,4);assert.equal(Buffer.byteLength(reopened.find(r=>r.annotation.id==='first').screenshot.data,'base64'),7*1024*1024);
 }finally{await f?.close();await rm(root,{recursive:true,force:true})}
 })
