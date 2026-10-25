import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {mountApplications} from '../01_content/src/framework/host.mjs'
import {describeProtocol,requireProtocol} from '../01_content/src/sdk.mjs'

test('planned target ownership inspection has an explicit discoverable requirement, distinct from pure legacy source inspection',()=>{
 const descriptor=describeProtocol()
 assert.ok(requireProtocol(descriptor,['legacy-role-target-inspection-v1']).features.includes('legacy-role-target-inspection-v1'))
 const older={...descriptor,features:descriptor.features.filter(feature=>feature!=='legacy-role-target-inspection-v1')}
 assert.ok(requireProtocol(older,['legacy-role-source-inspection-v1']))
 assert.throws(()=>requireProtocol(older,['legacy-role-target-inspection-v1']),/legacy-role-target-inspection-v1/)
})

test('independent consumer discovers declared protocol and refuses unknown versions or missing features without creating work',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-sdk-')),services=new Map(),effects=[];
 const ctx={webServer:{register(){return()=>{}}},inject(keys,fn){if(keys.every(key=>services.has(key)))fn({...ctx,...Object.fromEntries(services)})},provide(key,value){services.set(key,value)},effect(fn){effects.push(fn)}};
 services.set('profileContext',{dir});services.set('connection',{});
 try{
  mountApplications(ctx);
  const protocol=services.get('worktableProtocol');
  assert.ok(protocol,'Host provides a public non-mutating protocol service');
  const descriptor=requireProtocol(protocol.describe(),['application-registration-v1','application-private-capability-v1','prepared-task-v1','application-lifecycle-v1']);
  assert.equal(descriptor.protocolVersion,1);
  descriptor.features.push('not-real');
  assert.ok(!protocol.describe().features.includes('not-real'),'consumer cannot mutate the Host capability declaration');
  assert.throws(()=>requireProtocol({protocolVersion:2,features:['prepared-task-v1']},['prepared-task-v1']),/协议/);
  assert.throws(()=>requireProtocol({protocolVersion:1,features:[]},['prepared-task-v1']),/prepared-task-v1/);
  assert.throws(()=>requireProtocol(null,[]),/协议/);
  assert.equal((await services.get('worktableApplications').snapshot()).instances.length,0);
  const applications=services.get('worktableApplications'),remove=await applications.contribute({id:'sdk-example',title:'SDK consumer',version:'0.1.0',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});
  const entry=(await applications.snapshot()).applications.find(app=>app.id==='sdk-example');assert.equal(entry.enabled,true);
  assert.deepEqual(await applications.setEnabled('sdk-example',false,entry.lifecycleRevision),{appId:'sdk-example',enabled:false,revision:1});
  await assert.rejects(applications.createInstance('sdk-example',null),/停用/);await remove();
 }finally{for(const effect of effects.reverse()){const dispose=effect();if(typeof dispose==='function')await dispose()}await rm(dir,{recursive:true,force:true})}
})
