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
