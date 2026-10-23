import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {MigrationDirectory} from '../01_content/src/framework/migrations.mjs'

test('legacy adoption is explicit metadata only and managed definition drift blocks actual instance admission',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-migration-'));let apps,migrations;
 try{
  apps=new ApplicationDirectory(join(dir,'apps.json'));let remove=await apps.contribute({id:'sample',title:'Sample',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});
  const instance=await apps.createInstance('sample',null),view=await apps.createView(instance.id);
  migrations=new MigrationDirectory(join(dir,'migrations.json'),apps);apps.setReadinessGuard(id=>migrations.assertReady(id));
  migrations.contribute('sample',{applicationVersions:['1','2'],inspect:async()=>({dataVersion:'1',revision:'business-1'}),plan:async()=>{throw Error('unsupported')},execute:async()=>assert.fail('adoption never executes business')});
  const before=await readFile(join(dir,'apps.json'),'utf8');
  assert.equal((await migrations.get(view.id)).status,'legacy-unverified');
  await assert.rejects(migrations.adopt({viewId:view.id,applicationVersion:'1',dataVersion:'1',dataRevision:'business-1',confirmed:false}),{code:'confirmation-required'});
  await migrations.adopt({viewId:view.id,applicationVersion:'1',dataVersion:'1',dataRevision:'business-1',confirmed:true});
  assert.equal(await readFile(join(dir,'apps.json'),'utf8'),before);
  assert.equal((await migrations.get(view.id)).status,'ready');
  remove();await apps.contribute({id:'sample',title:'Sample',version:'2',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});
  const drift=await readFile(join(dir,'apps.json'),'utf8');await assert.rejects(apps.createInstance('sample',null),{code:'migration-required'});assert.equal(await readFile(join(dir,'apps.json'),'utf8'),drift);
 }finally{await migrations?.close();await apps?.close();await rm(dir,{recursive:true,force:true})}
})

import {writeFile} from 'node:fs/promises'
test('owner plan freezes impact and revision, irreversible execution requires an explicit separate confirmation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-plan-'));let apps,migrations;
 try{
  const file=join(dir,'business.json'),original=JSON.stringify({dataVersion:'1',revision:'r1',rows:['synthetic']});await writeFile(file,original);
  apps=new ApplicationDirectory(join(dir,'apps.json'));let remove=await apps.contribute({id:'sample',title:'Sample',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});const instance=await apps.createInstance('sample',null),view=await apps.createView(instance.id);
  migrations=new MigrationDirectory(join(dir,'migration.json'),apps,{gate:apps.gate});apps.setReadinessGuard(id=>migrations.assertReady(id));
  const inspect=async()=>{const data=JSON.parse(await readFile(file));return {dataVersion:data.dataVersion,revision:data.revision}};
  migrations.contribute('sample',{applicationVersions:['1','2'],inspect,plan:async context=>({...context,toDataVersion:'2',impact:'Convert one synthetic record; original text preserved.',irreversible:true,recovery:'Owner can inspect its saved checkpoint; no automatic rollback is promised.'}),execute:async plan=>{const data=JSON.parse(await readFile(file));assert.equal(data.revision,plan.dataRevision);await writeFile(file,JSON.stringify({...data,dataVersion:'2',revision:'r2'}))}});
  await migrations.adopt({viewId:view.id,applicationVersion:'1',dataVersion:'1',dataRevision:'r1',confirmed:true});remove();await apps.contribute({id:'sample',title:'Sample',version:'2',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});
  const plan=await migrations.prepare({viewId:view.id});assert.equal(plan.irreversible,true);assert.equal(plan.fromApplicationVersion,'1');assert.equal(plan.toApplicationVersion,'2');assert.equal(await readFile(file,'utf8'),original);
  await assert.rejects(migrations.confirm({id:plan.id,revision:plan.revision,confirmed:true}),{code:'irreversible-confirmation-required'});assert.equal(await readFile(file,'utf8'),original);
  await migrations.confirm({id:plan.id,revision:plan.revision,confirmed:true,irreversibleConfirmed:true});assert.equal((await inspect()).dataVersion,'2');assert.equal((await migrations.get(view.id)).status,'ready');assert.equal((await apps.resolveView(view.id)).instance.id,instance.id);
 }finally{await migrations?.close();await apps?.close();await rm(dir,{recursive:true,force:true})}
})

test('partial owner failure remains blocked after reopen, and only explicit verified owner recovery restores admission',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-failed-plan-'));let apps,migrations;
 try{
  const file=join(dir,'business.json');await writeFile(file,JSON.stringify({dataVersion:'1',revision:'r1',rows:['synthetic']}));
  apps=new ApplicationDirectory(join(dir,'apps.json'));await apps.contribute({id:'sample',title:'Sample',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});const instance=await apps.createInstance('sample',null),view=await apps.createView(instance.id);
  const owner={applicationVersions:['1'],inspect:async()=>{const row=JSON.parse(await readFile(file));return {dataVersion:row.dataVersion,revision:row.revision}},plan:async context=>({...context,toDataVersion:'2',impact:'Synthetic partial conversion',irreversible:true,recovery:'Explicitly restore this synthetic owner checkpoint if revision still matches.'}),execute:async()=>{await writeFile(file,JSON.stringify({dataVersion:'2',revision:'r2',rows:['synthetic partially changed']}));throw Error('controlled owner failure')},recover:async plan=>{assert.equal(plan.recoveryDataRevision,'r2');await writeFile(file,JSON.stringify({dataVersion:'1',revision:'r3',rows:['synthetic']}));return {applicationVersion:'1'}}};
  const start=()=>{migrations=new MigrationDirectory(join(dir,'migration.json'),apps,{gate:apps.gate});apps.setReadinessGuard(id=>migrations.assertReady(id));migrations.contribute('sample',owner)};start();
  await migrations.adopt({viewId:view.id,applicationVersion:'1',dataVersion:'1',dataRevision:'r1',confirmed:true});const plan=await migrations.prepare({viewId:view.id});await assert.rejects(migrations.confirm({id:plan.id,revision:plan.revision,confirmed:true,irreversibleConfirmed:true}),{code:'migration-recovery-required'});
  await assert.rejects(apps.createInstance('sample',null),{code:'migration-recovery-required'});await migrations.close();start();
  const failed=(await migrations.get(view.id)).plans[0];assert.equal(failed.status,'failed');assert.equal((await owner.inspect()).dataVersion,'2');await assert.rejects(apps.createInstance('sample',null),{code:'migration-recovery-required'});
  await assert.rejects(migrations.recover({id:failed.id,revision:failed.revision,dataRevision:'r2',confirmed:false}),{code:'confirmation-required'});
  await migrations.recover({id:failed.id,revision:failed.revision,dataRevision:'r2',confirmed:true,irreversibleConfirmed:true});assert.equal((await migrations.get(view.id)).status,'ready');assert.equal((await owner.inspect()).dataVersion,'1');assert.equal((await apps.createInstance('sample',null)).appId,'sample');
 }finally{await migrations?.close();await apps?.close();await rm(dir,{recursive:true,force:true})}
})

import {fork} from 'node:child_process'
import {once} from 'node:events'
import {fileURLToPath} from 'node:url'
test('a real interrupted migration intent survives process death as unknown, blocks new admission and never replays business execution',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-crash-migration-'));let child,apps,migrations;
 try{
  const file=join(dir,'business.json'),original=JSON.stringify({dataVersion:'1',revision:'r1'});await writeFile(file,original);
  child=fork(fileURLToPath(new URL('./migration-intent-worker.mjs',import.meta.url)),[dir],{stdio:['ignore','ignore','pipe','ipc']});
  const message=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('migration child did not reach owner execution')),10000);child.once('message',value=>{clearTimeout(timer);resolve(value)});child.once('error',error=>{clearTimeout(timer);reject(error)});child.once('exit',code=>{clearTimeout(timer);reject(Error('migration child exited '+code))})});const exited=once(child,'exit');child.kill('SIGKILL');await exited;
  apps=new ApplicationDirectory(join(dir,'apps.json'));await apps.contribute({id:'sample',title:'Sample',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});migrations=new MigrationDirectory(join(dir,'migration.json'),apps,{gate:apps.gate});apps.setReadinessGuard(id=>migrations.assertReady(id));migrations.contribute('sample',{applicationVersions:['1'],inspect:async()=>JSON.parse(await readFile(file)),plan:async context=>({...context,toDataVersion:'2',impact:'Synthetic conversion',irreversible:false,recovery:'Verify current revision'}),execute:async()=>writeFile(file,JSON.stringify({dataVersion:'2',revision:'replayed'})),recover:async()=>({applicationVersion:'1'})});
  const snapshot=await migrations.get(message.viewId),unknown=snapshot.plans.find(plan=>plan.id===message.planId);assert.equal(snapshot.status,'unknown');assert.equal(unknown.status,'unknown');assert.equal(await readFile(file,'utf8'),original);
  await assert.rejects(apps.createInstance('sample',null),{code:'migration-recovery-required'});await assert.rejects(migrations.confirm({id:unknown.id,revision:unknown.revision,confirmed:true}),{code:'migration-pending'});assert.equal(await readFile(file,'utf8'),original);
  await migrations.recover({id:unknown.id,revision:unknown.revision,confirmed:true,dataRevision:'r1'});assert.equal((await migrations.get(message.viewId)).status,'ready');assert.equal(await readFile(file,'utf8'),original);
 }finally{if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'exit')}await migrations?.close();await apps?.close();await rm(dir,{recursive:true,force:true})}
})

import {describeProtocol,requireProtocol} from '../01_content/src/sdk.mjs'
test('independent applications discover migration support through the public protocol',()=>{assert.equal(requireProtocol(describeProtocol(),['application-migration-v1']).protocolVersion,1)})

test('owner replacement and unsupported definitions invalidate plans without changing business bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-owner-generation-'));let apps,migrations;
 try{
  const file=join(dir,'business.json'),original=JSON.stringify({dataVersion:'1',revision:'r1'});await writeFile(file,original);apps=new ApplicationDirectory(join(dir,'apps.json'));let remove=await apps.contribute({id:'sample',title:'Sample',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});const instance=await apps.createInstance('sample',null),view=await apps.createView(instance.id);
  migrations=new MigrationDirectory(join(dir,'migration.json'),apps,{gate:apps.gate});apps.setReadinessGuard(id=>migrations.assertReady(id));const owner={applicationVersions:['1'],inspect:async()=>JSON.parse(await readFile(file)),plan:async source=>({...source,toDataVersion:'2',impact:'Synthetic',irreversible:false,recovery:'Check checkpoint'}),execute:async()=>assert.fail('stale owner must never execute')};let dispose=migrations.contribute('sample',owner);await migrations.adopt({viewId:view.id,applicationVersion:'1',dataVersion:'1',dataRevision:'r1',confirmed:true});const plan=await migrations.prepare({viewId:view.id});dispose();migrations.contribute('sample',owner);
  await assert.rejects(migrations.confirm({id:plan.id,revision:plan.revision,confirmed:true}),{code:'plan-changed'});assert.equal(await readFile(file,'utf8'),original);await migrations.discard({id:plan.id,revision:plan.revision});remove();await apps.contribute({id:'sample',title:'Sample',version:'unknown-v3',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});const ledger=await readFile(join(dir,'migration.json'),'utf8');await assert.rejects(migrations.prepare({viewId:view.id}),{code:'definition-incompatible'});await assert.rejects(apps.createInstance('sample',null),{code:'definition-incompatible'});assert.equal(await readFile(join(dir,'migration.json'),'utf8'),ledger);assert.equal(await readFile(file,'utf8'),original);
 }finally{await migrations?.close();await apps?.close();await rm(dir,{recursive:true,force:true})}
})
