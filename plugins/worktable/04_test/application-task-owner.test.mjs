import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {TaskDirectory,TaskStore} from '../01_content/src/framework/tasks.mjs'

async function fixture(run){
 const dir=await mkdtemp(join(tmpdir(),'worktable-owned-task-'));const store=await TaskStore.open(join(dir,'tasks.json'));
 let calls=0,claimed=0,completed=0,locked=false,failCompletion=false,unknown=false,leaseFailure=false;
 const applications={resolveView:async viewId=>({view:{id:viewId,type:'page'},instance:{id:viewId==='other'?'B':'A',appId:viewId==='foreign'?'other-app':'study',revision:1},application:{kind:'deep',title:'Study'}})};
 const resources={captureTaskContexts:async()=>[],withTaskLease:async(v,r,operation)=>{if(leaseFailure)throw Error('resource grant revoked');locked=true;try{return await operation()}finally{locked=false}}};
 let tasks=new TaskDirectory(store,{applications,roles:{read:async()=>({binding:{phase:'ready',sessionId:'native',revision:1}}),resolve:async()=>({})},resources,native:{prompt:async()=>{calls++;if(unknown)throw Error('reply lost');return {accepted:true}},flush:async()=>{},cancel:async()=>{}}});
 const owner={version:'1',prepare:async(context,payload)=>({id:payload.roundId,text:'Review '+payload.roundId,contexts:[],token:{roundId:payload.roundId,instanceId:context.instanceId}}),validate:async row=>assert.equal(row.preparation.token.instanceId,row.instanceId),beforeSubmit:async()=>{assert.equal(locked,false,'claims must not reenter a held resource lease');claimed++},accepted:async()=>{assert.equal(locked,false,'completion must not reenter a held resource lease');if(failCompletion)throw Error('write failed');completed++}};
 try{await run({tasks,store,owner,reopen:async()=>{const options={applications:tasks.applications,roles:tasks.roles,resources:tasks.resources,native:tasks.native};await tasks.close();tasks=new TaskDirectory(await TaskStore.open(join(dir,'tasks.json')),options);tasks.contributeOwner('study','review',owner);return tasks},setLeaseFailure:value=>{leaseFailure=value},setFail:value=>{failCompletion=value},setUnknown:value=>{unknown=value},counts:()=>({calls,claimed,completed})})}finally{await tasks.close();await rm(dir,{recursive:true,force:true})}
}

test('application-owned preparation is pure; only explicit native admission claims and finalizes its owner',async()=>fixture(async({tasks,owner,counts})=>{
 tasks.contributeOwner('study','review',owner);
 const row=await tasks.prepareOwned({viewId:'view',roleId:'teacher',kind:'review',payload:{roundId:'round-A'}});
 assert.deepEqual(counts(),{calls:0,claimed:0,completed:0});assert.equal(row.instanceId,'A');
 const sent=await tasks.submit(row.id,row.revision);assert.equal(sent.status,'accepted');assert.equal(sent.ownerFinalization,'done');
 await tasks.submit(row.id,row.revision);assert.deepEqual(counts(),{calls:1,claimed:1,completed:1});
 await assert.rejects(()=>tasks.prepareOwned({viewId:'foreign',roleId:'teacher',kind:'review',payload:{roundId:'round-A'}}),{code:'task-owner-unavailable'});
}));

test('known native acceptance with an application write failure is recoverable without another prompt',async()=>fixture(async({tasks,owner,counts,setFail})=>{
 tasks.contributeOwner('study','review',owner);setFail(true);
 const row=await tasks.prepareOwned({viewId:'view',roleId:'teacher',kind:'review',payload:{roundId:'round-A'}});
 const sent=await tasks.submit(row.id,row.revision);assert.equal(sent.status,'accepted');assert.equal(sent.ownerFinalization,'pending');
 await tasks.submit(row.id,row.revision);assert.equal(counts().calls,1);setFail(false);
 const recovered=await tasks.recoverOwner(row.id);assert.equal(recovered.ownerFinalization,'done');assert.equal(counts().calls,1);assert.equal(counts().completed,1);
}));


test('lost native receipt never finalizes business; removed owner does not block native Stop',async()=>fixture(async({tasks,owner,counts,setUnknown})=>{
 const remove=tasks.contributeOwner('study','review',owner);setUnknown(true);
 const row=await tasks.prepareOwned({viewId:'view',roleId:'teacher',kind:'review',payload:{roundId:'round-A'}});
 const unknown=await tasks.submit(row.id,row.revision);assert.equal(unknown.status,'unknown');assert.deepEqual(counts(),{calls:1,claimed:1,completed:0});
 await assert.rejects(tasks.recoverOwner(row.id));await remove();await tasks.stop(row.id);await tasks.submit(row.id,row.revision);assert.equal(counts().calls,1);
}));


test('proved pre-admission failure is durable and explicitly recovers its owner without another native prompt',async()=>fixture(async({tasks,owner,counts})=>{
 let cleanups=0,failCleanup=true
 owner.notAdmitted=async()=>{cleanups++;if(failCleanup)throw Error('owner storage unavailable')}
 const original=owner.beforeSubmit;owner.beforeSubmit=async row=>{await original(row);throw Error('claim reply lost')}
 tasks.contributeOwner('study','review',owner)
 const row=await tasks.prepareOwned({viewId:'view',roleId:'teacher',kind:'review',payload:{roundId:'round-A'}})
 const failed=await tasks.submit(row.id,row.revision)
 assert.equal(failed.status,'failed');assert.equal(failed.ownerRejection,'pending');assert.equal(counts().calls,0)
 await assert.rejects(()=>tasks.recoverOwner(row.id),/owner storage unavailable/);assert.equal(cleanups,1)
 failCleanup=false;const recovered=await tasks.recoverOwner(row.id)
 assert.equal(recovered.ownerRejection,'done');assert.equal(cleanups,2);assert.equal(counts().calls,0)
 await tasks.recoverOwner(row.id);assert.equal(cleanups,2)
}))


test('resource revoked after a business claim proves no admission and explicit recovery never sends',async()=>fixture(async({tasks,owner,counts,setLeaseFailure})=>{
 let released=0;const claim=owner.beforeSubmit
 owner.beforeSubmit=async row=>{await claim(row);setLeaseFailure(true)}
 owner.notAdmitted=async()=>{released++;setLeaseFailure(false)}
 tasks.contributeOwner('study','review',owner)
 const row=await tasks.prepareOwned({viewId:'view',roleId:'teacher',kind:'review',payload:{roundId:'round-A'}})
 const failed=await tasks.submit(row.id,row.revision);assert.equal(failed.ownerRejection,'pending');assert.equal(counts().calls,0)
 await tasks.submit(row.id,row.revision);assert.equal(released,0)
 await tasks.recoverOwner(row.id);assert.equal(released,1);assert.equal(counts().calls,0)
 const next=await tasks.prepareOwned({viewId:'view',roleId:'teacher',kind:'review',payload:{roundId:'round-A'}});assert.equal(next.status,'prepared')
}))


test('owner cleanup lost reply survives task-store restart and explicit recovery cannot resend',async()=>fixture(async({tasks,owner,counts,reopen})=>{
 let released=false,lostReply=true
 owner.beforeSubmit=async()=>{throw Error('known no-native owner failure')}
 owner.notAdmitted=async()=>{released=true;if(lostReply){lostReply=false;throw Error('cleanup reply lost')}}
 tasks.contributeOwner('study','review',owner)
 const row=await tasks.prepareOwned({viewId:'view',roleId:'teacher',kind:'review',payload:{roundId:'round-A'}})
 await tasks.submit(row.id,row.revision);await assert.rejects(()=>tasks.recoverOwner(row.id),/cleanup reply lost/);assert.equal(released,true)
 tasks=await reopen();assert.equal((await tasks.list('view'))[0].ownerRejection,'pending')
 assert.equal((await tasks.recoverOwner(row.id)).ownerRejection,'done');assert.equal(counts().calls,0)
 await tasks.submit(row.id,row.revision);assert.equal(counts().calls,0)
}))
