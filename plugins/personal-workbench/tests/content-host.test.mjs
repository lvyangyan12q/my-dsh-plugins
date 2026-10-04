import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm,writeFile,readFile,mkdir,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {Readable} from 'node:stream'
import {installContent} from '../src/content-host.ts'
import {contentErrors,webAddress,relativeContentPath} from '../src/content-catalog.ts'
import {contentPath} from '../src/content-files.ts'
const source=process.env.DSH_SOURCE;assert.ok(source)
const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json')),{Context}=require('@deepseek-ai/cordis')
const built=p=>import(pathToFileURL(resolve(source,p,'lib/index.js')).href)
const {default:Storage}=await built('packages/storage/storage'),{JsonStorageBackend}=await built('packages/storage/storage-json'),{DomainFacility}=await built('packages/storage/storage-domain')
async function fixture(root,recipe){
 const host=new Context();await host.plugin(Storage);host.storage.backend.register('json',new JsonStorageBackend(join(root,'storage')));const facility=new DomainFacility(host,{backend:'json',routes:{}});host.storage.mount('domain',facility)
 let rejection,enabled=true
 const owner=await installContent({storageDomain:facility,connection:{requestRejection:()=>rejection},personalWorkbenchApps:{read:()=>({enabled})},personalWorkbenchRecipes:{list:()=>[{appId:recipe.appId,running:recipe}]},personalWorkbenchRecipeRoles:{workspace:async()=>root}})
 return {deny:value=>{rejection=value},disable:()=>{enabled=false},call:async(data,method='POST')=>{const req=Readable.from([JSON.stringify(data)]);req.method=method;req.headers={'content-type':'application/json'};let status,value;await owner.handle(req,{setHeader:()=>{},writeHead:n=>{status=n},end:body=>{value=body?JSON.parse(body):undefined}});return {status,value}},close:async()=>{await owner.dispose();await host.fiber.dispose()}}
}
const recipe=()=>({appId:'app.test',version:1,pages:[{modules:[{id:'one',type:'custom',roleId:'maker',config:{mode:'generate'}},{id:'two',type:'custom',roleId:'maker',config:{mode:'generate'}},{id:'files',type:'resources',config:{basePath:'docs'}},{id:'manual',type:'custom',config:{mode:'file',path:'docs/page.html'}}]}]})
const request=(action,moduleId='one',instanceId='first',path)=>({action,appId:'app.test',instanceId,moduleId,...(path===undefined?{}:{path})})
test('custom artifacts restore across restart, isolate panes and instances, and ignore late previous jobs and old recipes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'content-host-')),r=recipe();let f
 try{
  f=await fixture(root,r);const a=await f.call(request('reserve')),b=await f.call(request('reserve','two')),c=await f.call(request('reserve','one','second'))
  assert.equal(a.status,200);assert.notEqual(a.value.path,b.value.path);assert.notEqual(a.value.path,c.value.path)
  await writeFile(a.value.path,'<h1>First</h1>');assert.equal((await f.call(request('artifact'))).value.content,'<h1>First</h1>');assert.equal((await f.call(request('artifact','two'))).value.ready,false)
  const newer=await f.call(request('reserve'));assert.equal(newer.value.previousPath,a.value.path);await writeFile(a.value.path,'<h1>Late result</h1>');assert.equal((await f.call(request('artifact'))).value.ready,false)
  await writeFile(newer.value.path,'<h1>New page</h1>');await f.close();f=await fixture(root,r);assert.equal((await f.call(request('artifact'))).value.content,'<h1>New page</h1>')
  r.version++;assert.equal((await f.call(request('artifact'))).value.content,'<h1>New page</h1>');r.pages[0].modules[0].config.requirement='Changed request';assert.equal((await f.call(request('artifact'))).value.ready,false)
  r.pages[0].modules.splice(0,1);assert.equal((await f.call(request('artifact'))).status,409)
 }finally{await f?.close();await rm(root,{recursive:true,force:true})}
})
test('workspace files are bounded, read-only and reject traversal, absolute paths, foreign modules, disabled apps and unauthenticated calls',async()=>{
 const root=await mkdtemp(join(tmpdir(),'content-files-')),r=recipe();let f
 try{
  await mkdir(join(root,'docs'));await writeFile(join(root,'docs/page.html'),'<h1>Existing</h1>');await writeFile(join(root,'outside.txt'),'secret');f=await fixture(root,r)
  assert.deepEqual((await f.call(request('list','files'))).value.entries.map(e=>e.name),['page.html'])
  assert.equal((await f.call(request('file','manual'))).value.kind,'html')
  for(const path of ['../outside.txt','/absolute','C:/Windows/test','..\\outside.txt'])assert.equal((await f.call(request('file','files','first',path))).status,409)
  assert.equal((await f.call(request('file','missing'))).status,409);await writeFile(join(root,'docs/large.txt'),'x'.repeat(2*1024*1024+1));assert.equal((await f.call(request('file','files','first','large.txt'))).status,409)
  f.deny(401);assert.equal((await f.call(request('list','files'))).status,401);f.deny(undefined);assert.equal((await f.call(request('list','files'),'GET')).status,405);f.disable();assert.equal((await f.call(request('list','files'))).status,409)
 }finally{await f?.close();await rm(root,{recursive:true,force:true})}
})
test('real path containment rejects directory junctions out of the workspace',async()=>{
 const root=await mkdtemp(join(tmpdir(),'content-junction-')),outside=await mkdtemp(join(tmpdir(),'content-outside-'))
 try{await symlink(outside,join(root,'escape'),process.platform==='win32'?'junction':'dir');await assert.rejects(contentPath(root,'escape'),/outside workspace/)}finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true})}
})
test('module admission validates web protocols, file scope and generation role without accepting executable recipe content',()=>{
 for(const value of ['javascript:alert(1)','file:///secret','https://user:password@example.com','//example.com'])assert.equal(webAddress(value),undefined)
 assert.equal(webAddress('https://example.com'),'https://example.com/');assert.equal(relativeContentPath('docs/page.html'),true)
 assert.ok(contentErrors({id:'x',type:'custom',config:{mode:'generate'}}).length)
 assert.ok(contentErrors({id:'x',type:'website',config:{url:'javascript:1'}}).length)
 assert.deepEqual(contentErrors({id:'x',type:'custom',roleId:'maker',config:{mode:'generate'}}),[])
})

test('renaming a generated module preserves legacy artifact and next adjustment path, while content changes invalidate it',async()=>{
 const root=await mkdtemp(join(tmpdir(),'content-rename-')),r=recipe();let f
 try{r.pages[0].modules[0].title='Original';f=await fixture(root,r);const reserved=await f.call(request('reserve'));await writeFile(reserved.value.path,'<h1>Keep page</h1>');await f.close();f=undefined
  const storage=join(root,'storage/personal_workbench_content.json'),data=JSON.parse(await readFile(storage,'utf8'))
  const replace=value=>{if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){if(key==='signature'&&typeof child==='string')value[key]=JSON.stringify(r.pages[0].modules[0]);else replace(child)}};replace(data);await writeFile(storage,JSON.stringify(data))
  r.pages[0].modules[0].title='Renamed';r.version++;f=await fixture(root,r);assert.equal((await f.call(request('artifact'))).value.content,'<h1>Keep page</h1>');const next=await f.call(request('reserve'));assert.equal(next.value.previousPath,reserved.value.path)
  await writeFile(next.value.path,'<h1>Adjusted</h1>');r.pages[0].modules[0].config.requirement='New target';assert.equal((await f.call(request('artifact'))).value.ready,false)
 }finally{await f?.close();await rm(root,{recursive:true,force:true})}
})
