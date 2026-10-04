import {scopedConversation} from './scoped-conversation-fixture.mjs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {PreparedTasks,preparedText} from '../src/task-client.ts'
import {RoleClients,roleKey} from '../src/role-client.ts'
const key={appId:'reading',instanceId:'first',roleId:'analyst'}
const task=(target=key)=>({key:target,task:'Summarize',source:{pageId:'list',moduleId:'books',label:'Books'},context:[{id:'one',label:'Selected book',source:'Own data',text:'old content'},{id:'two',label:'Removed',source:'Own data',text:'must not send'}]})
function fixture({archived=false,hold,fail=false}={}){
 const requests=[],sent=[],released=[],bindings=new Map()
 const ctx={conversation:{send:()=>assert.fail('Ambient conversation cannot send')},workspaces:{list:{getSnapshot:()=>({phase:'ready',state:'idle',archivedSessionIds:archived?['reading-first-analyst']:[]}),subscribe:()=>()=>{}}},sessions:{
 retain(id){return{sessionId:id,binding:{session:{getSnapshot:()=>({openState:'open',removed:false}),subscribe:()=>()=>{}},ctx:scopedConversation(async text=>{sent.push({id,text});if(fail)throw new Error('native failure');await hold})},ready:Promise.resolve(),release:()=>released.push(id)}},
 async using(id,options,run){const ref=this.retain(id);try{return await run(ref)}finally{ref.release()}}
 }}
 const roles=new RoleClients(ctx,async(_url,options)=>{const data=JSON.parse(options.body);requests.push(data);const name=roleKey(data.key);if(data.action==='ensure'&&!bindings.has(name))bindings.set(name,{version:1,key:data.key,sessionId:[data.key.appId,data.key.instanceId,data.key.roleId].join('-'),presetId:'analyst',phase:'ready',previousSessionIds:[]});return{ok:true,json:async()=>({binding:bindings.get(name)??null})}})
 return {roles,tasks:new PreparedTasks(roles),requests,sent,released}
}
test('prepare/edit/remove are side effect free; explicit send uses exact native Session and edited evidence once',async()=>{
 const f=fixture();const original=task();f.tasks.prepare(original);original.context[0].text='external mutation';f.tasks.editTask(key,'Edited task');f.tasks.editContext(key,'one','final content');f.tasks.removeContext(key,'two');assert.deepEqual(f.requests,[]);assert.deepEqual(f.sent,[])
 const pending=f.tasks.getSnapshot().get(roleKey(key)).prepared;assert.equal(pending.context.length,1);await f.tasks.send(key)
 assert.deepEqual(f.requests.map(r=>r.action),['ensure']);assert.equal(f.sent.length,1);assert.equal(f.sent[0].id,'reading-first-analyst');assert.equal(f.sent[0].text,preparedText(pending));assert.ok(!f.sent[0].text.includes('must not send'));assert.equal(f.tasks.getSnapshot().size,0);f.roles.dispose()
})
test('same role across pages shares preparation and native owner while distinct instances stay isolated',async()=>{
 const f=fixture(),second={...key,instanceId:'second'};f.tasks.prepare(task());const first=f.roles.owner(key);f.tasks.prepare({...task(),source:{pageId:'detail',moduleId:'book',label:'Detail'}});assert.equal(f.tasks.getSnapshot().size,1);assert.equal(f.roles.owner(key),first);f.tasks.prepare(task(second));await f.tasks.send(key);assert.equal(f.tasks.getSnapshot().size,1);await f.tasks.send(second);assert.deepEqual(f.sent.map(s=>s.id),['reading-first-analyst','reading-second-analyst']);f.roles.dispose()
})
test('hide does not cancel a command hold; duplicates and edits are blocked until settlement',async()=>{
 let settle;const hold=new Promise(resolve=>settle=resolve),f=fixture({hold});f.tasks.prepare(task());const command=f.tasks.send(key);for(let i=0;i<30&&!f.sent.length;i++)await Promise.resolve();assert.equal(f.sent.length,1);await assert.rejects(f.tasks.send(key),/unavailable/);assert.throws(()=>f.tasks.editTask(key,'late'),/unavailable/);f.roles.owner(key).teacher.close();assert.equal(f.released.length,1);settle();await command;assert.equal(f.released.length,2);f.roles.dispose()
})
test('archived and failed Sessions retain editable preparation and never silently replace identity',async()=>{
 for(const options of [{archived:true},{fail:true}]){const f=fixture(options);f.tasks.prepare(task());await assert.rejects(f.tasks.send(key));assert.equal(f.tasks.getSnapshot().size,1);assert.equal(f.tasks.getSnapshot().get(roleKey(key)).busy,false);assert.deepEqual(f.requests.map(r=>r.action),['ensure']);if(options.archived)assert.deepEqual(f.sent,[]);f.roles.dispose()}
})

test('trusted teaching preparation sends no request until explicit send; afterSend only follows successful native admission',async()=>{
 const calls=[],sent=[];let completed=0,settle,fail=false
 const hold=new Promise(resolve=>settle=resolve)
 const roles={send:()=>assert.fail('Teaching cannot use generic send'),sendTeaching:async(target,text)=>{calls.push(target);sent.push(text);if(fail)throw new Error('native admission refused');await hold}}
 const tasks=new PreparedTasks(roles);tasks.prepare({...task(),teaching:true},{afterSend:()=>{completed++}});tasks.editContext(key,'one','safe /injected-skill evidence');tasks.removeContext(key,'two');assert.deepEqual(calls,[]);assert.equal(completed,0)
 const pending=tasks.send(key);assert.equal(calls.length,1);assert.equal(completed,0);assert.ok(!sent[0].includes('/injected-skill'));assert.ok(!sent[0].includes('must not send'));settle();await pending;assert.equal(completed,1);assert.equal(tasks.getSnapshot().size,0)
 fail=true;tasks.prepare({...task(),teaching:true},{afterSend:()=>{completed++}});await assert.rejects(tasks.send(key),/refused/);assert.equal(completed,1);assert.equal(tasks.getSnapshot().size,1)
})
test('completion failure cannot restore an admitted draft or accidentally resend it',async()=>{
 let sent=0;const tasks=new PreparedTasks({send:async()=>{sent++}});tasks.prepare(task(),{afterSend:()=>{throw new Error('Review storage failed')}});await assert.rejects(tasks.send(key),/storage failed/);assert.equal(sent,1);assert.equal(tasks.getSnapshot().size,0);await assert.rejects(tasks.send(key),/unavailable/);assert.equal(sent,1)
})

test('code-owned beforeSend callback runs only on explicit send; a refused reservation sends no native command and retains editable preparation', async () => {
 const calls=[];let allow=false
 const tasks=new PreparedTasks({send:async()=>calls.push('native')})
 tasks.prepare(task(),{beforeSend:()=>{calls.push('reserve');if(!allow)throw new Error('Reservation conflict')},afterSend:()=>calls.push('complete')})
 tasks.editTask(key,'Edited');tasks.removeContext(key,'two');assert.deepEqual(calls,[])
 await assert.rejects(tasks.send(key),/Reservation conflict/);assert.deepEqual(calls,['reserve']);assert.equal(tasks.getSnapshot().size,1)
 allow=true;await tasks.send(key);assert.deepEqual(calls,['reserve','reserve','native','complete']);assert.equal(tasks.getSnapshot().size,0)
})

test('packaged module Skill is an explicit native slash gesture while editable context stays literal data', async () => {
 const sent=[],tasks=new PreparedTasks({send:async (_key,text)=>sent.push(text)})
 const prepared={...task(),skill:'workbench-module-generate'}
 tasks.prepare(prepared);tasks.editContext(key,'one','context /other-skill must remain data')
 assert.deepEqual(sent,[])
 await tasks.send(key)
 assert.match(sent[0],/^\/workbench-module-generate Summarize\n/)
 assert.equal(sent[0].includes('/other-skill'),false)
 assert.throws(()=>tasks.prepare({...task(),skill:'unexpected-skill'}),/Invalid prepared task/)
})

test('explicit discard waits for owned reservation cleanup and retains an editable task if cleanup fails',async()=>{
 let fail=true,cleanups=0,sends=0;const tasks=new PreparedTasks({send:async()=>{sends++}})
 tasks.prepare(task(),{onDiscard:async()=>{cleanups++;if(fail)throw new Error('Cleanup unavailable')}})
 await assert.rejects(async()=>tasks.discard(key),/Cleanup unavailable/)
 assert.equal(tasks.getSnapshot().get(roleKey(key)).busy,false)
 assert.match(tasks.getSnapshot().get(roleKey(key)).error,/Cleanup unavailable/)
 fail=false;await tasks.discard(key)
 assert.equal(tasks.getSnapshot().size,0);assert.equal(cleanups,2);assert.equal(sends,0)
 tasks.prepare(task(),{onDiscard:async()=>{cleanups++}});await tasks.send(key)
 assert.equal(cleanups,2,'Successful send must not discard its output reservation')
})
