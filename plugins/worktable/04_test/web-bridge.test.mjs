import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {CompositionDirectory} from '../01_content/src/framework/compositions.mjs'
import {ResourceDirectory} from '../01_content/src/framework/resources.mjs'
import {AdmissionGate} from '../01_content/src/framework/admission.mjs'
import {WebBridgeDirectory} from '../01_content/src/framework/web-bridge.mjs'
async function setup(read=()=>({revision:'1',records:[{id:'one',title:'Explicit synthetic record'}]})){
 const dir=await mkdtemp(join(tmpdir(),'wt-web-bridge-')),gate=new AdmissionGate(),applications=new ApplicationDirectory(join(dir,'apps.json'),{gate}),compositions=new CompositionDirectory(applications,{validateDependencies:async()=>{}}),resources=new ResourceDirectory(join(dir,'resources.json'),applications,gate)
 await applications.contribute({id:'source',title:'Source',version:'1',kind:'deep',protocolVersion:1,views:[{id:'page',title:'Page'}]});const owner=await applications.createInstance('source',null),sourceView=await applications.createView(owner.id)
 resources.register({appId:'source',resourceId:'notes',actions:[],read,taskContext:value=>({title:'Synthetic selected records',text:JSON.stringify(value.records)}),withTaskLease:run=>run()})
 const recipe={title:'Web host',version:'1.0.0',layout:'grid',pages:[{id:'home',title:'Home',modules:[{id:'site',type:'website',connectionId:'notes-ref',config:{url:'https://example.org/app'}}]}],connections:[{id:'notes-ref',viewId:sourceView.id,resourceId:'notes'}]}
 await compositions.save({appId:'web-host',expectedRevision:0,recipe});await compositions.activate({appId:'web-host',expectedRevision:1});const instance=await applications.createInstance('web-host',null),view=await applications.createView(instance.id)
 const bridge=new WebBridgeDirectory({applications,compositions,resources,gate,roles:null,tasks:null})
 return {dir,gate,applications,compositions,resources,bridge,view,instance,sourceView,recipe,close:async()=>{await bridge.close();await resources.close();await applications.close();await rm(dir,{recursive:true,force:true})}}
}
test('website module needs explicit consumer resource grant and explicit bridge opt-in',async()=>{
 const s=await setup();try{
 await assert.rejects(s.bridge.open({viewId:s.view.id,moduleId:'site',allowRead:true,allowPrepare:false,hostOrigin:'https://dsh.test'}),{code:'owner-unavailable'})
 await s.resources.share({ownerViewId:s.sourceView.id,consumerInstanceId:s.instance.id,resourceId:'notes'})
 const cap=await s.bridge.open({viewId:s.view.id,moduleId:'site',allowRead:true,allowPrepare:false,hostOrigin:'https://dsh.test'})
 const reply=await s.bridge.request({capabilityId:cap.id,revision:cap.revision,epoch:cap.epoch,requestId:'read-1',method:'read-resource',params:{}})
 assert.deepEqual(reply,{revision:'1',records:[{id:'one',title:'Explicit synthetic record'}]})
 await s.bridge.revoke(cap.id,cap.revision)
 await assert.rejects(s.bridge.request({capabilityId:cap.id,revision:cap.revision,epoch:cap.epoch,requestId:'read-2',method:'read-resource',params:{}}),{code:'bridge-revoked'})
 }finally{await s.close()}
})
test('missing epoch and spoofed task fields never enter a bridge request',async()=>{
 const s=await setup();try{await s.resources.share({ownerViewId:s.sourceView.id,consumerInstanceId:s.instance.id,resourceId:'notes'});const cap=await s.bridge.open({viewId:s.view.id,moduleId:'site',allowRead:true,allowPrepare:false,hostOrigin:'https://dsh.test'});
 await assert.rejects(s.bridge.request({capabilityId:cap.id,revision:1,requestId:'missing-epoch',method:'read-resource',params:{}}),{code:'bridge-input'})
 }finally{await s.close()}
})
test('revoking bridge while the resource owner is reading rejects its late result and never changes the grant',async()=>{
 let entered,release;const started=new Promise(resolve=>entered=resolve),s=await setup(async()=>{entered();return new Promise(resolve=>release=resolve)})
 try{const grant=await s.resources.share({ownerViewId:s.sourceView.id,consumerInstanceId:s.instance.id,resourceId:'notes'}),cap=await s.bridge.open({viewId:s.view.id,moduleId:'site',allowRead:true,allowPrepare:false,hostOrigin:'https://dsh.test'});const pending=s.bridge.request({capabilityId:cap.id,revision:1,epoch:cap.epoch,requestId:'late-read',method:'read-resource',params:{}});const rejected=assert.rejects(pending,{code:'bridge-revoked'});await started;await s.bridge.revoke(cap.id,1);release({records:[{id:'late',title:'Must not cross the revoked channel'}]});await rejected;assert.equal((await s.resources.snapshot()).connections.find(row=>row.id===grant.id).status,'active')
 }finally{release?.({});await s.close()}
})
test('new running module version and disable/re-enable invalidate the old website capability',async()=>{
 const s=await setup();try{await s.resources.share({ownerViewId:s.sourceView.id,consumerInstanceId:s.instance.id,resourceId:'notes'});const input={viewId:s.view.id,moduleId:'site',allowRead:true,allowPrepare:false,hostOrigin:'https://dsh.test'},cap=await s.bridge.open(input),request={capabilityId:cap.id,revision:1,epoch:cap.epoch,requestId:'new-module',method:'read-resource',params:{}};
 await s.applications.setEnabled('web-host',false,0);await s.applications.setEnabled('web-host',true,1);await assert.rejects(s.bridge.request(request),{code:'bridge-changed'});
 const next=await s.bridge.open(input);await s.compositions.save({appId:'web-host',expectedRevision:2,recipe:{...s.recipe,version:'1.1.0'}});await s.compositions.activate({appId:'web-host',expectedRevision:3});await assert.rejects(s.bridge.request({...request,capabilityId:next.id,epoch:next.epoch}),{code:'bridge-changed'})
 }finally{await s.close()}
})
test('duplicate requests, arbitrary native destinations, methods and closed owners never read',async()=>{
 const s=await setup();try{await s.resources.share({ownerViewId:s.sourceView.id,consumerInstanceId:s.instance.id,resourceId:'notes'});const cap=await s.bridge.open({viewId:s.view.id,moduleId:'site',allowRead:true,allowPrepare:false,hostOrigin:'https://dsh.test'}),request={capabilityId:cap.id,revision:1,epoch:cap.epoch,requestId:'once',method:'read-resource',params:{}};await s.bridge.request(request);await assert.rejects(s.bridge.request(request),{code:'bridge-request'});await assert.rejects(s.bridge.request({...request,requestId:'native',method:'submit'}),{code:'bridge-method'});await assert.rejects(s.bridge.request({...request,requestId:'spoof',params:{sessionId:'native-secret'}}),{code:'bridge-input'});await s.bridge.close();await assert.rejects(s.bridge.request({...request,requestId:'closed'}),{code:'bridge-revoked'})
 }finally{await s.close()}
})
import {Readable} from 'node:stream'
import {mountWebBridge} from '../01_content/src/framework/web-bridge-host.mjs'
test('authenticated bridge HTTP owns the host origin and rejects caller-selected native destination or origin',async()=>{
 const s=await setup(),routes=[],effects=[];let allowed=false
 const ctx={worktableApplications:s.applications,worktableCompositions:s.compositions,worktableResources:s.resources,worktableRoles:null,worktableTasks:null,worktableAdmission:s.gate,connection:{admit:()=>allowed?{peer:{}}:{rejection:401}},provide(){},inject(_keys,fn){fn(this)},effect(fn){effects.push(fn)},webServer:{register(route){routes.push(route);return()=>{}}}}
 mountWebBridge(ctx);for(const effect of effects)effect();const route=routes.find(route=>route.path==='/api/worktable/bridge')
 async function call(body){const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method='POST';req.headers={'content-type':'application/json',host:'dsh.test'};req.socket={encrypted:true};let status,response;await route.handler(req,{writeHead(value){status=value},end(text){response=JSON.parse(text)}});return {status,response}}
 try{assert.equal((await call({action:'open'})).status,401);allowed=true;await s.resources.share({ownerViewId:s.sourceView.id,consumerInstanceId:s.instance.id,resourceId:'notes'});const input={action:'open',viewId:s.view.id,moduleId:'site',allowRead:true,allowPrepare:false};assert.equal((await call({...input,hostOrigin:'https://other.test'})).status,400);assert.equal((await call({...input,roleId:'other'})).status,400);const opened=await call(input);assert.equal(opened.status,200);assert.equal(opened.response.hostOrigin,'https://dsh.test');assert.equal((await call({action:'submit'})).status,403)
 }finally{await s.close()}
})
test('a request must have its own explicit request identifier',async()=>{const s=await setup();try{await s.resources.share({ownerViewId:s.sourceView.id,consumerInstanceId:s.instance.id,resourceId:'notes'});const cap=await s.bridge.open({viewId:s.view.id,moduleId:'site',allowRead:true,allowPrepare:false,hostOrigin:'https://dsh.test'});await assert.rejects(s.bridge.request({capabilityId:cap.id,revision:1,epoch:cap.epoch,method:'read-resource',params:{}}),{code:'bridge-input'})}finally{await s.close()}})
test('different ports on the DSH cookie hostname cannot opt in to bridge authority',async()=>{const s=await setup();try{await s.resources.share({ownerViewId:s.sourceView.id,consumerInstanceId:s.instance.id,resourceId:'notes'});await assert.rejects(s.bridge.open({viewId:s.view.id,moduleId:'site',allowRead:true,allowPrepare:false,hostOrigin:'https://example.org:3091'}),{code:'bridge-origin'})}finally{await s.close()}})
import {RoleDirectory,RoleStore} from '../01_content/src/framework/roles.mjs'
import {TaskDirectory,TaskStore} from '../01_content/src/framework/tasks.mjs'
async function withTasks(s){
 const grant=await s.resources.share({ownerViewId:s.sourceView.id,consumerInstanceId:s.instance.id,resourceId:'notes'})
 const recipe=structuredClone(s.recipe);recipe.version='1.1.0';recipe.pages[0].modules[0].roleId='assistant';recipe.roles=[{id:'assistant',title:'Assistant',agent:{kind:'agent',source:'managed',id:'synthetic'},creation:{cwd:s.dir}}];await s.compositions.save({appId:'web-host',expectedRevision:2,recipe});await s.compositions.activate({appId:'web-host',expectedRevision:3})
 const roles=new RoleDirectory(await RoleStore.open(join(s.dir,'roles.json')),s.applications,{validate:async()=>({presetId:'synthetic'}),create:async row=>row.sessionId,validateExisting:async()=>{}},s.gate);const binding=await roles.ensure(s.instance.id,'assistant');let prompts=0
 const tasks=new TaskDirectory(await TaskStore.open(join(s.dir,'tasks.json')),{applications:s.applications,roles,resources:s.resources,gate:s.gate,native:{prompt:async()=>{prompts++;throw Error('Bridge must never submit')},cancel:async()=>{throw Error('Bridge must never Stop')}}}),bridge=new WebBridgeDirectory({applications:s.applications,compositions:s.compositions,resources:s.resources,roles,tasks,gate:s.gate})
 return {bridge,roles,tasks,binding,grant,prompts:()=>prompts,close:async()=>{await bridge.close();await tasks.close();await roles.dispose()}}
}
test('website can only prepare a durable untrusted request for the Host-selected role, never submit or expose native session',async()=>{
 const s=await setup();let t;try{t=await withTasks(s);const cap=await t.bridge.open({viewId:s.view.id,moduleId:'site',allowRead:false,allowPrepare:true,hostOrigin:'https://dsh.test'}),reply=await t.bridge.request({capabilityId:cap.id,revision:1,epoch:cap.epoch,requestId:'prepare-one',method:'prepare-task',params:{text:'Summarize this request'}});assert.deepEqual(cap.methods,['prepare-task']);assert.equal(reply.status,'prepared');assert.equal(reply.sessionId,undefined);const rows=await t.tasks.list(s.view.id);assert.equal(rows.length,1);assert.equal(rows[0].contexts[0].reference.resourceId,'notes');assert.equal(rows[0].sessionId,t.binding.sessionId);assert.equal(rows[0].source.web.origin,'https://example.org');assert.equal(rows[0].source.web.moduleId,'site');assert.match(rows[0].text,/网页请求（不可信输入/);assert.equal(rows[0].requestId,undefined);await t.bridge.revoke(cap.id,1);assert.equal((await t.tasks.list(s.view.id))[0].status,'prepared');assert.equal(t.prompts(),0)
 }finally{await t?.close();await s.close()}
})
test('revocation admitted between request claim and preparation prevents creation, not only delivery',async()=>{
 const s=await setup();let t;try{t=await withTasks(s);const cap=await t.bridge.open({viewId:s.view.id,moduleId:'site',allowRead:false,allowPrepare:true,hostOrigin:'https://dsh.test'}),pending=t.bridge.request({capabilityId:cap.id,revision:1,epoch:cap.epoch,requestId:'revoked-before-commit',method:'prepare-task',params:{text:'Must not create a draft'}}),rejected=assert.rejects(pending,{code:'bridge-revoked'});await s.gate.run(()=>t.bridge.revoke(cap.id,1));await rejected;assert.deepEqual(await t.tasks.list(s.view.id),[]);assert.equal(t.prompts(),0)
 }finally{await t?.close();await s.close()}
})
test('unloading the bridge owner revokes an HTTP resource response before waiting for its read to finish',async()=>{
 let entered,release;const started=new Promise(resolve=>entered=resolve),s=await setup(async()=>{entered();return new Promise(resolve=>release=resolve)}),routes=[],effects=[];let bridge
 const ctx={worktableApplications:s.applications,worktableCompositions:s.compositions,worktableResources:s.resources,worktableRoles:null,worktableTasks:null,worktableAdmission:s.gate,connection:{admit:()=>({peer:{}})},provide(name,value){if(name==='worktableWebBridge')bridge=value},inject(_keys,fn){fn(this)},effect(fn){effects.push(fn)},webServer:{register(route){routes.push(route);return()=>{}}}}
 mountWebBridge(ctx);const disposers=effects.map(effect=>effect());try{await s.resources.share({ownerViewId:s.sourceView.id,consumerInstanceId:s.instance.id,resourceId:'notes'});const cap=await bridge.open({viewId:s.view.id,moduleId:'site',allowRead:true,allowPrepare:false,hostOrigin:'https://dsh.test'}),body={action:'request',capabilityId:cap.id,revision:1,epoch:cap.epoch,requestId:'unload-read',method:'read-resource',params:{}},req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method='POST';req.headers={'content-type':'application/json',host:'dsh.test'};req.socket={encrypted:true};let status,result;const pending=routes.find(route=>route.path==='/api/worktable/bridge').handler(req,{writeHead(value){status=value},end(text){result=JSON.parse(text)}});await started;const closing=disposers[0]();release({records:[{id:'late',title:'Must not escape an unloaded owner'}]});await pending;await closing;assert.equal(status,403);assert.equal(result.code,'bridge-revoked')
 }finally{release?.({});await bridge?.close();await s.close()}
})
test('prepared website task retains the Host-selected resource reference so later grant revocation blocks native submission',async()=>{
 const s=await setup();let t;try{t=await withTasks(s);const grant=t.grant,cap=await t.bridge.open({viewId:s.view.id,moduleId:'site',allowRead:true,allowPrepare:true,hostOrigin:'https://dsh.test'}),reply=await t.bridge.request({capabilityId:cap.id,revision:1,epoch:cap.epoch,requestId:'prepare-shared',method:'prepare-task',params:{text:'Summarize the selected source'}});await s.resources.revoke(grant.id,grant.revision);await assert.rejects(t.tasks.submit(reply.taskId,reply.revision),{code:'revoked'});assert.equal(t.prompts(),0)
 }finally{await t?.close();await s.close()}
})
test('resource return limit counts UTF-8 bytes rather than letting multibyte text bypass the bound',async()=>{
 const s=await setup(()=>({revision:'1',text:'中'.repeat(30000)}));try{await s.resources.share({ownerViewId:s.sourceView.id,consumerInstanceId:s.instance.id,resourceId:'notes'});const cap=await s.bridge.open({viewId:s.view.id,moduleId:'site',allowRead:true,allowPrepare:false,hostOrigin:'https://dsh.test'});await assert.rejects(s.bridge.request({capabilityId:cap.id,revision:1,epoch:cap.epoch,requestId:'bounded-utf8',method:'read-resource',params:{}}),{code:'bridge-result-size'})}finally{await s.close()}
})
