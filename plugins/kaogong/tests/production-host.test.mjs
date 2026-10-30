import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {Readable} from 'node:stream'
import {fixture as legacyFixture} from './legacy-adoption-fixture.mjs'
import {pathToFileURL} from 'node:url'
import {mountKaogong} from '../src/production-host.ts'
import {createAdoptionOwner} from '../src/legacy-adoption-owner.ts'
import {mountHistoricalFixture} from './historical-host-fixture.mjs'
import {KaogongInstancePool} from '../src/instance-state.ts'
import {ApplicationDirectory} from '../../worktable/01_content/src/framework/applications.mjs'
import {describeProtocol} from '../../worktable/01_content/src/sdk.mjs'
import {RoleDirectory,RoleStore} from '../../worktable/01_content/src/framework/roles.mjs'
import {TaskDirectory,TaskStore} from '../../worktable/01_content/src/framework/tasks.mjs'
import {ResourceDirectory} from '../../worktable/01_content/src/framework/resources.mjs'
const native=process.env.KAOGONG_TEST_RUNTIME;assert.ok(native)
const require=createRequire(resolve(native,'packages/client/ui-renderer/package.json'))
const {Context}=require('@deepseek-ai/cordis')
const load=file=>import(pathToFileURL(resolve(native,file)).href)
const {default:Storage}=await load('packages/storage/storage/lib/index.js')
const {JsonStorageBackend}=await load('packages/storage/storage-json/lib/index.js')
const {DomainFacility}=await load('packages/storage/storage-domain/lib/index.js')
const response=()=>({status:0,value:null,writeHead(code){this.status=code},end(value){this.value=JSON.parse(value)}})
test('actual Host rejects an older descriptor without planned target inspection before registration or writes, regardless of JavaScript argument acceptance',async()=>{
 const calls=[],descriptor=describeProtocol(),ctx={
  worktableProtocol:{describe:()=>({...descriptor,features:descriptor.features.filter(feature=>feature!=='legacy-role-target-inspection-v1')})},
  worktableRoles:{inspectLegacySource:async(_app,_role,_source,_target)=>{calls.push('inspect');return {status:'ready'}}},
  worktableApplications:{contribute:async()=>{calls.push('application registration');throw Error('registration must not start')}},
  storageDomain:{open:async()=>{calls.push('storage open');throw Error('storage must not open')}},
 }
 assert.throws(()=>createAdoptionOwner(ctx,null,null,null,{}),/legacy-role-target-inspection-v1/)
 assert.deepEqual(calls,[])
})

test('actual production Host installs empty views, routes tools by native Session and enforces explicit library grant/revoke and pinned adoption recovery',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kaogong-production-')),nativeContext=new Context();await nativeContext.plugin(Storage);const backend=new JsonStorageBackend(join(root,'data'));nativeContext.storage.backend.register('json',backend);const facility=new DomainFacility(nativeContext,{backend:'json'});const apps=new ApplicationDirectory(join(root,'apps.json')),resources=new ResourceDirectory(join(root,'resources.json'),apps,apps.gate);const routes=new Map(),tools=new Map(),owners=new Map();let stop,otherPool,publicRoles,publicTasks;let nativeCreates=0,nativePrompts=0;
 const legacyHome=await legacyFixture();let failImport=false,importPuts=0
 const wrappedFacility={open:async spec=>{const domain=await facility.open(spec);return new Proxy(domain,{get(target,key){if(key==='table')return name=>{const table=target.table(name);return new Proxy(table,{get(table,key){if(key==='put')return async(id,value)=>{if(spec.name.endsWith('_knowledge')&&id==='private'&&value.title==='unknown source')importPuts++;await table.put(id,value);if(failImport&&spec.name.endsWith('_knowledge')&&id==='private'){failImport=false;throw Error('lost import receipt')}};const value=Reflect.get(table,key,table);return typeof value==='function'?value.bind(table):value}})};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})}}
 const ctx={worktableProtocol:{describe:describeProtocol},storageDomain:wrappedFacility,worktableApplications:apps,worktableResources:resources,worktableRoles:{contribute:()=>()=>{},contributeLegacy:()=>()=>{},read:async()=>({binding:null}),resolveSession:async(app,id,{access})=>{if(id==='history'&&access==='write')throw Error('read-only');if(id!=='native-B')throw Error('unbound');return {instanceId:B.id}}},worktableCapabilities:{contribute:()=>()=>{},contributeSessionScopes:()=>()=>{}},worktableTaskOwners:{contribute:(app,kind,owner)=>{owners.set(kind,owner);return ()=>owners.delete(kind)}},agentPresets:{register:async()=>async()=>{}},connection:{admit:request=>request.auth?{peer:{}}:{rejection:401}},webServer:{register:route=>{routes.set(route.kind+':'+route.path,route);return ()=>routes.delete(route.kind+':'+route.path)}},tools:{register:(tool,options)=>{tools.set(tool.name,{tool,options});return ()=>tools.delete(tool.name)}}};let B;
 try{
  const configuration={legacySourceHome:legacyHome,questionImageRoot:{get:()=>undefined},mineru:{get:()=>undefined}};stop=await mountHistoricalFixture(ctx,configuration);const library=await apps.createInstance('kaogong-library',null),A=await apps.createInstance('kaogong',null);B=await apps.createInstance('kaogong',null);const lv=await apps.createView(library.id),av=await apps.createView(A.id),bv=await apps.createView(B.id);assert.equal(owners.size,2)
  const get=async(view,path='/api/kaogong/knowledge',auth=true)=>{const res=response();await routes.get('exact:'+path).handler({url:path+'?viewId='+view,method:'GET',auth},res);return res}
  assert.deepEqual((await get(av.id)).value.entries,[]);assert.equal((await get(av.id,undefined,false)).status,403)
  assert.equal(await tools.get('kaogong_knowledge_add').options.when({agent:{session:{id:'outside'}}}),false)
  const tool=tools.get('kaogong_knowledge_add').tool;await tool.execute({id:'private',subject:'申论',title:'private note',content:'private',kind:'笔记'},{agent:{session:{id:'native-B'}}});assert.equal((await get(bv.id)).value.entries.length,1);assert.equal((await get(av.id)).value.entries.length,0)
  otherPool=new KaogongInstancePool(facility);const lease=await otherPool.acquire(library.id);const base={subject:'申论',knowledgePoint:'',content:'source',source:'synthetic',tags:[],createdAt:'2020-01-01',updatedAt:'2020-01-01'};await lease.state.knowledgeEntries.put('raw',{...base,title:'raw',kind:'讲义'});await lease.state.knowledgeEntries.put('hidden',{...base,title:'hidden',kind:'笔记'});await lease.state.bankQuestions.put('library-question',{subject:'申论',knowledgePoint:'synthetic',questionType:'单选',stem:'original source',options:['A','B'],correctAnswer:'A',explanation:'synthetic',difficulty:'easy',source:'synthetic',origin:'local',reviewStatus:'approved',reviewNotes:'',tags:[],createdAt:'2020-01-01',reviewedAt:''});await lease.release();
  await resources.share({ownerViewId:lv.id,consumerInstanceId:B.id,resourceId:'question-bank'})
  await assert.rejects(tools.get('kaogong_bank_add').tool.execute({id:'library-question',subject:'申论',knowledgePoint:'synthetic',stem:'do not shadow source',correctAnswer:'B'},{agent:{session:{id:'native-B'}}}),/read-only/)
  assert.deepEqual((await get(lv.id)).value.entries.map(row=>row.id),['raw']);const grant=await resources.share({ownerViewId:lv.id,consumerInstanceId:B.id,resourceId:'materials'});assert.deepEqual((await get(bv.id)).value.entries.map(row=>row.id).sort(),['private','raw']);await assert.rejects(tools.get('kaogong_knowledge_add').tool.execute({id:'raw',subject:'申论',title:'do not shadow source',content:'not allowed'},{agent:{session:{id:'native-B'}}}),/read-only/);await resources.revoke(grant.id,grant.revision);assert.equal((await get(bv.id)).status,403);assert.deepEqual((await get(av.id)).value.entries,[])
  assert.equal((await tools.get('kaogong_bank_list').tool.execute({},{agent:{session:{id:'native-B'}}})).total,1,'revoked materials must not block the separately authorized bank')
  assert.equal((await tools.get('kaogong_knowledge_add').tool.execute({id:'private',subject:'申论',title:'own private edit',content:'own private content'},{agent:{session:{id:'native-B'}}})).created,false,'known own note editing has no shared-source dependency')
  assert.equal((await tools.get('kaogong_knowledge_add').tool.execute({subject:'申论',title:'new own note',content:'generated private ID'},{agent:{session:{id:'native-B'}}})).created,true,'generated private note has no shared-source dependency')
  const study=await otherPool.acquire(B.id)
  await study.state.bankQuestions.put('question',{subject:'行测-资料分析',knowledgePoint:'增长率',questionType:'单选',stem:'synthetic',options:['A.10','B.20'],correctAnswer:'A',explanation:'synthetic',difficulty:'easy',source:'synthetic',origin:'local',reviewStatus:'approved',reviewNotes:'',tags:[],createdAt:'2020-01-01',reviewedAt:''})
  const round=await study.state.practice.start({subject:'行测-资料分析',title:'synthetic',limit:10});await study.state.practice.submit(round.roundId,[{id:'question',answer:'A'}]);await study.release();const reviewState=async()=>{const lease=await otherPool.acquire(B.id);try{return lease.state.rounds.get(round.roundId).review}finally{await lease.release()}}
  const owner=owners.get('review'),context={appId:'kaogong',instanceId:B.id,viewId:bv.id,roleId:'counselor'},plan=await owner.prepare(context,{roundId:round.roundId})
  assert.equal(await reviewState(),'ready','preview must not claim a review')
  const task={id:'owned-task',appId:'kaogong',instanceId:B.id,viewId:bv.id,roleId:'counselor',sessionId:'native-B',requestId:'native-request',status:'submitting',preparation:{kind:'review',id:plan.id,ownerAppId:'kaogong',ownerVersion:'1',token:plan.token}}
  await owner.beforeSubmit(task);assert.equal(await reviewState(),'sending','unknown admission stays sending until known acceptance')
  const failed={...task,status:'failed',ownerRejection:'pending'}
  await assert.rejects(owner.notAdmitted({...failed,requestId:'foreign-request'}),/identity changed/)
  await owner.notAdmitted(failed);assert.equal(await reviewState(),'ready')
  const freshPlan=await owner.prepare(context,{roundId:round.roundId});const fresh={...task,id:'fresh-task',requestId:'fresh-request',preparation:{...task.preparation,token:freshPlan.token}}
  await owner.beforeSubmit(fresh);await owner.notAdmitted(failed);assert.equal(await reviewState(),'sending','old cleanup cannot release a newer task claim')
  await owner.validate(fresh);await owner.accepted({...fresh,status:'accepted'});assert.equal(await reviewState(),'sent');await owner.accepted({...fresh,status:'accepted'});await assert.rejects(owner.prepare(context,{roundId:round.roundId}),/already sent/)
  await study.release()
  const original=await readFile(join(legacyHome,'storages/kaogong_knowledge.json'))
  const adoption=async body=>{const request=Readable.from([JSON.stringify(body)]);Object.assign(request,{method:'POST',url:'/api/kaogong/adoption',auth:true,headers:{'content-type':'application/json'}});const res=response();await routes.get('exact:/api/kaogong/adoption').handler(request,res);return res}
  const preview=await adoption({action:'prepare',sourceKey:'legacy-default'});assert.equal(preview.status,200);assert.equal(preview.value.status,'ready');assert.equal((await apps.snapshot()).instances.length,3,'preparation cannot provision targets')
  const exported=(await adoption({action:'export',id:preview.value.id})).value
  assert.equal((await adoption({action:'apply',id:preview.value.id,fingerprint:preview.value.fingerprint,confirmed:false})).status,409)
  failImport=true;const attempt=await adoption({action:'apply',id:preview.value.id,fingerprint:preview.value.fingerprint,confirmed:true});assert.equal(attempt.status,409);assert.equal((await adoption({action:'inspect',id:preview.value.id})).value.status,'unknown');assert.equal((await get(exported.targets.history.viewId)).status,403,'partial targets remain fenced')
  publicRoles=new RoleDirectory(await RoleStore.open(join(root,'roles.json')),apps,{validate:async()=>({presetId:'teacher'}),create:async row=>{nativeCreates++;return row.sessionId}})
  publicRoles.contribute('kaogong',[{id:'teacher',title:'Teacher',agent:{kind:'agent',source:'managed',id:'teacher'},creation:{cwd:root}}])
  publicTasks=new TaskDirectory(await TaskStore.open(join(root,'tasks.json')),{applications:apps,roles:publicRoles,resources,native:{prompt:async()=>{nativePrompts++;return {accepted:true}}}})
  await assert.rejects(()=>publicRoles.ensure(exported.targets.history.instanceId,'teacher'),{code:'instance-not-ready'})
  await assert.rejects(()=>publicTasks.prepare({viewId:exported.targets.history.viewId,roleId:'teacher',text:'generic attempt',operationId:exported.id}),{code:'instance-not-ready'})
  assert.equal(nativeCreates,0);assert.equal(nativePrompts,0)
  await writeFile(join(legacyHome,'storages/kaogong_knowledge.json'),Buffer.concat([original,Buffer.from(' ')]))
  const changed=await adoption({action:'apply',id:preview.value.id,fingerprint:preview.value.fingerprint,confirmed:true});assert.equal(changed.status,409);assert.equal(changed.value.code,'LEGACY_SOURCE_CHANGED');assert.equal((await get(exported.targets.history.viewId)).status,403)
  await writeFile(join(legacyHome,'storages/kaogong_knowledge.json'),original)
  await stop();stop=await mountHistoricalFixture(ctx,configuration)
  const completed=await adoption({action:'apply',id:preview.value.id,fingerprint:preview.value.fingerprint,confirmed:true});assert.equal(completed.value.status,'applied');assert.equal(importPuts,1,'lost put receipt must not issue another native domain put');assert.equal((await apps.snapshot()).instances.length,5)
  assert.deepEqual((await get(exported.targets.history.viewId)).value.entries.map(row=>row.id),['private']);assert.deepEqual((await get(exported.targets.library.viewId)).value.entries,[])
  assert.deepEqual((await resources.call({viewId:exported.targets.history.viewId,resourceId:'materials',action:'read'})).value.rows,[],'unproven lectures cannot enter a shareable resource')
  assert.equal((await resources.call({viewId:exported.targets.history.viewId,resourceId:'teaching',action:'read'})).value.rows.length,1,'private original lecture remains usable by its own teaching context')
  await adoption({action:'apply',id:preview.value.id,fingerprint:preview.value.fingerprint,confirmed:true});assert.equal((await apps.snapshot()).instances.length,5);assert.deepEqual(await readFile(join(legacyHome,'storages/kaogong_knowledge.json')),original)
 }finally{await publicTasks?.close();await publicRoles?.dispose();await stop?.();await otherPool?.close();await resources.close();await apps.close();await backend.close();await nativeContext.fiber.dispose();await rm(root,{recursive:true,force:true});await rm(legacyHome,{recursive:true,force:true})}
})

for(const ownershipAt of ['prepare','apply'])test(`actual Host blocks a source Session owned by another application before ${ownershipAt} target or business import`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'kaogong-owned-source-')),legacyHome=await legacyFixture(),nativeContext=new Context()
 await nativeContext.plugin(Storage)
 const backend=new JsonStorageBackend(join(root,'data'));nativeContext.storage.backend.register('json',backend)
 const facility=new DomainFacility(nativeContext,{backend:'json'}),apps=new ApplicationDirectory(join(root,'apps.json')),resources=new ResourceDirectory(join(root,'resources.json'),apps,apps.gate)
 const preset='personal-workbench.kaogong-teacher.v1',roles=new RoleDirectory(await RoleStore.open(join(root,'roles.json')),apps,{validate:async()=>({presetId:preset}),validateAttachment:async()=>{},validateExisting:async()=>{},hydrateLegacy:async()=>assert.fail('empty history'),validateLegacy:async row=>({sessionId:row.sessionId,presetId:row.presetId,cwd:row.creation.cwd,status:'current'}),create:async()=>assert.fail('preflight cannot create Native Sessions')},apps.gate)
 const routes=new Map(),ctx={worktableProtocol:{describe:describeProtocol},storageDomain:facility,worktableApplications:apps,worktableResources:resources,worktableRoles:roles,worktableCapabilities:{contribute:()=>()=>{},contributeSessionScopes:()=>()=>{}},worktableTaskOwners:{contribute:()=>()=>{}},agentPresets:{register:async()=>async()=>{}},connection:{admit:()=>({peer:{}})},webServer:{register:route=>{routes.set(route.kind+':'+route.path,route);return()=>{}}},tools:{declare:()=>{},register:()=>()=>{}}}
 let stop
 try{
  await apps.contribute({id:'foreign',title:'Foreign',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]})
  roles.contribute('foreign',[{id:'teacher',title:'Private foreign teacher',agent:{kind:'agent',source:'managed',id:'teacher'},creation:{cwd:root}}])
  const owner=await apps.createInstance('foreign',null)
  if(ownershipAt==='prepare')await roles.attach(owner.id,'teacher','existing-native',null,0)
  const path=join(legacyHome,'storages/personal_workbench_role_bindings.json'),source=JSON.parse(await readFile(path,'utf8'))
  source.tables.bindings.synthetic={key:{appId:'kaogong',instanceId:'default',roleId:'teacher',subject:'行测-资料分析'},sessionId:'existing-native',presetId:preset,creation:{cwd:root},phase:'ready',selectedPreset:true,previousSessionIds:[]}
  await writeFile(path,JSON.stringify(source))
  stop=await mountHistoricalFixture(ctx,{legacySourceHome:legacyHome,roleCwd:root,questionImageRoot:{get:()=>undefined},mineru:{get:()=>undefined}})
  const adoption=async body=>{const req=Readable.from([JSON.stringify(body)]);Object.assign(req,{method:'POST',url:'/api/kaogong/adoption',headers:{'content-type':'application/json'}});const res=response();await routes.get('exact:/api/kaogong/adoption').handler(req,res);return res}
  const before=await apps.snapshot()
  const preview=await adoption({action:'prepare',sourceKey:'legacy-default'})
  assert.equal(preview.status,200);assert.equal(preview.value.status,ownershipAt==='prepare'?'blocked':'ready')
  if(ownershipAt==='prepare')assert.ok(preview.value.roles.some(role=>role.blockers.some(row=>row.code==='session-owned')))
  else await roles.attach(owner.id,'teacher','existing-native',null,0)
  const roleBytes=await readFile(join(root,'roles.json'))
  const result=await adoption({action:'apply',id:preview.value.id,fingerprint:preview.value.fingerprint,confirmed:true})
  assert.equal(result.status,409);assert.equal(result.value.code,ownershipAt==='prepare'?'ADOPTION_PLAN_BLOCKED_OR_CHANGED':'LEGACY_NATIVE_SOURCE_CHANGED')
  const after=await apps.snapshot();assert.deepEqual(after.instances,before.instances);assert.deepEqual(after.views,before.views)
  assert.deepEqual(await readFile(join(root,'roles.json')),roleBytes)
  assert.doesNotMatch(JSON.stringify(preview.value),/Private foreign teacher/)
 }finally{await stop?.();await roles.dispose();await resources.close();await apps.close();await backend.close();await nativeContext.fiber.dispose();await rm(root,{recursive:true,force:true});await rm(legacyHome,{recursive:true,force:true})}
})

test('fresh material-only Host import ignores broken old roles/learning and keeps private library material out of cross-instance grants',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kaogong-material-host-')),source=await legacyFixture(),nativeContext=new Context();await nativeContext.plugin(Storage);const backend=new JsonStorageBackend(join(root,'data'));nativeContext.storage.backend.register('json',backend);const facility=new DomainFacility(nativeContext,{backend:'json'}),apps=new ApplicationDirectory(join(root,'apps.json')),resources=new ResourceDirectory(join(root,'resources.json'),apps,apps.gate),routes=new Map();let stop,lostReceipt=false,failBeforeBusiness=false,materialWrites=0;const importDomains=new Map(); const importFacility={open:async spec=>{const domain=await facility.open(spec);importDomains.set(spec.name,domain);return new Proxy(domain,{get(target,key){if(key==='table')return name=>{const table=target.table(name);return new Proxy(table,{get(target,key){if(key==='put')return async(id,value)=>{if(failBeforeBusiness&&spec.name==='kaogong_material_import_rc3'&&name==='private_knowledge'){failBeforeBusiness=false;throw Error('unknown before first business row')}await table.put(id,value);if(spec.name.endsWith('_knowledge')&&id==='private'){materialWrites++;if(lostReceipt){lostReceipt=false;throw Error('lost material receipt')}}};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})}}
 const ctx={worktableProtocol:{describe:describeProtocol},storageDomain:importFacility,worktableApplications:apps,worktableResources:resources,worktableRoles:{contribute:()=>()=>{},contributeLegacy:()=>()=>{},read:async()=>({binding:null}),resolveSession:async()=>{throw Error('no Native sessions')}},worktableCapabilities:{contribute:()=>()=>{},contributeSessionScopes:()=>()=>{}},worktableTaskOwners:{contribute:()=>()=>{}},agentPresets:{register:async()=>async()=>{}},connection:{admit:req=>req.auth?{peer:{}}:{rejection:401}},webServer:{register:route=>{routes.set(route.kind+':'+route.path,route);return ()=>routes.delete(route.kind+':'+route.path)}},tools:{register:()=>()=>{}}}
 try{
  await writeFile(join(source,'storages','personal_workbench_role_bindings.json'),'invalid old role bytes');await writeFile(join(source,'storages','kaogong_practice.json'),'invalid old practice bytes')
  const original=await readFile(join(source,'storages','kaogong_knowledge.json'))
  stop=await mountKaogong(ctx,{legacySourceHome:source,materialSourceHome:source,questionImageRoot:{get:()=>undefined},mineru:{get:()=>undefined}})
  assert.equal(routes.has('exact:/api/kaogong/adoption'),false,'fresh deployment must not expose historical learner or Session adoption')
  const library=await apps.createInstance('kaogong-library',null),lv=await apps.createView(library.id),learning=await apps.createInstance('kaogong',null),av=await apps.createView(learning.id)
  const post=async(body,auth=true)=>{const req=Readable.from([JSON.stringify(body)]);Object.assign(req,{method:'POST',url:'/api/kaogong/material-import',headers:{'content-type':'application/json'},auth});const res=response();const route=routes.get('exact:/api/kaogong/material-import');assert.ok(route,'fresh library must expose the material-only import endpoint');await route.handler(req,res);return res}
  const get=async view=>{const res=response();await routes.get('exact:/api/kaogong/knowledge').handler({method:'GET',url:'/api/kaogong/knowledge?viewId='+view,auth:true},res);return res}
  assert.equal((await post({action:'prepare',viewId:lv.id},false)).status,401)
  assert.equal((await post({action:'prepare',viewId:av.id})).status,409)
  assert.equal((await post({action:'prepare',viewId:lv.id,path:'arbitrary'})).status,409)
  const emptyUnknown=await apps.createInstance('kaogong-library',null),emptyUnknownView=await apps.createView(emptyUnknown.id)
  const firstEmpty=(await post({action:'prepare',viewId:emptyUnknownView.id})).value,otherEmpty=(await post({action:'prepare',viewId:emptyUnknownView.id})).value
  failBeforeBusiness=true
  assert.equal((await post({action:'apply',viewId:emptyUnknownView.id,id:firstEmpty.id,fingerprint:firstEmpty.fingerprint,confirmed:true})).status,409)
  assert.equal(materialWrites,0,'the quarantined plan has written zero business rows')
  assert.equal((await get(emptyUnknownView.id)).status,403)
  assert.equal((await post({action:'apply',viewId:emptyUnknownView.id,id:otherEmpty.id,fingerprint:otherEmpty.fingerprint,confirmed:true})).status,409,'another prepared plan must not bypass empty unknown target quarantine')
  assert.equal((await post({action:'prepare',viewId:emptyUnknownView.id})).status,409,'an empty unknown target may not acquire a new source plan')
  assert.equal(materialWrites,0)
  assert.equal((await post({action:'apply',viewId:emptyUnknownView.id,id:firstEmpty.id,fingerprint:firstEmpty.fingerprint,confirmed:true})).status,200,'the exact unknown plan can still recover')
  materialWrites=0
  const legacyUnknown=await apps.createInstance('kaogong-library',null),legacyUnknownView=await apps.createView(legacyUnknown.id),beforeLegacy=(await post({action:'prepare',viewId:legacyUnknownView.id})).value
  await importDomains.get('kaogong_adoption_rc3').table('journals').put('synthetic-old-unknown',{id:'synthetic-old-unknown',schema:1,status:'unknown',planId:'synthetic-old-plan',planFingerprint:'synthetic-only',globalIndex:0,recordIndex:0,roleIndex:0,grantIndex:0,targetIntents:[legacyUnknown.id]})
  assert.equal((await get(legacyUnknownView.id)).status,403)
  assert.equal((await post({action:'prepare',viewId:legacyUnknownView.id})).status,409,'fresh preview cannot bypass old target quarantine')
  assert.equal((await post({action:'apply',viewId:legacyUnknownView.id,id:beforeLegacy.id,fingerprint:beforeLegacy.fingerprint,confirmed:true})).status,409,'fresh apply cannot bypass old unknown target quarantine')
  const oldJournal=importDomains.get('kaogong_adoption_rc3').table('journals')
  await oldJournal.put('synthetic-old-unknown',{...oldJournal.get('synthetic-old-unknown'),status:'applied'})
  assert.equal((await post({action:'prepare',viewId:legacyUnknownView.id})).status,409,'an applied legacy source receipt pins even an empty library')
  assert.equal((await post({action:'apply',viewId:legacyUnknownView.id,id:beforeLegacy.id,fingerprint:beforeLegacy.fingerprint,confirmed:true})).status,409)
  const provisionId=randomUUID(),provisionView=randomUUID(),operationId=randomUUID()
  await apps.withProvision(operationId,async()=>{
   await apps.ensureInstance({id:provisionId,appId:'kaogong-library',projectId:null,operationId})
   await apps.ensureView({id:provisionView,instanceId:provisionId,type:'page',operationId})
   assert.equal((await post({action:'prepare',viewId:provisionView})).status,409,'even an ambient trusted provision scope cannot admit material import before ready')
  })
  const emptySource=JSON.parse(original);emptySource.tables.entries={};await writeFile(join(source,'storages','kaogong_knowledge.json'),JSON.stringify(emptySource))
  const emptyApplied=await apps.createInstance('kaogong-library',null),emptyAppliedView=await apps.createView(emptyApplied.id),zeroPlan=(await post({action:'prepare',viewId:emptyAppliedView.id})).value
  assert.equal(zeroPlan.counts.knowledge,0)
  assert.equal((await post({action:'apply',viewId:emptyAppliedView.id,id:zeroPlan.id,fingerprint:zeroPlan.fingerprint,confirmed:true})).status,200)
  await writeFile(join(source,'storages','kaogong_knowledge.json'),original)
  assert.equal((await post({action:'prepare',viewId:emptyAppliedView.id})).status,409,'even a zero-record completed import pins the library source')
  const prepared=await post({action:'prepare',viewId:lv.id});assert.equal(prepared.status,200);assert.equal(prepared.value.counts.privateMaterials,1);assert.equal((await get(lv.id)).value.entries.length,0)
  assert.equal((await post({action:'apply',viewId:lv.id,id:prepared.value.id,fingerprint:prepared.value.fingerprint,confirmed:false})).status,409)
  lostReceipt=true
  assert.equal((await post({action:'apply',viewId:lv.id,id:prepared.value.id,fingerprint:prepared.value.fingerprint,confirmed:true})).status,409)
  assert.equal((await get(lv.id)).status,403,'lost receipt must quarantine all normal library reads')
  await assert.rejects(resources.call({viewId:lv.id,resourceId:'materials',action:'read'}),/尚未确认/)
  await stop();stop=await mountKaogong(ctx,{materialSourceHome:source,questionImageRoot:{get:()=>undefined},mineru:{get:()=>undefined}})
  assert.equal((await get(lv.id)).status,403,'restart must not silently resume an unknown import')
  const alternateView=await apps.createView(library.id)
  const applied=await post({action:'apply',viewId:alternateView.id,id:prepared.value.id,fingerprint:prepared.value.fingerprint,confirmed:true});assert.equal(applied.status,200);assert.equal(applied.value.status,'applied');assert.equal(materialWrites,1,'same-plan recovery confirms existing original bytes without another put')
  assert.deepEqual((await get(lv.id)).value.entries.map(row=>row.id),['private'],'own library can inspect its private lecture')
  await resources.share({ownerViewId:lv.id,consumerInstanceId:learning.id,resourceId:'materials'});assert.deepEqual((await get(av.id)).value.entries,[],'a material grant must not expose private or unproven lecture rows')
  assert.deepEqual(await readFile(join(source,'storages','kaogong_knowledge.json')),original)
  const l2=await apps.createInstance('kaogong-library',null),v2=await apps.createView(l2.id),next=await post({action:'prepare',viewId:v2.id});await writeFile(join(source,'storages','kaogong_knowledge.json'),Buffer.concat([original,Buffer.from(' ')]));assert.equal((await post({action:'apply',viewId:v2.id,id:next.value.id,fingerprint:next.value.fingerprint,confirmed:true})).status,409);assert.deepEqual((await get(v2.id)).value.entries,[],'source byte change is refused before data import')
 }finally{await stop?.();await resources.close();await apps.close();await backend.close();await nativeContext.fiber.dispose();await rm(root,{recursive:true,force:true});await rm(source,{recursive:true,force:true})}
})
