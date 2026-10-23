import {test} from 'node:test'
import assert from 'node:assert/strict'
import {join} from 'node:path'
import {fixture} from './fixture.mjs'
import {RoleStore,RoleDirectory} from '../../worktable/01_content/src/framework/roles.mjs'
import {TaskStore,TaskDirectory} from '../../worktable/01_content/src/framework/tasks.mjs'
import {notesRole} from '../src/index.ts'
test('new app uses public resource grants and task admission; revoke or business changes fence stale contexts and leases serialize owner writes',async()=>{
 const f=await fixture();let roleStore,taskStore,tasks,roles;
 try{
  const a=await f.instance('A'),b=await f.instance('B'),r=f.owner.resource;
  let value=await r.read(a.instance.id);value=await r.mutate(a.instance.id,'create',{note:{title:'本周事项',body:'先确认交付日期。'}},value.revision,async()=>{});
  const grant=await f.resources.share({ownerViewId:a.view.id,consumerInstanceId:b.instance.id,resourceId:r.resourceId});
  assert.equal((await f.resources.call({viewId:b.view.id,resourceId:r.resourceId,action:'read'})).value.notes[0].title,'本周事项');
  await assert.rejects(f.resources.call({viewId:b.view.id,resourceId:r.resourceId,action:'archive',payload:{id:value.notes[0].id,archived:true},expectedRevision:value.revision,expectedConnectionRevision:grant.revision}),/只读/);
  assert.equal((await r.read(b.instance.id)).notes.length,0);
  roleStore=await RoleStore.open(join(f.folder,'roles.json'));taskStore=await TaskStore.open(join(f.folder,'tasks.json'));
  const sessions=new Set();roles=new RoleDirectory(roleStore,f.apps,{validate:async()=>({presetId:'controlled-public-agent'}),create:async row=>{sessions.add(row.sessionId);return row.sessionId},validateExisting:async row=>{assert.ok(sessions.has(row.sessionId))}},f.gate);
  roles.contribute('project-notes',[notesRole({managedAgentId:'operator-chosen-agent',managedSkillId:'operator-chosen-skill',roleWorkspace:process.cwd()})]);await roles.ensure(a.instance.id,'assistant');await roles.ensure(b.instance.id,'assistant');
  let release,prompted;const started=new Promise(resolve=>prompted=resolve);let prompts=0;
  tasks=new TaskDirectory(taskStore,{gate:f.gate,applications:f.apps,roles,resources:f.resources,native:{prompt:async()=>{prompts++;prompted();await new Promise(resolve=>release=resolve);return {accepted:true}},flush:async()=>{},cancel:async()=>{}}});
  const input={roleId:'assistant',text:'整理事项',contexts:[{resourceId:r.resourceId,selection:{ids:[value.notes[0].id],filter:{search:'',includeArchived:false}}}]};
  const revoked=await tasks.prepare({...input,viewId:b.view.id});await f.resources.revoke(grant.id,grant.revision);await assert.rejects(tasks.submit(revoked.id,revoked.revision),/撤销/);assert.equal(prompts,0);
  const stale=await tasks.prepare({...input,viewId:a.view.id});value=await r.mutate(a.instance.id,'update',{id:value.notes[0].id,note:{title:'本周事项',body:'确认交付日期及负责人。'}},value.revision,async()=>{});await assert.rejects(tasks.submit(stale.id,stale.revision),/改变/);assert.equal(prompts,0);
  const fresh=await tasks.prepare({...input,viewId:a.view.id});const submission=tasks.submit(fresh.id,fresh.revision);await started;
  let writeFinished=false;const write=r.mutate(a.instance.id,'archive',{id:value.notes[0].id,archived:true},value.revision,async()=>{}).then(row=>{writeFinished=true;return row});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(writeFinished,false);
  release();assert.equal((await submission).status,'accepted');assert.equal((await write).notes[0].archived,true);assert.equal(prompts,1)
 }finally{await tasks?.close();await roles?.dispose();await taskStore?.close();await roleStore?.close();await f.close()}
})
