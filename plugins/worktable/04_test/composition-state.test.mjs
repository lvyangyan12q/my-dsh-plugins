import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {CompositionDirectory} from '../01_content/src/framework/compositions.mjs'
test('two views share only their instance presentation state with revision conflicts and cold recovery',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-composition-state-')),file=join(dir,'apps.json');let apps=new ApplicationDirectory(file),service=new CompositionDirectory(apps)
 try{
 await service.save({appId:'dashboard',expectedRevision:0,recipe:{title:'看板',version:'1.0.0',layout:'grid',pages:[{id:'home',title:'主页',modules:[{id:'records',type:'list',config:{}}]}]}});await service.activate({appId:'dashboard',expectedRevision:1})
 const a=await apps.createInstance('dashboard','project-a'),b=await apps.createInstance('dashboard','project-b'),a1=await apps.createView(a.id),a2=await apps.createView(a.id),b1=await apps.createView(b.id)
 assert.deepEqual(await service.readState(a1.id),{instanceId:a.id,revision:0,scopes:{}})
 await service.updateState({viewId:a1.id,expectedRevision:0,scopeId:'records',filters:{query:'论文'},selectedId:'record-1'})
 assert.deepEqual((await service.readState(a2.id)).scopes.records,{filters:{query:'论文'},selectedId:'record-1'})
 assert.deepEqual((await service.readState(b1.id)).scopes,{})
 await assert.rejects(()=>service.updateState({viewId:a2.id,expectedRevision:0,scopeId:'records',filters:{},selectedId:null}),{code:'revision-conflict'})
 await apps.close();apps=new ApplicationDirectory(file);service=new CompositionDirectory(apps)
 assert.equal((await service.readState(a1.id)).scopes.records.selectedId,'record-1')
 await assert.rejects(()=>service.updateState({viewId:a1.id,expectedRevision:1,scopeId:'not-declared',filters:{},selectedId:null}),{code:'scope-missing'})
 }finally{await apps.close();await rm(dir,{recursive:true,force:true})}
})
