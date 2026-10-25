import assert from 'node:assert/strict'
import {test} from 'node:test'
import {Readable} from 'node:stream'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fixture} from './generation-fixture.mjs'
import {mountGenerations} from '../01_content/src/framework/generation-host.mjs'
test('authenticated generation API refuses arbitrary root/session and cross-instance result ownership',async()=>{
 const f=await fixture();const routes=[],iterators=[],disposers=[];let admitted=false,service;
 try{await f.generations.close();const ctx={profileContext:{dir:f.dir},worktableApplications:f.apps,worktableCompositions:f.compositions,worktableTasks:f.tasks,worktableRoles:f.roles,worktableAdmission:f.apps.gate,connection:{admit:()=>admitted?{}:{rejection:401}},sessionController:{inspect:async()=>({events:[]})},sessionPersistence:{flush:async()=>{}},inject(_names,callback){callback(this)},provide(name,value){if(name==='worktableGenerations')service=value},effect(factory){const result=factory();if(result?.next)iterators.push(result);else if(typeof result==='function')disposers.push(result)},webServer:{register(route){routes.push(route);return()=>{}}}};mountGenerations(ctx);const owner=await iterators[0].next(),route=routes.find(row=>row.path==='/api/worktable/generations');
  const call=async body=>{const req=Readable.from([JSON.stringify(body)]);req.method='POST';req.headers={'content-type':'application/json'};const res={writeHead(status){this.status=status},end(value){this.value=JSON.parse(value)}};await route.handler(req,res);return res};
  assert.equal((await call({action:'list',viewId:f.view.id})).status,401);admitted=true;assert.equal((await call({action:'prepare',viewId:f.view.id,pageId:'home',moduleId:'output',description:'Synthetic',rootConfirmed:true,root:'C:/arbitrary'})).status,400);const described=await call({action:'describe',viewId:f.view.id,pageId:'home',moduleId:'output'});const prepared=await call({confirmationToken:described.value.confirmationToken,action:'prepare',viewId:f.view.id,pageId:'home',moduleId:'output',description:'Synthetic',rootConfirmed:true});assert.equal(prepared.status,200);assert.equal(f.prompts,0);const instance=await f.apps.createInstance('synthetic','project-B'),view=await f.apps.createView(instance.id);const denied=await call({action:'preview',viewId:view.id,id:prepared.value.id});assert.equal(denied.status,403);assert.equal(denied.value.code,'generation-owner');assert.equal((await call({action:'recover',viewId:view.id,id:prepared.value.id,confirmed:true})).status,403);await owner.value();await iterators[0].return();assert.equal((await call({action:'recover',viewId:f.view.id,id:prepared.value.id,confirmed:true})).status,503);service=null;
 }finally{await service?.close();for(const dispose of disposers.reverse())dispose();await f.close()}
})

test('completed rc.3 native output can be previewed through the authenticated API using read-only persistence',async()=>{
 const f=await fixture(),routes=[],iterators=[],disposers=[];let service,closed=0,readFailure=false;
 try{
  await f.generations.close();
  const ctx={profileContext:{dir:f.dir},worktableApplications:f.apps,worktableCompositions:f.compositions,worktableTasks:f.tasks,worktableRoles:f.roles,worktableAdmission:f.apps.gate,connection:{admit:()=>({})},sessionController:{},sessionPersistence:{flush:async()=>{},open:async(id,access)=>{assert.equal(access,'read');return {read:()=>{if(readFailure)throw Error('Synthetic unavailable history');return f.inspectNative(id)},close:async()=>{closed++}}}},inject(_names,callback){callback(this)},provide(name,value){if(name==='worktableGenerations')service=value},effect(factory){const result=factory();if(result?.next)iterators.push(result);else if(typeof result==='function')disposers.push(result)},webServer:{register(route){routes.push(route);return()=>{}}}};
  mountGenerations(ctx);await iterators[0].next();const route=routes.find(row=>row.path==='/api/worktable/generations');
  const call=async body=>{const req=Readable.from([JSON.stringify(body)]);req.method='POST';req.headers={'content-type':'application/json'};const res={writeHead(status){this.status=status},end(value){this.value=JSON.parse(value)}};await route.handler(req,res);return res};
  const input={viewId:f.view.id,pageId:'home',moduleId:'output'},described=await call({...input,action:'describe'}),prepared=await call({...input,action:'prepare',description:'Synthetic card',rootConfirmed:true,confirmationToken:described.value.confirmationToken});assert.equal(prepared.status,200);
  const row=prepared.value,task=await f.tasks.find(row.taskId),sent=await f.tasks.submit(task.id,task.revision);f.complete(sent);
  const html='<p>Completed rc.3 output</p>',artifactPath=join(row.outputDir,'page.html');await writeFile(artifactPath,html);await writeFile(row.manifestPath,JSON.stringify({schema:2,generationId:row.id,taskId:task.id,sessionId:task.sessionId,artifactPath}));
  const preview=await call({action:'preview',viewId:f.view.id,id:row.id});assert.equal(preview.status,200,JSON.stringify(preview.value));assert.equal(preview.value.html,html);assert.ok(closed>0,'read-only native history handles are released');
  const beforeFailure=closed;readFailure=true;assert.equal((await call({action:'preview',viewId:f.view.id,id:row.id})).status,500);assert.equal(closed,beforeFailure+1,'failed reads release the read-only handle too');readFailure=false;
  f.complete(sent,'aborted');const stopped=await call({action:'preview',viewId:f.view.id,id:row.id});assert.equal(stopped.status,409);assert.equal(stopped.value.code,'generation-native-stopped');assert.equal((await service.find(row.id)).status,'revoked');
 }finally{await service?.close();for(const iterator of iterators)await iterator.return();for(const dispose of disposers.reverse())dispose();await f.close()}
})
