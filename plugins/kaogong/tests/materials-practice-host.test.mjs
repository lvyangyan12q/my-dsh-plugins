import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {Readable} from 'node:stream'
import {KaogongInstancePool} from '../src/instance-state.ts'
import {materialsSourceFixture} from './materials-source-fixture.mjs'
import {mountKaogong} from '../src/production-host.ts'
import {loadVerifiedPracticeMaterials,loadVerifiedPracticeOptions} from '../src/verified-practice-materials.ts'
import {safePracticeQuestion} from '../src/practice-rounds.ts'
import {ApplicationDirectory} from '../../worktable/01_content/src/framework/applications.mjs'
import {ResourceDirectory} from '../../worktable/01_content/src/framework/resources.mjs'
import {describeProtocol} from '../../worktable/01_content/src/sdk.mjs'
const native=process.env.KAOGONG_TEST_RUNTIME;assert(native)
const require=createRequire(resolve(native,'packages/client/ui-renderer/package.json')),{Context}=require('@deepseek-ai/cordis')
const load=file=>import(pathToFileURL(resolve(native,file)).href)
const {default:Storage}=await load('packages/storage/storage/lib/index.js'),{JsonStorageBackend}=await load('packages/storage/storage-json/lib/index.js'),{DomainFacility}=await load('packages/storage/storage-domain/lib/index.js')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const response=()=>({status:0,value:null,writeHead(code){this.status=code},end(value){this.value=Buffer.isBuffer(value)?value:JSON.parse(value)}})
for(const {certified,optionProof}of [{certified:false,optionProof:false},{certified:true,optionProof:false},{certified:true,optionProof:true}])test(optionProof?'exact source-certified option presentation is applied without editing original options or grading':certified?'new production Host must honor exact synthetic PDF/PNG verified associations after materials-only import and explicit readonly grants':'v2 image integrity proof alone does not claim manually certified practice material',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kaogong-practice-diagnosis-')),configuration=await materialsSourceFixture(join(root,'original-synthetic-v3'),{certified,optionProof}),bankBytes=await readFile(join(configuration.materialSourceHome,'storages/kaogong_bank.json')),bank=JSON.parse(bankBytes).tables.questions,context=new Context(),routes=new Map();await context.plugin(Storage);const backend=new JsonStorageBackend(join(root,'data'));context.storage.backend.register('json',backend);const facility=new DomainFacility(context,{backend:'json'}),apps=new ApplicationDirectory(join(root,'apps.json')),resources=new ResourceDirectory(join(root,'resources.json'),apps,apps.gate);let stop
 try{
  const imageRoot=configuration.questionImageRoot
  const display=await loadVerifiedPracticeMaterials(imageRoot),options=await loadVerifiedPracticeOptions(imageRoot)
  for(const[id,row]of Object.entries(bank)){const stem=display(id,row.stem);assert.equal(safePracticeQuestion({...row,stem,options:options(id,row.stem,row.options)},stem!==row.stem),certified);assert.equal(row.correctAnswer,'B')}
  const ctx={worktableProtocol:{describe:describeProtocol},storageDomain:facility,worktableApplications:apps,worktableResources:resources,worktableRoles:{contribute:()=>()=>{},contributeLegacy:()=>()=>{},read:async()=>({binding:null}),resolveSession:async()=>{throw Error('No Native sessions used in this diagnostic')}},worktableCapabilities:{contribute:()=>()=>{},contributeSessionScopes:()=>()=>{}},worktableTaskOwners:{contribute:()=>()=>{}},agentPresets:{register:async()=>async()=>{}},connection:{admit:()=>({peer:{}})},webServer:{register:route=>{routes.set(route.kind+':'+route.path,route);return()=>routes.delete(route.kind+':'+route.path)}},tools:{register:()=>()=>{}}}
  stop=await mountKaogong(ctx,{materialSourceHome:configuration.materialSourceHome,legacyMaterialRoot:configuration.legacyMaterialRoot,questionImageRoot:{get:()=>imageRoot},mineru:{get:()=>configuration.mineru}})
  const library=await apps.createInstance('kaogong-library',null),lv=await apps.createView(library.id),learning=await apps.createInstance('kaogong',null),av=await apps.createView(learning.id)
  const post=async(path,viewId,body)=>{const req=Readable.from([JSON.stringify(body)]);Object.assign(req,{url:path+'?viewId='+viewId,method:'POST',headers:{'content-type':'application/json'}});const result=response();await routes.get('exact:'+path).handler(req,result);return result}
  const preview=await post('/api/kaogong/material-import',lv.id,{action:'prepare',viewId:lv.id});assert.equal(preview.status,200);assert.equal(preview.value.counts.bank,10);assert.equal(preview.value.counts.bankReferenceBindings,certified?20:10)
  assert.equal((await post('/api/kaogong/material-import',lv.id,{action:'apply',viewId:lv.id,id:preview.value.id,fingerprint:preview.value.fingerprint,confirmed:true})).status,200)
  let bankGrant=await resources.share({ownerViewId:lv.id,consumerInstanceId:learning.id,resourceId:'question-bank'});await resources.share({ownerViewId:lv.id,consumerInstanceId:learning.id,resourceId:'materials'})
  const visible=await resources.call({viewId:av.id,resourceId:'question-bank',action:'read'});assert.equal(visible.value.rows.length,10)
  const first=Object.keys(bank)[0],imageQuery=new URLSearchParams({viewId:av.id,questionId:first,reference:'题目_images/synthetic-bars-10-20.png'}),imageResponse=response();await routes.get('exact:/api/kaogong/legacy-question-image').handler({url:'/api/kaogong/legacy-question-image?'+imageQuery,method:'GET'},imageResponse);assert.equal(imageResponse.status,200,'Image integrity/grant proof is valid independently of practice certification')
  const result=await post('/api/kaogong/practice/start',av.id,{subject:'行测-资料分析',title:'原创合成资料诊断'})
  if(!certified){
   assert.equal(result.status,400);assert.match(result.value.error,/图表或选项尚未通过来源核验/)
   await mkdir(join(imageRoot,'verified'),{recursive:true});await writeFile(join(imageRoot,'verified/synthetic-bars-10-20.png'),configuration.png)
   await writeFile(join(imageRoot,'verified/associations.json'),JSON.stringify({version:1,associations:Object.entries(bank).map(([questionId,row])=>({questionId,stemSha256:sha(row.stem),asset:'verified/synthetic-bars-10-20.png',assetSha256:sha(configuration.png),sourcePdfSha256:sha(configuration.pdfBytes),sourcePage:1}))}))
   assert.equal((await post('/api/kaogong/practice/start',av.id,{subject:'行测-资料分析'})).status,400,'Adding source proof after an old plan was confirmed must not retroactively certify that plan')
  }
    else{
   assert.equal(result.status,200,JSON.stringify(result.value));assert.equal(result.value.questions.length,10);assert.match(result.value.questions[0].stem,/题目_images\/verified\//);assert.equal('correctAnswer'in result.value.questions[0],false);if(optionProof){assert.deepEqual(result.value.questions[0].options,['A. 10','B. 20','C. 30','D. 40']);assert.match(bank[first].options[1],/SKA674/,'The original source option remains intact')}
   const submitted=await post('/api/kaogong/practice/submit',av.id,{roundId:result.value.roundId,answers:result.value.questions.map(row=>({id:row.id,answer:'B'}))});assert.equal(submitted.status,200);assert.equal(submitted.value.correctCount,10)
   const start=()=>post('/api/kaogong/practice/start',av.id,{subject:'行测-资料分析'})
   const indexPath=join(imageRoot,'verified/associations.json'),originalIndex=await readFile(indexPath)
   await writeFile(indexPath,Buffer.concat([originalIndex,Buffer.from(' ')]));assert.equal((await start()).status,403,'Index byte changes invalidate the confirmed source proof');await writeFile(indexPath,originalIndex)
   for(const path of ['verified/synthetic-bars-10-20.png','synthetic-bars-10-20.png']){const image=await readFile(join(imageRoot,path));await writeFile(join(imageRoot,path),Buffer.concat([image,Buffer.from('changed')]));assert.equal((await start()).status,403,'Changed verified or embedded original image bytes must refuse start');await writeFile(join(imageRoot,path),image)}
   const pool=new KaogongInstancePool(facility),lease=await pool.acquire(library.id)
   try{await lease.state.bankQuestions.put(first,{...bank[first],stem:bank[first].stem+' revised target copy'})}finally{await lease.release();await pool.close()}
   const changed=await start();assert.equal(changed.status,200);assert.equal(changed.value.totalAvailable,9);assert.ok(changed.value.questions.every(row=>row.id!==first),'A changed record cannot borrow its old source proof')
   const restoring=new KaogongInstancePool(facility),restore=await restoring.acquire(library.id);try{await restore.state.bankQuestions.put(first,bank[first])}finally{await restore.release();await restoring.close()}
   const countRounds=async()=>{const pool=new KaogongInstancePool(facility),lease=await pool.acquire(learning.id);try{return lease.state.rounds.size}finally{await lease.release();await pool.close()}}
   const beforeRevoke=await countRounds();let revokedDuringRead=false
   ctx.worktableResources=new Proxy(resources,{get(target,key){if(key==='call')return async input=>{const value=await target.call(input);if(!revokedDuringRead&&input.viewId===av.id&&input.resourceId==='question-bank'){revokedDuringRead=true;await resources.revoke(bankGrant.id,bankGrant.revision)}return value};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
   assert.equal((await start()).status,403,'The grant must still be valid after proof preparation, not merely when rows were first captured');ctx.worktableResources=resources;assert.equal(revokedDuringRead,true);assert.equal(await countRounds(),beforeRevoke,'A revoked preparation cannot leave a half-issued round')
   bankGrant=await resources.share({ownerViewId:lv.id,consumerInstanceId:learning.id,resourceId:'question-bank'})
   await resources.revoke(bankGrant.id,bankGrant.revision);assert.equal((await start()).status,403);await assert.rejects(resources.call({viewId:av.id,resourceId:'question-bank',action:'read'}),/撤销|不可用|授权/);assert.equal((await post('/api/kaogong/practice/read',av.id,{roundId:result.value.roundId})).status,403,'A snapshot read cannot silently reacquire a revoked question-bank source')
   bankGrant=await resources.share({ownerViewId:lv.id,consumerInstanceId:learning.id,resourceId:'question-bank'});assert.equal((await start()).status,200)
   const second=await materialsSourceFixture(join(root,'other-owner-original-synthetic'),{certified:false,optionProof});assert.deepEqual(second.questions,bank,'Both owners deliberately have identical question IDs and bytes')
   await stop();stop=await mountKaogong(ctx,{materialSourceHome:second.materialSourceHome,legacyMaterialRoot:second.legacyMaterialRoot,questionImageRoot:{get:()=>second.questionImageRoot},mineru:{get:()=>second.mineru}})
   const otherLibrary=await apps.createInstance('kaogong-library',null),otherLibraryView=await apps.createView(otherLibrary.id),otherConsumer=await apps.createInstance('kaogong',null),otherView=await apps.createView(otherConsumer.id)
   const otherPlan=await post('/api/kaogong/material-import',otherLibraryView.id,{action:'prepare',viewId:otherLibraryView.id});assert.equal(otherPlan.status,200)
   assert.equal((await post('/api/kaogong/material-import',otherLibraryView.id,{action:'apply',viewId:otherLibraryView.id,id:otherPlan.value.id,fingerprint:otherPlan.value.fingerprint,confirmed:true})).status,200)
   await resources.share({ownerViewId:otherLibraryView.id,consumerInstanceId:otherConsumer.id,resourceId:'question-bank'})
   assert.equal((await post('/api/kaogong/practice/start',otherView.id,{subject:'行测-资料分析'})).status,400,'An uncertified owner with identical rows cannot borrow another owner proof')
   assert.equal((await start()).status,200,'An applied owner continues to use its own pinned root after global configuration changes to another source')
  }
  assert.deepEqual(await readFile(join(configuration.materialSourceHome,'storages/kaogong_bank.json')),bankBytes,'The original synthetic bank and answers were never modified')
 }finally{await stop?.();await resources.close();await apps.close();await backend.close();await context.fiber.dispose();await rm(root,{recursive:true,force:true})}
})
