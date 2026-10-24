import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {mountKaogong} from '../src/production-host.ts'
import {KaogongInstancePool} from '../src/instance-state.ts'
import {ApplicationDirectory} from '../../worktable/01_content/src/framework/applications.mjs'
import {describeProtocol} from '../../worktable/01_content/src/sdk.mjs'
import {ResourceDirectory} from '../../worktable/01_content/src/framework/resources.mjs'
const native=process.env.KAOGONG_TEST_RUNTIME;assert.ok(native)
const require=createRequire(resolve(native,'packages/client/ui-renderer/package.json'))
const {Context}=require('@deepseek-ai/cordis')
const load=file=>import(pathToFileURL(resolve(native,file)).href)
const {default:Storage}=await load('packages/storage/storage/lib/index.js')
const {JsonStorageBackend}=await load('packages/storage/storage-json/lib/index.js')
const {DomainFacility}=await load('packages/storage/storage-domain/lib/index.js')
const response=()=>({status:0,value:null,writeHead(code){this.status=code},end(value){this.value=JSON.parse(value)}})
test('actual production Host installs empty views, routes tools by native Session and enforces explicit library grant/revoke',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kaogong-production-')),nativeContext=new Context();await nativeContext.plugin(Storage);const backend=new JsonStorageBackend(join(root,'data'));nativeContext.storage.backend.register('json',backend);const facility=new DomainFacility(nativeContext,{backend:'json'});const apps=new ApplicationDirectory(join(root,'apps.json')),resources=new ResourceDirectory(join(root,'resources.json'),apps,apps.gate);const routes=new Map(),tools=new Map(),owners=new Map();let stop,otherPool;
 const ctx={worktableProtocol:{describe:describeProtocol},storageDomain:facility,worktableApplications:apps,worktableResources:resources,worktableRoles:{contribute:()=>()=>{},read:async()=>({binding:null}),resolveSession:async(app,id,{access})=>{if(id==='history'&&access==='write')throw Error('read-only');if(id!=='native-B')throw Error('unbound');return {instanceId:B.id}}},worktableCapabilities:{contribute:()=>()=>{}},worktableTaskOwners:{contribute:(app,kind,owner)=>{owners.set(kind,owner);return ()=>owners.delete(kind)}},agentPresets:{register:async()=>async()=>{}},connection:{admit:request=>request.auth?{peer:{}}:{rejection:401}},webServer:{register:route=>{routes.set(route.kind+':'+route.path,route);return ()=>routes.delete(route.kind+':'+route.path)}},tools:{register:(tool,options)=>{tools.set(tool.name,{tool,options});return ()=>tools.delete(tool.name)}}};let B;
 try{
  stop=await mountKaogong(ctx,{questionImageRoot:{get:()=>undefined},mineru:{get:()=>undefined}});const library=await apps.createInstance('kaogong-library',null),A=await apps.createInstance('kaogong',null);B=await apps.createInstance('kaogong',null);const lv=await apps.createView(library.id),av=await apps.createView(A.id),bv=await apps.createView(B.id);assert.equal(owners.size,2)
  const get=async(view,path='/api/kaogong/knowledge',auth=true)=>{const res=response();await routes.get('exact:'+path).handler({url:path+'?viewId='+view,method:'GET',auth},res);return res}
  assert.deepEqual((await get(av.id)).value.entries,[]);assert.equal((await get(av.id,undefined,false)).status,403)
  assert.equal(await tools.get('kaogong_knowledge_add').options.when({agent:{session:{id:'outside'}}}),false)
  const tool=tools.get('kaogong_knowledge_add').tool;await tool.execute({id:'private',subject:'申论',title:'private note',content:'private',kind:'笔记'},{agent:{session:{id:'native-B'}}});assert.equal((await get(bv.id)).value.entries.length,1);assert.equal((await get(av.id)).value.entries.length,0)
  otherPool=new KaogongInstancePool(facility);const lease=await otherPool.acquire(library.id);const base={subject:'申论',knowledgePoint:'',content:'source',source:'synthetic',tags:[],createdAt:'2020-01-01',updatedAt:'2020-01-01'};await lease.state.knowledgeEntries.put('raw',{...base,title:'raw',kind:'讲义'});await lease.state.knowledgeEntries.put('hidden',{...base,title:'hidden',kind:'笔记'});await lease.release();
  assert.deepEqual((await get(lv.id)).value.entries.map(row=>row.id),['raw']);const grant=await resources.share({ownerViewId:lv.id,consumerInstanceId:B.id,resourceId:'materials'});assert.deepEqual((await get(bv.id)).value.entries.map(row=>row.id).sort(),['private','raw']);await resources.revoke(grant.id,grant.revision);assert.equal((await get(bv.id)).status,403);assert.deepEqual((await get(av.id)).value.entries,[])
  const study=await otherPool.acquire(B.id)
  await study.state.bankQuestions.put('question',{subject:'行测-资料分析',knowledgePoint:'增长率',questionType:'单选',stem:'synthetic',options:['A.10','B.20'],correctAnswer:'A',explanation:'synthetic',difficulty:'easy',source:'synthetic',origin:'local',reviewStatus:'approved',reviewNotes:'',tags:[],createdAt:'2020-01-01',reviewedAt:''})
  const round=await study.state.practice.start({subject:'行测-资料分析',title:'synthetic',limit:10});await study.state.practice.submit(round.roundId,[{id:'question',answer:'A'}]);await study.release();const reviewState=async()=>{const lease=await otherPool.acquire(B.id);try{return lease.state.rounds.get(round.roundId).review}finally{await lease.release()}}
  const owner=owners.get('review'),context={appId:'kaogong',instanceId:B.id,viewId:bv.id,roleId:'counselor'},plan=await owner.prepare(context,{roundId:round.roundId})
  assert.equal(await reviewState(),'ready','preview must not claim a review')
  const task={id:'owned-task',appId:'kaogong',instanceId:B.id,viewId:bv.id,roleId:'counselor',sessionId:'native-B',requestId:'native-request',status:'submitting',preparation:{kind:'review',id:plan.id,ownerAppId:'kaogong',ownerVersion:'1',token:plan.token}}
  await owner.beforeSubmit(task);assert.equal(await reviewState(),'sending','unknown admission stays sending until known acceptance')
  await owner.validate(task);await owner.accepted({...task,status:'accepted'});assert.equal(await reviewState(),'sent');await owner.accepted({...task,status:'accepted'});await assert.rejects(owner.prepare(context,{roundId:round.roundId}),/already sent/)
  await study.release()
 }finally{await stop?.();await otherPool?.close();await resources.close();await apps.close();await backend.close();await nativeContext.fiber.dispose();await rm(root,{recursive:true,force:true})}
})

