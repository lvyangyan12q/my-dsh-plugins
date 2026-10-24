import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {CompositionDirectory} from '../01_content/src/framework/compositions.mjs'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
const operationId='22222222-2222-4222-8222-222222222222',id='11111111-1111-4111-8111-111111111111',viewId='33333333-3333-4333-8333-333333333333'
test('Host provision intent resumes after reopen without duplicating targets or claiming an unrelated instance',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-provision-'));let apps
 try{
  const open=async()=>{const owner=new ApplicationDirectory(join(dir,'apps.json'));for(const id of ['study','library'])await owner.contribute({id,title:id,version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'},{id:'materials',title:'Materials'}]});return owner}
  apps=await open();const target={id,appId:'study',projectId:null,operationId};await apps.ensureInstance(target);const view=await apps.ensureView({id:viewId,instanceId:id,type:'page',operationId});const instance=(await apps.snapshot()).instances[0];await apps.close();apps=await open();assert.deepEqual(await apps.ensureInstance(target),instance);assert.deepEqual(await apps.ensureView({id:viewId,instanceId:id,type:'page',operationId}),view);assert.equal((await apps.snapshot()).instances.length,1);assert.equal((await apps.snapshot()).views.length,1)
  await assert.rejects(apps.ensureInstance({...target,appId:'library'}),{code:'provision-conflict'});await assert.rejects(apps.ensureView({id:viewId,instanceId:id,type:'materials',operationId}),{code:'provision-conflict'});await assert.rejects(apps.ensureInstance({...target,operationId:'44444444-4444-4444-8444-444444444444'}),{code:'provision-conflict'});const unrelated=await apps.createInstance('study',null);await assert.rejects(apps.ensureInstance({...target,id:unrelated.id}),{code:'provision-conflict'})
 }finally{await apps?.close();await rm(dir,{recursive:true,force:true})}
})


test('composition and lifecycle writes retain schema5 receipts; older readers and unknown future schemas fail closed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-provision-schema-')),file=join(dir,'apps.json');let apps=new ApplicationDirectory(file)
 try{
  await apps.contribute({id:'study',title:'Study',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});await apps.ensureInstance({id,appId:'study',projectId:null,operationId});await apps.setEnabled('study',false,0)
  const compositions=new CompositionDirectory(apps);await compositions.save({appId:'new-app',expectedRevision:0,recipe:{title:'New app',version:'1.0.0',layout:'vertical',pages:[{id:'home',title:'Home',modules:[]}]}})
  await apps.close();const data=JSON.parse(await readFile(file,'utf8'));assert.equal(data.schema,5);assert.deepEqual(data.provisions,[{kind:'instance',id,operationId},{kind:'instance-admission',id,operationId,state:'pending'}]);
  const {ProfileFileStore}=await import('../01_content/src/framework/persistence.mjs');const {applicationState}=await import('../01_content/src/framework/state-schema.mjs');const old=new ProfileFileStore(file,()=>({}),applicationState,[1,2,3,4]);try{await assert.rejects(old.read())}finally{await old.close()}
  await writeFile(file,JSON.stringify({...data,schema:6}));apps=new ApplicationDirectory(file);await assert.rejects(apps.snapshot());await assert.rejects(apps.ensureInstance({id,appId:'study',projectId:null,operationId}));assert.equal(JSON.parse(await readFile(file,'utf8')).schema,6)
 }finally{await apps.close();await rm(dir,{recursive:true,force:true})}
})
