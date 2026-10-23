import assert from 'node:assert/strict'
import{test}from'node:test'
import{mkdtemp,rm,readFile}from'node:fs/promises'
import{join}from'node:path'
import{tmpdir}from'node:os'
import{ApplicationDirectory}from'../01_content/src/framework/applications.mjs'
import{AdmissionGate}from'../01_content/src/framework/admission.mjs'
import{TaskDirectory,TaskStore}from'../01_content/src/framework/tasks.mjs'
import{ProfileFileStore}from'../01_content/src/framework/persistence.mjs'
import{applicationState}from'../01_content/src/framework/state-schema.mjs'
test('disable is durable and fences new instances and submissions, while accepted historical controls survive policy and contribution removal',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-lifecycle-')),file=join(dir,'apps.json'),gate=new AdmissionGate();let apps=new ApplicationDirectory(file,{gate}),store,tasks,prompts=0,cancels=0;
 const def={id:'reader',title:'Reader',version:'1',kind:'deep',protocolVersion:1,views:[{id:'page',title:'Page'}]};let remove=await apps.contribute(def);const a=await apps.createInstance('reader','A'),view=await apps.createView(a.id);store=await TaskStore.open(join(dir,'tasks.json'));
 const roles={read:async()=>({binding:{phase:'ready',sessionId:'native-A',revision:2}}),resolve:async()=>({}),handoff:async()=>[]};const options={applications:apps,roles,resources:{captureTaskContexts:async()=>[],withTaskLease:async(v,r,run)=>run()},gate,native:{prompt:async()=>{prompts++;return{accepted:true}},cancel:async({sessionId})=>{assert.equal(sessionId,'native-A');cancels++}}};tasks=new TaskDirectory(store,options);
 try{const accepted=await tasks.prepare({viewId:view.id,roleId:'assistant',text:'Accepted first'});await tasks.submit(accepted.id,accepted.revision);const draft=await tasks.prepare({viewId:view.id,roleId:'assistant',text:'Do not send after disable'});
 const disabled=await apps.setEnabled('reader',false,0);assert.equal(disabled.enabled,false);assert.equal((await apps.snapshot()).schema,2);await assert.rejects(apps.createInstance('reader','B'),{code:'application-disabled'});await assert.rejects(tasks.prepare({viewId:view.id,roleId:'assistant',text:'Blocked'}),{code:'application-disabled'});await assert.rejects(tasks.submit(draft.id,draft.revision),{code:'application-disabled'});assert.equal(prompts,1);assert.equal(cancels,0);await assert.rejects(apps.setEnabled('reader',true,0),{code:'revision-conflict'});
 remove();assert.equal((await tasks.list(view.id)).length,2);assert.equal((await tasks.open(accepted.id)).sessionId,'native-A');await tasks.stop(accepted.id);assert.equal(cancels,1);const handoff=await tasks.handoff();assert.equal(handoff.tasks.find(t=>t.id===accepted.id).sessionId,'native-A');assert.equal(handoff.tasks.find(t=>t.id===accepted.id).source.viewId,view.id);
 await tasks.close();await apps.close();apps=new ApplicationDirectory(file,{gate});assert.equal((await apps.snapshot()).schema,2);const bytes=await readFile(file);await apps.close();const old=new ProfileFileStore(file,()=>({schema:1,applications:[],instances:[],views:[]}),applicationState);await assert.rejects(old.ready(),{code:'schema-incompatible'});await old.close();assert.deepEqual(await readFile(file),bytes);
 apps=new ApplicationDirectory(file,{gate});await apps.setEnabled('reader',true,disabled.revision);assert.equal((await apps.snapshot()).schema,1);remove=await apps.contribute(def);assert.equal((await apps.resolveView(view.id)).instance.id,a.id);assert.equal((await apps.snapshot()).instances.length,1);
 }finally{await tasks?.close();await apps.close();await rm(dir,{recursive:true,force:true})}
})

import fs from 'node:fs'
import{syncBuiltinESMExports}from'node:module'
test('failed lifecycle publication preserves the old policy and bytes; explicit retry never rewrites business data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-policy-failure-')),file=join(dir,'apps.json'),apps=new ApplicationDirectory(file);const original=fs.promises.rename;let fail=true;
 try{await apps.register({id:'web',title:'Web',kind:'web',protocolVersion:1,version:'1',url:'https://example.com'});const instance=await apps.createInstance('web','P');const before=await readFile(file);fs.promises.rename=async(from,to)=>{if(fail&&String(to)===file){fail=false;throw Error('simulated policy write failure')}return original(from,to)};syncBuiltinESMExports();await assert.rejects(apps.setEnabled('web',false,0),{code:'storage-unavailable'});assert.deepEqual(await readFile(file),before);assert.equal((await apps.catalog())[0].enabled,true);await apps.setEnabled('web',false,0);assert.equal((await apps.snapshot()).instances[0].id,instance.id);assert.equal((await apps.snapshot()).schema,2);
 }finally{fs.promises.rename=original;syncBuiltinESMExports();await apps.close();await rm(dir,{recursive:true,force:true})}
})
test('application disable cannot overtake an already entering native admission, and no later task can enter',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-policy-admission-')),gate=new AdmissionGate(),apps=new ApplicationDirectory(join(dir,'apps.json'),{gate});let store,tasks,enter,release,disabled=false,prompts=0;
 try{await apps.contribute({id:'reader',title:'Reader',kind:'deep',protocolVersion:1,version:'1',views:[{id:'page',title:'Page'}]});const instance=await apps.createInstance('reader','P'),view=await apps.createView(instance.id);store=await TaskStore.open(join(dir,'tasks.json'));const entered=new Promise(resolve=>enter=resolve),barrier=new Promise(resolve=>release=resolve);tasks=new TaskDirectory(store,{applications:apps,gate,roles:{read:async()=>({binding:{phase:'ready',sessionId:'native',revision:1}}),resolve:async()=>({})},resources:{captureTaskContexts:async()=>[],withTaskLease:async(v,r,run)=>run()},native:{prompt:async()=>{prompts++;enter();await barrier;return{accepted:true}}}});const draft=await tasks.prepare({viewId:view.id,roleId:'assistant',text:'First admission'}),submit=tasks.submit(draft.id,draft.revision);await entered;const disable=apps.setEnabled('reader',false,0).then(()=>disabled=true);await new Promise(resolve=>setImmediate(resolve));assert.equal(disabled,false);release();await submit;await disable;assert.equal(prompts,1);await assert.rejects(tasks.prepare({viewId:view.id,roleId:'assistant',text:'Later'}),{code:'application-disabled'});
 }finally{release?.();await tasks?.close();await store?.close();await apps.close();await rm(dir,{recursive:true,force:true})}
})
