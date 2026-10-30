import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {TaskDirectory,TaskStore} from '../01_content/src/framework/tasks.mjs'
import {AdmissionGate} from '../01_content/src/framework/admission.mjs'

test('preparation, editing, removal and discard never submit; one explicit intent is durable and never replayed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-task-'));const gate=new AdmissionGate();let count=0;
 const applications={resolveView:async id=>({view:{id,type:'page'},instance:{id:'A',appId:'reader',revision:1},application:{id:'reader',kind:'deep',title:'Reader'}})}
 const roles={read:async()=>({binding:{phase:'ready',sessionId:'native-A',revision:2}}),resolve:async()=>({phase:'ready',sessionId:'native-A',revision:2})}
 const resources={captureTaskContexts:async()=>[],withTaskLease:async(view,refs,run)=>run()}
 let store=await TaskStore.open(join(dir,'tasks.json'));let tasks=new TaskDirectory(store,{applications,roles,resources,gate,native:{prompt:async request=>{count++;assert.equal((await store.snapshot()).tasks[0].requestId,request.requestId);return {accepted:true}},flush:async()=>{}}})
 try{
 const prepared=await tasks.prepare({viewId:'view-A',roleId:'assistant',text:'Read my selected item',contexts:[]});assert.equal(count,0);assert.equal(prepared.instanceId,'A');
 const edited=await tasks.edit(prepared.id,prepared.revision,{text:'Changed task',contexts:[]});assert.equal(count,0)
 const [sent,duplicate]=await Promise.all([tasks.submit(edited.id,edited.revision),tasks.submit(edited.id,edited.revision)]);assert.equal(count,1);assert.equal(sent.requestId,duplicate.requestId);assert.equal(sent.status,'accepted');
 await store.close();store=await TaskStore.open(join(dir,'tasks.json'));tasks=new TaskDirectory(store,{applications,roles,resources,gate,native:{prompt:async()=>{count++;throw Error('must not replay')}}});
 assert.equal((await tasks.list('view-A'))[0].requestId,sent.requestId);assert.equal(count,1);
 const discarded=await tasks.prepare({viewId:'view-A',roleId:'assistant',text:'Do not send',contexts:[]});await tasks.discard(discarded.id,discarded.revision);await assert.rejects(()=>tasks.submit(discarded.id,discarded.revision));assert.equal(count,1)
 }finally{await store.close();await rm(dir,{recursive:true,force:true})}
})

import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {ResourceDirectory} from '../01_content/src/framework/resources.mjs'
test('shared context is owner-rendered; revoked or revised references reject before prompt, admission serializes revoke',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-task-grant-'));const gate=new AdmissionGate();const apps=new ApplicationDirectory(join(dir,'apps.json'),{gate});
 await apps.contribute({id:'reader',title:'Reader',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});const a=await apps.createInstance('reader','project-A'),b=await apps.createInstance('reader','project-B');const av=await apps.createView(a.id),bv=await apps.createView(b.id);
 const resources=new ResourceDirectory(join(dir,'resources.json'),apps,gate);let resourceRevision='1',count=0,entered,release;
 resources.register({appId:'reader',resourceId:'records',actions:[],read:()=>({revision:resourceRevision,records:[{id:'one',title:'Source A'}]}),taskContext:(row,selection)=>({title:'Owner selected records',text:JSON.stringify(row.records.filter(r=>selection.ids.includes(r.id)))}),withTaskLease:run=>run()});
 const grant=await resources.share({ownerViewId:av.id,consumerInstanceId:b.id,resourceId:'records'});const store=await TaskStore.open(join(dir,'tasks.json'));
 const roles={read:async()=>({binding:{phase:'ready',sessionId:'native-B',revision:2}}),resolve:async()=>({sessionId:'native-B',revision:2})};
 const native={prompt:async request=>{count++;entered?.();if(release!==false)await new Promise(resolve=>release=resolve);return {accepted:true}}};const tasks=new TaskDirectory(store,{applications:apps,resources,roles,gate,native});
 try{
 const input={viewId:bv.id,roleId:'assistant',text:'Summarize',contexts:[{resourceId:'records',selection:{ids:['one']}}]};
 const draft=await tasks.prepare(input);assert.equal(draft.contexts[0].metadata.ownerInstanceId,a.id);assert.match(draft.contexts[0].text,/Source A/);resourceRevision='2';await assert.rejects(tasks.submit(draft.id,draft.revision),{code:'context-changed'});assert.equal(count,0);
 const ready=await tasks.prepare(input);const started=new Promise(resolve=>entered=resolve);const submitting=tasks.submit(ready.id,ready.revision);await started;let revoked=false;const revoke=resources.revoke(grant.id,grant.revision).then(()=>revoked=true);await new Promise(resolve=>setImmediate(resolve));assert.equal(revoked,false,'revoke must not overtake native admission');release();await submitting;await revoke;assert.equal(count,1);
 await assert.rejects(tasks.prepare(input),{code:'revoked'});assert.equal((await tasks.open(ready.id)).sessionId,'native-B');
 }finally{await store.close();await rm(dir,{recursive:true,force:true})}
})
test('native failure after invocation stays unknown and an explicit repeat never invokes another channel',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-task-unknown-'));const store=await TaskStore.open(join(dir,'tasks.json'));let count=0;
 const context={view:{id:'view',type:'page'},instance:{id:'A',appId:'reader',revision:1},application:{id:'reader',kind:'deep',title:'Reader'}};
 const tasks=new TaskDirectory(store,{applications:{resolveView:async()=>context},roles:{read:async()=>({binding:{phase:'ready',sessionId:'original',revision:2}}),resolve:async()=>({})},resources:{captureTaskContexts:async()=>[],withTaskLease:async(v,r,run)=>run()},native:{prompt:async()=>{count++;throw Error('connection lost after admission')},cancel:async({sessionId})=>assert.equal(sessionId,'original')}});
 try{const draft=await tasks.prepare({viewId:'view',roleId:'assistant',text:'One task'});const result=await tasks.submit(draft.id,draft.revision);assert.equal(result.status,'unknown');await tasks.submit(draft.id,draft.revision);assert.equal(count,1);await tasks.stop(draft.id);assert.equal((await tasks.open(draft.id)).sessionId,'original');assert.equal((await tasks.list('view'))[0].status,'unknown')}finally{await store.close();await rm(dir,{recursive:true,force:true})}
})

test('an async descendant cannot reuse an admission lease after its original operation returns',async()=>{
 const gate=new AdmissionGate();let later,hold,release,ran=false;
 await gate.run(async()=>{later=new Promise(resolve=>{setTimeout(()=>{void gate.run(()=>{ran=true}).then(resolve)},25)})});
 const entered=new Promise(resolve=>hold=resolve);const blocking=gate.run(async()=>{hold();await new Promise(resolve=>release=resolve)});await entered;
 await new Promise(resolve=>setTimeout(resolve,60));assert.equal(ran,false,'released async-context tokens must not bypass a later admission owner');release();await blocking;await later;assert.equal(ran,true)
})

test('a reopened durable submitting intent is unknown and still controls its original native session without replay',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-task-intent-'));let store=await TaskStore.open(join(dir,'tasks.json'));let cancelled=null,prompts=0;
 await store.change(data=>{data.tasks=[{id:'interrupted',revision:2,status:'submitting',requestId:'stable-request',sessionId:'old-native',instanceId:'A',source:{viewId:'view-A'},contexts:[]}];return null});await store.close();store=await TaskStore.open(join(dir,'tasks.json'));
 const tasks=new TaskDirectory(store,{applications:{resolveView:async()=>({instance:{id:'A'}})},roles:{},resources:{withTaskLease:()=>{throw Error('old grant revoked')}},native:{prompt:async()=>{prompts++},cancel:async value=>cancelled=value.sessionId}});
 try{assert.equal((await tasks.list('view-A'))[0].status,'unknown');assert.equal((await tasks.submit('interrupted',1)).status,'unknown');await tasks.stop('interrupted');assert.equal(cancelled,'old-native');assert.equal(prompts,0);assert.equal((await tasks.list('view-A'))[0].status,'unknown')}finally{await store.close();await rm(dir,{recursive:true,force:true})}
})

test('two declared resources sharing one owner lease authority acquire it once instead of waiting on themselves',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-task-alias-'));let queue=Promise.resolve(),acquired=0;
 const lease=operation=>{acquired++;const task=queue.then(operation);queue=task.catch(()=>{});return task};
 const apps={resolveView:async()=>({application:{kind:'deep'},instance:{id:'A',appId:'reader'}})};const resources=new ResourceDirectory(join(dir,'resources.json'),apps);
 try{for(const resourceId of ['books','notes'])resources.register({appId:'reader',resourceId,actions:[],read:()=>({revision:'1'}),taskContext:()=>({title:resourceId,text:'evidence'}),withTaskLease:lease});
 const outcome=await Promise.race([resources.withTaskLease('view',[{resourceId:'books'},{resourceId:'notes'}],async()=> 'admitted'),new Promise(resolve=>{const timer=setTimeout(()=>resolve('blocked'),5000);timer.unref()})]);assert.equal(outcome,'admitted');assert.equal(acquired,1);
 }finally{await rm(dir,{recursive:true,force:true})}
})

test('native admission descendants cannot inherit a live Worktable privilege and Stop audit survives a late admission receipt',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-native-detach-'));const store=await TaskStore.open(join(dir,'tasks.json')),gate=new AdmissionGate();let entered,release,descendant=false,cancelled=0;
 const started=new Promise(resolve=>entered=resolve);let descendantDone;
 const tasks=new TaskDirectory(store,{gate,applications:{resolveView:async()=>({view:{id:'view',type:'page'},instance:{id:'A',appId:'reader',revision:1},application:{kind:'deep',title:'Reader'}})},roles:{read:async()=>({binding:{phase:'ready',sessionId:'native-A',revision:2}}),resolve:async()=>({})},resources:{captureTaskContexts:async()=>[],withTaskLease:async(v,r,run)=>run()},native:{prompt:async()=>{entered();descendantDone=new Promise(resolve=>queueMicrotask(()=>{void gate.run(()=>{descendant=true}).then(resolve)}));await new Promise(resolve=>release=resolve);return {accepted:true}},cancel:async()=>{cancelled++}}});
 try{const draft=await tasks.prepare({viewId:'view',roleId:'assistant',text:'One task'});const pending=tasks.submit(draft.id,1);await started;await new Promise(resolve=>setImmediate(resolve));const childBeforeAdmission=descendant;await tasks.stop(draft.id);release();await pending;await descendantDone;assert.equal(childBeforeAdmission,false,'native descendants must wait for the admission owner');const row=(await tasks.list('view'))[0];assert.equal(cancelled,1);assert.ok(row.stopRequestedAt,'a late accepted receipt must preserve an independently admitted Stop request');assert.equal(row.status,'accepted')}
 finally{release?.();await store.close();await rm(dir,{recursive:true,force:true})}
})

import {RoleDirectory,RoleStore} from '../01_content/src/framework/roles.mjs'
test('actual role replacement waits for native admission; stale prepared binding rejects and historical task control keeps its original session',async()=>{
const dir=await mkdtemp(join(tmpdir(),'wt-07-review-actual-roles-')),gate=new AdmissionGate()
let roles,store,release
try{
 const apps=new ApplicationDirectory(join(dir,'apps.json'),{gate})
 await apps.contribute({id:'reader',title:'Reader',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]})
 const instance=await apps.createInstance('reader',null),view=await apps.createView(instance.id)
 roles=new RoleDirectory(await RoleStore.open(join(dir,'roles.json')),apps,{validate:async()=>({presetId:'reader'}),create:async row=>row.sessionId,validateExisting:async()=>{}},gate)
 roles.contribute('reader',[{id:'assistant',title:'Assistant',agent:{kind:'agent',source:'managed',id:'reader'},creation:{cwd:dir}}])
 const binding=await roles.ensure(instance.id,'assistant')
 store=await TaskStore.open(join(dir,'tasks.json'))
 let entered,calls=0,cancelled
 const started=new Promise(resolve=>entered=resolve),blocked=new Promise(resolve=>release=resolve)
 const tasks=new TaskDirectory(store,{gate,applications:apps,roles,resources:new ResourceDirectory(join(dir,'resources.json'),apps,gate),native:{prompt:async request=>{calls++;assert.equal(request.sessionId,binding.sessionId);entered();await blocked;return {accepted:true}},cancel:async request=>cancelled=request.sessionId}})
 const draft=await tasks.prepare({viewId:view.id,roleId:'assistant',text:'First task'}),stale=await tasks.prepare({viewId:view.id,roleId:'assistant',text:'Stale target'})
 const submitting=tasks.submit(draft.id,1);await started
 let replaced=false
 const replacement=roles.replace(instance.id,'assistant',binding.sessionId,binding.revision).then(row=>{replaced=true;return row})
 await new Promise(resolve=>setImmediate(resolve));assert.equal(replaced,false)
 release();await submitting;const current=await replacement
 assert.notEqual(current.sessionId,binding.sessionId)
 assert.equal((await tasks.open(draft.id)).sessionId,binding.sessionId)
 await tasks.stop(draft.id);assert.equal(cancelled,binding.sessionId)
 await assert.rejects(tasks.submit(stale.id,1),{code:'binding-changed'})
 assert.equal(calls,1)
}finally{release?.();await store?.close();await roles?.dispose();await rm(dir,{recursive:true,force:true})}

})
