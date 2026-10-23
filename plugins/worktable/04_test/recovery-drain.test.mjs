import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {TaskDirectory,TaskStore} from '../01_content/src/framework/tasks.mjs'

test('retiring a native admission retains its writer until settled; reopening preserves the one intent and never replays or stops it',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-admission-drain-')),file=join(dir,'tasks.json');let release,enter,prompts=0,cancels=0,closed=false;
 const entered=new Promise(resolve=>enter=resolve),blocked=new Promise(resolve=>release=resolve),store=await TaskStore.open(file);
 const applications={resolveView:async()=>({view:{id:'view',type:'page'},instance:{id:'A',appId:'reader',revision:1},application:{id:'reader',kind:'deep',title:'Reader'}})};
 const options={applications,roles:{read:async()=>({binding:{phase:'ready',sessionId:'native-A',revision:2}}),resolve:async()=>({sessionId:'native-A',revision:2})},resources:{captureTaskContexts:async()=>[],withTaskLease:async(v,r,run)=>run()},native:{prompt:async()=>{prompts++;enter();await blocked;return{accepted:true}},cancel:async()=>cancels++}};
 const tasks=new TaskDirectory(store,options);let reopened;
 try{const draft=await tasks.prepare({viewId:'view',roleId:'assistant',text:'One durable task'}),sending=tasks.submit(draft.id,draft.revision);await entered;
 const closing=tasks.close().then(()=>closed=true);await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,false);await assert.rejects(TaskStore.open(file),{code:'owner-conflict'});await assert.rejects(tasks.prepare({viewId:'view',roleId:'assistant',text:'Too late'}));assert.equal(cancels,0);
 release();const accepted=await sending;await closing;reopened=await TaskStore.open(file);const next=new TaskDirectory(reopened,options);assert.equal((await next.list('view'))[0].requestId,accepted.requestId);await next.submit(accepted.id,accepted.revision);assert.equal(prompts,1);assert.equal(cancels,0);await next.close();
 }finally{release();await tasks.close();await reopened?.close();await rm(dir,{recursive:true,force:true})}
})
