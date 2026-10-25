import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {PassThrough,Readable} from 'node:stream'
import {mountApplications} from '../01_content/src/framework/host.mjs'
import {RoleStore} from '../01_content/src/framework/roles.mjs'
import {mountRoles} from '../01_content/src/framework/role-host.mjs'

test('a request body captured by a retiring application generation aborts and never enters the replacement owner',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-generation-')),effects=[],routes=[];let activate;
 const ctx={connection:{admit:()=>({peer:{}})},profileContext:{dir},inject:(keys,install)=>{if(keys.length===2)activate=install},provide(){},effect:(factory,label)=>effects.push({factory,label}),webServer:{register:route=>{routes.push(route);return()=>{}}}};
 const response=()=>({writeHead(status){this.status=status},end(text){this.body=JSON.parse(text)}});
 try{mountApplications(ctx);activate(ctx);const route=routes.find(row=>row.path==='/api/worktable/applications');const get={method:'GET',headers:{}},baseline=response();await route.handler(get,baseline);assert.equal(baseline.status,200);
 const request=new PassThrough();request.method='POST';request.headers={'content-type':'application/json',host:'localhost'};request.write('{"action":"register",');const old=response(),pending=route.handler(request,old);await new Promise(resolve=>setImmediate(resolve));const retire=effects.find(row=>row.label==='worktable: release application service').factory();await retire();await pending;assert.equal(old.status,503);assert.equal(old.body.code,'generation-changed');
 activate(ctx);const after=response();await route.handler(get,after);assert.equal(after.status,200);assert.equal(after.body.applications.length,0);const last=effects.filter(row=>row.label==='worktable: release application service').at(-1).factory();await last();
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('one native capability disposer failure still releases every registration and the role-file owner',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-dispose-failure-')),effects=[],removed=[];let iterator,result;
 const file=join(dir,'worktable-platform','roles.v1.json'),seed=await RoleStore.open(file);await seed.change(data=>{data.capabilities=['one','two'].map(id=>({kind:'skill',id,title:id,description:'',content:'Keep this Skill',enabled:true,userInvocable:true,modelInvocable:true,provider:'worktable-managed',source:'managed',revision:1,skillIds:[]}));return null});await seed.close();
 const ctx={profileContext:{dir},connection:{admit:()=>({})},worktableApplications:{snapshot:async()=>({applications:[],instances:[]})},sessionController:{},sessionPersistence:{},workspaceRegistry:{list:()=>[]},agentPresets:{},skills:{register:row=>()=>{removed.push(row.name);if(row.name==='one')throw Error('one remover failed')}},provide(){},on:()=>()=>{},inject:(keys,install)=>install(ctx),effect:(factory,label)=>effects.push({factory,label}),webServer:{register:()=>()=>{}}};
 try{mountRoles(ctx);iterator=effects.find(row=>row.label==='worktable role and capability owner').factory();result=await iterator.next();await assert.rejects(result.value(),/部分清理失败/);assert.deepEqual(removed.sort(),['one','two']);const reopened=await RoleStore.open(file);assert.equal((await reopened.snapshot()).capabilities.length,2);await reopened.close()}
 finally{await iterator?.return();await rm(dir,{recursive:true,force:true})}
})

test('failed role activation preserves both activation and disposal diagnostics and still frees its file owner',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-startup-cleanup-')),effects=[];const file=join(dir,'worktable-platform','roles.v1.json'),seed=await RoleStore.open(file);await seed.change(data=>{data.capabilities=[{kind:'skill',id:'one',title:'one',description:'',content:'Keep this Skill',enabled:true,userInvocable:true,modelInvocable:true,provider:'worktable-managed',source:'managed',revision:1,skillIds:[]}];return null});await seed.close();
 const ctx={profileContext:{dir},connection:{admit:()=>({})},worktableApplications:{snapshot:async()=>({applications:[],instances:[]})},sessionController:{},sessionPersistence:{},workspaceRegistry:{list:()=>[]},agentPresets:{},skills:{register:()=>()=>{throw Error('remover failed')}},provide(){throw Error('activation failed')},on:()=>()=>{},inject:(keys,install)=>install(ctx),effect:(factory,label)=>effects.push({factory,label}),webServer:{register:()=>()=>{}}};
 try{mountRoles(ctx);const iterator=effects.find(row=>row.label==='worktable role and capability owner').factory();await assert.rejects(iterator.next(),error=>error instanceof AggregateError&&error.errors.some(e=>e.message==='activation failed')&&error.errors.some(e=>e instanceof AggregateError));const reopened=await RoleStore.open(file);await reopened.close()}finally{await rm(dir,{recursive:true,force:true})}
})

import {mountTasks} from '../01_content/src/framework/task-host.mjs'
test('a rejected task-service publication releases its already acquired file owner',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-task-startup-')),effects=[];const ctx={profileContext:{dir},connection:{admit:()=>({})},worktableApplications:{},worktableRoles:{},worktableResources:{},sessionController:{},sessionPersistence:{},provide(){throw Error('task publication failed')},on:()=>()=>{},inject:(keys,install)=>install(ctx),effect:(factory,label)=>effects.push({factory,label}),webServer:{register:()=>()=>{}}};
 try{mountTasks(ctx);const iterator=effects.find(row=>row.label==='worktable durable task owner').factory();await assert.rejects(iterator.next(),/task publication failed/);const reopened=await RoleStore.open(join(dir,'worktable-platform','tasks.v1.json'));await reopened.close()}finally{await rm(dir,{recursive:true,force:true})}
})
