import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {CompositionDirectory} from '../01_content/src/framework/compositions.mjs'
const recipe={title:'阅读看板',version:'1.0.0',layout:'grid',pages:[{id:'home',title:'首页',modules:[{id:'stats',type:'statistics',config:{}}]}]}
test('save and preview never activate; explicit activation preserves instance identity through revision and restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-compose-'));let apps=new ApplicationDirectory(join(dir,'apps.json'))
 try{let service=new CompositionDirectory(apps)
 const saved=await service.save({appId:'my-dashboard',expectedRevision:0,recipe});assert.equal(saved.revision,1)
 assert.equal((await apps.catalog()).length,0)
 const preview=await service.preview({appId:'my-dashboard',expectedRevision:1});assert.equal(preview.recipe.title,'阅读看板');assert.equal((await apps.snapshot()).instances.length,0)
 await service.activate({appId:'my-dashboard',expectedRevision:1})
 const instance=await apps.createInstance('my-dashboard','project-a'),view=await apps.createView(instance.id)
 await service.save({appId:'my-dashboard',expectedRevision:2,recipe:{...recipe,title:'新版',version:'1.1.0'}})
 assert.equal((await apps.catalog())[0].title,'阅读看板')
 await service.activate({appId:'my-dashboard',expectedRevision:3})
 assert.equal((await apps.resolveView(view.id)).instance.id,instance.id)
 await apps.close();apps=new ApplicationDirectory(join(dir,'apps.json'));service=new CompositionDirectory(apps)
 assert.equal((await service.get('my-dashboard')).running.title,'新版');assert.equal((await apps.catalog())[0].version,'1.1.0')
 assert.equal((await apps.resolveView(view.id)).instance.projectId,'project-a')
 }finally{await apps.close();await rm(dir,{recursive:true,force:true})}
})
test('activation refuses stale edits, unchanged versions and removed targets without publishing a draft',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-compose-'));const apps=new ApplicationDirectory(join(dir,'apps.json')),service=new CompositionDirectory(apps)
 try{
 await service.save({appId:'dashboard',expectedRevision:0,recipe});await service.activate({appId:'dashboard',expectedRevision:1})
 await assert.rejects(()=>service.save({appId:'dashboard',expectedRevision:1,recipe}),{code:'revision-conflict'})
 await service.save({appId:'dashboard',expectedRevision:2,recipe:{...recipe,title:'未发布'}})
 await assert.rejects(()=>service.activate({appId:'dashboard',expectedRevision:3}),{code:'version-required'})
 assert.equal((await apps.catalog())[0].title,'阅读看板')
 await service.save({appId:'dashboard',expectedRevision:3,recipe:{...recipe,version:'2.0.0',pages:[{id:'changed',title:'替换首页',modules:[]}]}})
 await assert.rejects(()=>service.activate({appId:'dashboard',expectedRevision:4}),{code:'page-identity-changed'})
 }finally{await apps.close();await rm(dir,{recursive:true,force:true})}
})
test('other owners cannot claim a saved composition identity and dependency failure preserves running definition',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-compose-'));const apps=new ApplicationDirectory(join(dir,'apps.json'))
 try{
 const service=new CompositionDirectory(apps)
 await service.save({appId:'dashboard',expectedRevision:0,recipe})
 await assert.rejects(()=>apps.contribute({id:'dashboard',title:'冒领',kind:'deep',protocolVersion:1,version:'1',views:[{id:'page',title:'Page'}]}),{code:'application-conflict'})
 await service.activate({appId:'dashboard',expectedRevision:1})
 await service.save({appId:'dashboard',expectedRevision:2,recipe:{...recipe,version:'2.0.0',connections:[{id:'data',viewId:'missing-view',resourceId:'notes'}]}})
 await assert.rejects(()=>service.preview({appId:'dashboard',expectedRevision:3}),{code:'dependency-unavailable'})
 await assert.rejects(()=>service.activate({appId:'dashboard',expectedRevision:3}),{code:'dependency-unavailable'})
 assert.equal((await apps.catalog())[0].version,'1.0.0');assert.equal((await service.get('dashboard')).revision,3)
 }finally{await apps.close();await rm(dir,{recursive:true,force:true})}
})
test('actual profile path failure leaves the running recipe and catalog unchanged after recovery',async()=>{
 const {rename,mkdir}=await import('node:fs/promises');const dir=await mkdtemp(join(tmpdir(),'wt-compose-failure-')),file=join(dir,'apps.json');const apps=new ApplicationDirectory(file),service=new CompositionDirectory(apps)
 try{
 await service.save({appId:'dashboard',expectedRevision:0,recipe});await service.activate({appId:'dashboard',expectedRevision:1})
 await service.save({appId:'dashboard',expectedRevision:2,recipe:{...recipe,title:'新版',version:'2.0.0'}})
 await rename(file,file+'.held');await mkdir(file)
 await assert.rejects(()=>service.activate({appId:'dashboard',expectedRevision:3}))
 await rm(file,{recursive:true});await rename(file+'.held',file)
 assert.equal((await apps.catalog())[0].title,'阅读看板');assert.equal((await service.get('dashboard')).revision,3)
 }finally{await apps.close();await rm(dir,{recursive:true,force:true})}
})
test('running roles use native authority without creating sessions on preview or replacing existing binding on activation',async()=>{
 const {RoleDirectory,RoleStore}=await import('../01_content/src/framework/roles.mjs')
 const dir=await mkdtemp(join(tmpdir(),'wt-compose-roles-')),apps=new ApplicationDirectory(join(dir,'apps.json'));let roles;let count=0
 try{
 const authority={validate:async()=>({presetId:'managed.writer'}),validateExisting:async()=>{},create:async row=>{count++;return row.sessionId}}
 roles=new RoleDirectory(await RoleStore.open(join(dir,'roles.json')),apps,authority)
 const role={id:'writer',title:'写作助手',agent:{kind:'agent',source:'managed',id:'writer'},creation:{cwd:dir}}
 const service=new CompositionDirectory(apps,{validateDependencies:async()=>{}})
 await service.save({appId:'dashboard',expectedRevision:0,recipe:{...recipe,roles:[role]}})
 await service.preview({appId:'dashboard',expectedRevision:1});assert.equal(count,0)
 await service.activate({appId:'dashboard',expectedRevision:1});const instance=await apps.createInstance('dashboard',null)
 assert.equal((await roles.list(instance.id))[0].binding,null);assert.equal(count,0)
 const binding=await roles.ensure(instance.id,'writer')
 await service.save({appId:'dashboard',expectedRevision:2,recipe:{...recipe,version:'1.1.0',roles:[{...role,title:'编辑助手'}]}})
 await service.activate({appId:'dashboard',expectedRevision:3})
 assert.equal((await roles.read(instance.id,'writer')).binding.sessionId,binding.sessionId);assert.equal(count,1)
 }finally{await roles?.dispose();await apps.close();await rm(dir,{recursive:true,force:true})}
})
