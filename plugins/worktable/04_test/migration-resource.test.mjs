import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {MigrationDirectory} from '../01_content/src/framework/migrations.mjs'
import {ResourceDirectory} from '../01_content/src/framework/resources.mjs'
test('managed resource consumers and source owners reject blocked reads and writes, explicit recovery restores access',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-migration-resources-'));let apps,migrations,resources;
 try{
  apps=new ApplicationDirectory(join(dir,'apps.json'));for(const id of ['source','consumer'])await apps.contribute({id,title:id,version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});
  const source=await apps.createInstance('source',null),consumer=await apps.createInstance('consumer',null),sv=await apps.createView(source.id),cv=await apps.createView(consumer.id);
  migrations=new MigrationDirectory(join(dir,'migrations.json'),apps,{gate:apps.gate});apps.setReadinessGuard(id=>migrations.assertReady(id));resources=new ResourceDirectory(join(dir,'resources.json'),apps,apps.gate);
  const business={source:{dataVersion:'1',revision:'r1'},consumer:{dataVersion:'1',revision:'r1'}};let mutations=0;
  for(const id of ['source','consumer']){migrations.contribute(id,{applicationVersions:['1'],inspect:async()=>business[id],plan:async input=>({...input,toDataVersion:'2',impact:'Synthetic partial conversion',irreversible:false,recovery:'Owner verifies unchanged checkpoint'}),execute:async()=>{throw Error('controlled owner failure')},recover:async()=>({applicationVersion:'1'})});await migrations.adopt({viewId:id==='source'?sv.id:cv.id,applicationVersion:'1',dataVersion:'1',dataRevision:'r1',confirmed:true})}
  resources.register({appId:'source',resourceId:'rows',actions:['append'],read:async()=>({revision:'r1',rows:['synthetic']}),mutate:async(_id,_action,_payload,_rev,authorize)=>{await authorize();mutations++;return {revision:'r2'}}});
  const grant=await resources.share({ownerViewId:sv.id,consumerInstanceId:consumer.id,resourceId:'rows'}),allowed=await resources.permissions(grant.id,grant.revision,['read','append']);
  const read={viewId:cv.id,resourceId:'rows',action:'read'},write={...read,action:'append',expectedConnectionRevision:allowed.revision,expectedRevision:'r1'};
  assert.equal((await resources.call(read)).value.rows[0],'synthetic');
  for(const viewId of [sv.id,cv.id]){const plan=await migrations.prepare({viewId});await assert.rejects(migrations.confirm({id:plan.id,revision:plan.revision,confirmed:true}),{code:'migration-recovery-required'});await assert.rejects(resources.call(read),{code:'migration-recovery-required'});await assert.rejects(resources.call(write),{code:'migration-recovery-required'});assert.equal(mutations,0);const failed=(await migrations.get(viewId)).plans.at(-1);await migrations.recover({id:failed.id,revision:failed.revision,dataRevision:'r1',confirmed:true});assert.equal((await resources.call(read)).value.rows[0],'synthetic')}
  await resources.call(write);assert.equal(mutations,1);
 }finally{await resources?.close();await migrations?.close();await apps?.close();await rm(dir,{recursive:true,force:true})}
})

test('a resource owner holding its lease can reauthorize against durable migration intent without a gate deadlock',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-migration-lock-'));let apps,migrations,resources;
 try{
  apps=new ApplicationDirectory(join(dir,'apps.json'));await apps.contribute({id:'sample',title:'Sample',version:'1',kind:'deep',protocolVersion:1,views:[{id:'page',title:'Page'}]});const instance=await apps.createInstance('sample',null),view=await apps.createView(instance.id);
  migrations=new MigrationDirectory(join(dir,'migration.json'),apps,{gate:apps.gate});apps.setReadinessGuard(id=>migrations.assertReady(id));resources=new ResourceDirectory(join(dir,'resources.json'),apps,apps.gate);
  let releaseLease,leaseStarted,executeStarted;const lease=new Promise(resolve=>releaseLease=resolve),started=new Promise(resolve=>leaseStarted=resolve),executing=new Promise(resolve=>executeStarted=resolve);let revision='r1',version='1',mutations=0;
  migrations.contribute('sample',{applicationVersions:['1'],inspect:async()=>({dataVersion:version,revision}),plan:async input=>({...input,toDataVersion:'2',impact:'Synthetic conversion',irreversible:false,recovery:'Check source'}),execute:async()=>{executeStarted();await lease;version='2';revision='r2'}});
  await migrations.adopt({viewId:view.id,applicationVersion:'1',dataVersion:'1',dataRevision:'r1',confirmed:true});const plan=await migrations.prepare({viewId:view.id});
  resources.register({appId:'sample',resourceId:'rows',actions:['append'],read:async()=>({revision,rows:[]}),mutate:async(_id,_action,_payload,_revision,authorize)=>{leaseStarted();try{await executing;await authorize();mutations++}finally{releaseLease()}return {revision}}});
  const write=resources.call({viewId:view.id,resourceId:'rows',action:'append',expectedRevision:'r1'});await started;const confirm=migrations.confirm({id:plan.id,revision:plan.revision,confirmed:true});
  let timeout;try{await Promise.race([Promise.all([assert.rejects(write,{code:'migration-recovery-required'}),confirm]),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('owner lease/readiness deadlock')),2000)})])}finally{clearTimeout(timeout);releaseLease()}
  assert.equal(mutations,0);assert.equal((await migrations.get(view.id)).status,'ready');assert.equal((await resources.call({viewId:view.id,resourceId:'rows',action:'read'})).value.revision,'r2');
 }finally{await resources?.close();await migrations?.close();await apps?.close();await rm(dir,{recursive:true,force:true})}
})
