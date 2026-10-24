import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readFile} from 'node:fs/promises'
import {applicationState} from '../01_content/src/framework/state-schema.mjs'
import {randomUUID} from 'node:crypto'
import {ResourceDirectory} from '../01_content/src/framework/resources.mjs'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {RoleDirectory,RoleStore} from '../01_content/src/framework/roles.mjs'

test('persisted provisioning excludes public roles and views until explicit trusted completion',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-admission-')),file=join(dir,'apps.json'),instanceId=randomUUID(),operationId=randomUUID(),viewId=randomUUID();let apps=new ApplicationDirectory(file),roles,resources,creates=0,removeApplication
 const contribute=()=>apps.contribute({id:'study',title:'Study',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]})
 try{
  await contribute();await apps.ensureInstance({id:instanceId,appId:'study',projectId:null,operationId});await apps.ensureView({id:viewId,instanceId,type:'page',operationId})
  roles=new RoleDirectory(await RoleStore.open(join(dir,'roles.json')),apps,{validate:async()=>({presetId:'teacher'}),create:async row=>{creates++;return row.sessionId},validateExisting:async()=>{},validateLegacy:async row=>({sessionId:row.sessionId})})
  roles.contribute('study',[{id:'teacher',title:'Teacher',agent:{kind:'agent',source:'managed',id:'teacher'},creation:{cwd:dir}}])
  await assert.rejects(()=>roles.ensure(instanceId,'teacher'),{code:'instance-not-ready'});assert.equal(creates,0)
  await assert.rejects(()=>apps.resolveView(viewId),{code:'instance-not-ready'})
  await apps.close();apps=new ApplicationDirectory(file);removeApplication=await contribute();roles.applications=apps
  await assert.rejects(()=>roles.ensure(instanceId,'teacher'),{code:'instance-not-ready'})
  resources=new ResourceDirectory(join(dir,'resources.json'),apps,apps.gate)
  resources.register({appId:'study',resourceId:'notes',actions:[],read:async()=>({revision:'1',rows:[]})})
  const ready=await apps.createInstance('study',null),readyView=await apps.createView(ready.id)
  assert.deepEqual((await resources.catalog()).map(row=>row.viewId),[readyView.id])
  await assert.rejects(()=>resources.call({viewId,resourceId:'notes',action:'read'}),{code:'instance-not-ready'})
  let pendingGrant
  await apps.withProvision(operationId,async()=>{pendingGrant=await resources.share({ownerViewId:readyView.id,consumerInstanceId:instanceId,resourceId:'notes'})})
  await assert.rejects(()=>resources.permissions(pendingGrant.id,pendingGrant.revision,['read']),{code:'instance-not-ready'})
  await assert.rejects(()=>resources.revoke(pendingGrant.id,pendingGrant.revision),{code:'instance-not-ready'})
  const source={sourceKey:'legacy-teacher',revision:'pinned-v1',roleId:'teacher',sessionId:'pinned-native',presetId:'teacher',creation:{cwd:dir},phase:'ready',previousSessions:[]}
  roles.contributeLegacy('study',{inspect:async()=>source})
  assert.equal((await roles.previewAdoption(instanceId,'teacher',source.sourceKey)).status,'blocked')
  let retained,releaseChild,child
  await apps.withProvision(operationId,async()=>{
   assert.equal((await apps.resolveView(viewId)).instance.id,instanceId)
   await assert.rejects(()=>roles.ensure(instanceId,'teacher'),{code:'instance-not-ready'})
   const preview=await roles.previewAdoption(instanceId,'teacher',source.sourceKey);assert.equal(preview.status,'ready')
   await roles.applyAdoption(instanceId,'teacher',source.sourceKey,preview.fingerprint,true)
   retained=()=>apps.resolveView(viewId)
   child=new Promise(resolve=>{releaseChild=resolve}).then(()=>apps.resolveView(viewId))
  })
  await assert.rejects(retained,{code:'instance-not-ready'});releaseChild();await assert.rejects(child,{code:'instance-not-ready'})
  const state=JSON.parse(await readFile(file,'utf8'));applicationState(state)
  assert.equal(state.provisions.find(row=>row.kind==='instance-admission').state,'pending')

  await assert.rejects(()=>apps.resolveView(viewId),{code:'instance-not-ready'})
  await apps.withProvision(operationId,async()=>{await removeApplication();await contribute();await assert.rejects(()=>apps.resolveView(viewId),{code:'instance-not-ready'});await assert.rejects(()=>apps.completeProvision(instanceId,operationId),{code:'provision-authority-expired'})})
  await assert.rejects(()=>apps.completeProvision(instanceId,operationId),{code:'provision-authority-expired'})
  await apps.withProvision(operationId,()=>apps.completeProvision(instanceId,operationId));assert.equal((await apps.resolveView(viewId)).instance.id,instanceId)
  assert.equal((await roles.ensure(instanceId,'teacher')).sessionId,'pinned-native');assert.equal(creates,0)
 }finally{await resources?.close();await roles?.dispose();await apps.close();await rm(dir,{recursive:true,force:true})}
})
