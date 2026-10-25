import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {Readable} from 'node:stream'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {pathToFileURL} from 'node:url'
import {fixture} from './legacy-adoption-fixture.mjs'
import {mountKaogong} from '../src/production-host.ts'
import {KaogongInstancePool} from '../src/instance-state.ts'
import {ApplicationDirectory} from '../../worktable/01_content/src/framework/applications.mjs'
import {ResourceDirectory} from '../../worktable/01_content/src/framework/resources.mjs'
import {describeProtocol} from '../../worktable/01_content/src/sdk.mjs'
const native=process.env.KAOGONG_TEST_RUNTIME;assert(native)
const require=createRequire(resolve(native,'packages/client/ui-renderer/package.json')),{Context}=require('@deepseek-ai/cordis')
const load=file=>import(pathToFileURL(resolve(native,file)).href)
const{default:Storage}=await load('packages/storage/storage/lib/index.js'),{JsonStorageBackend}=await load('packages/storage/storage-json/lib/index.js'),{DomainFacility}=await load('packages/storage/storage-domain/lib/index.js')
const sha=value=>createHash('sha256').update(value).digest('hex')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6N/4AAAAASUVORK5CYII=','base64')
const response=()=>({status:0,value:null,headers:null,writeHead(code,headers){this.status=code;this.headers=headers},end(value){this.value=Buffer.isBuffer(value)?value:value===undefined?null:JSON.parse(value)}})

test('actual authenticated Host adopts separate raw/private/bank proofs, renders only authorized bytes, survives reopen and revokes exact source',async t=>{
 const root=await mkdtemp(join(tmpdir(),'kaogong-asset-host-')),home=await fixture(),materialRoot=join(root,'materials'),imageRoot=join(root,'question-images'),routes=new Map()
 const context=new Context();await context.plugin(Storage);const backend=new JsonStorageBackend(join(root,'data'));context.storage.backend.register('json',backend);const facility=new DomainFacility(context,{backend:'json'})
 const apps=new ApplicationDirectory(join(root,'apps.json')),resources=new ResourceDirectory(join(root,'resources.json'),apps,apps.gate),pool=new KaogongInstancePool(facility)
 let stop
 try{
  await mkdir(join(materialRoot,'storage/mineru'),{recursive:true});await mkdir(imageRoot,{recursive:true});await writeFile(join(imageRoot,'original.png'),png)
  const manifest={version:1,documents:[]},knowledgePath=join(home,'storages/kaogong_knowledge.json'),knowledge=JSON.parse(await readFile(knowledgePath,'utf8')),ids={},refs={}
  for(const [kind,jobId]of [['raw','12345678-1234-1234-1234-123456789012'],['private','87654321-4321-4321-4321-210987654321']]){
   const pdf=join(materialRoot,kind+'.pdf'),pdfBytes=Buffer.from('%PDF-'+kind),fingerprint=sha(kind==='raw'?pdfBytes:Buffer.from('previous private PDF'))
   await writeFile(pdf,pdfBytes);const jobRoot=join(materialRoot,'storage/mineru',jobId);await mkdir(join(jobRoot,'assets/images'),{recursive:true});await writeFile(join(jobRoot,'assets/images/a.png'),png)
   const reference=`/api/kaogong/document-image?id=${jobId}&asset=images%2Fa.png`,content=kind==='raw'?`![raw](${reference})`:'<img src="images/a.png">'
   const id=`mineru_${fingerprint}_1-2`;ids[kind]=id;refs[kind]=kind==='raw'?reference:'images/a.png'
   knowledge.tables.entries[id]={subject:'申论',knowledgePoint:'',title:kind+'.pdf [PDF 1-2]',content,kind:'讲义',source:pdf+'#pages=1-2',tags:['MinerU','待校对','mineru-job:'+jobId],createdAt:'2020-01-01',updatedAt:'2020-01-01'}
   await writeFile(join(jobRoot,'knowledge.md'),content);await writeFile(join(jobRoot,'job.json'),JSON.stringify({id:jobId,batchId:'batch',source:pdf,subject:'申论',title:kind+'.pdf',pages:'1-2'}))
   manifest.documents.push({file:pdf,fingerprint,pages:2,subject:'申论',kind:'讲义',jobs:[{id:jobId,pages:'1-2',state:'done',characters:content.length,images:1}]})
  }
  await writeFile(join(materialRoot,'storage/mineru/rebuild-manifest.json'),JSON.stringify(manifest));await writeFile(knowledgePath,JSON.stringify(knowledge))
  const bankPath=join(home,'storages/kaogong_bank.json'),bank=JSON.parse(await readFile(bankPath,'utf8'));bank.tables.questions.q={subject:'申论',knowledgePoint:'',questionType:'单选',stem:'![chart](题目_images/original.png)',options:['A. first','B. second'],correctAnswer:'B',explanation:'original explanation',difficulty:'easy',source:'original',origin:'local',reviewStatus:'approved',reviewNotes:'',tags:[],createdAt:'2020-01-01',reviewedAt:''}
  const performanceRows=Number(process.env.KAOGONG_PERFORMANCE_ROWS??1);assert.ok(Number.isSafeInteger(performanceRows)&&performanceRows>=1&&performanceRows<=5000)
  for(let index=1;index<performanceRows;index++)bank.tables.questions['synthetic_'+index]={...bank.tables.questions.q,stem:'Synthetic exact immutable source row '+index}
  await writeFile(bankPath,JSON.stringify(bank))
  const original=await readFile(knowledgePath),ctx={worktableProtocol:{describe:describeProtocol},storageDomain:facility,worktableApplications:apps,worktableResources:resources,worktableRoles:{contribute:()=>()=>{},contributeLegacy:()=>()=>{},read:async()=>({binding:null})},worktableCapabilities:{contribute:()=>()=>{},contributeSessionScopes:()=>()=>{}},worktableTaskOwners:{contribute:()=>()=>{}},agentPresets:{register:async()=>async()=>{}},connection:{admit:req=>req.auth?{}:{rejection:401}},webServer:{register:route=>{routes.set(route.kind+':'+route.path,route);return()=>routes.delete(route.kind+':'+route.path)}},tools:{register:()=>()=>{}}}
  const config={legacySourceHome:home,legacyMaterialRoot:materialRoot,questionImageRoot:{get:()=>imageRoot},mineru:{get:()=>({outputDir:join(materialRoot,'storage/mineru')})}}
  const offlinePath=join(root,'preview.private.json'),offline=spawnSync(process.execPath,['--import','tsx/esm',fileURLToPath(new URL('../scripts/preview-legacy-plan.mjs',import.meta.url)),'--home',home,'--material-root',materialRoot,'--question-image-root',imageRoot,'--mineru-root',join(materialRoot,'storage/mineru'),'--plan',offlinePath,'--preview',join(root,'preview.md')],{encoding:'utf8'})
  assert.equal(offline.status,0,offline.stderr);const offlinePlan=JSON.parse(await readFile(offlinePath,'utf8'));assert.equal(offlinePlan.status,'blocked');assert.equal(offlinePlan.counts.rawMaterials,1);assert.equal(offlinePlan.counts.privateImageBindings,1);assert.equal(offlinePlan.counts.bankImageBindings,1)
  stop=await mountKaogong(ctx,config)
  const post=async body=>{const req=Readable.from([JSON.stringify(body)]);Object.assign(req,{url:'/api/kaogong/adoption',method:'POST',auth:true,headers:{'content-type':'application/json'}});const res=response();await routes.get('exact:/api/kaogong/adoption').handler(req,res);return res}
  const preview=await post({action:'prepare',sourceKey:'legacy-default'});assert.equal(preview.status,200,JSON.stringify(preview.value));assert.equal(preview.value.counts.rawMaterials,1);assert.equal(preview.value.counts.privateImageBindings,1)
  const plan=(await post({action:'export',id:preview.value.id})).value;assert.equal((await apps.snapshot()).instances.length,0)
  const started=performance.now(),applied=await post({action:'apply',id:plan.id,fingerprint:plan.fingerprint,confirmed:true});assert.equal(applied.status,200,JSON.stringify(applied.value));assert.equal(applied.value.status,'applied')
  if(performanceRows>1)t.diagnostic(JSON.stringify({syntheticBankRows:performanceRows,publicNativeJsonApplyMs:Math.round(performance.now()-started),privatePlanBytes:Buffer.byteLength(JSON.stringify(plan)),formalData:false}))
  const history=plan.targets.history,library=plan.targets.library,other=await apps.createInstance('kaogong',null),otherView=await apps.createView(other.id)
  const image=async(viewId,kind,id,reference,extra={})=>{const path=kind==='bank'?'/api/kaogong/legacy-question-image':'/api/kaogong/legacy-image',query=new URLSearchParams({viewId,[kind==='bank'?'questionId':'entryId']:id,reference,...extra}),res=response();await routes.get('exact:'+path).handler({url:path+'?'+query,method:'GET',auth:true},res);return res}
  for(const[view,kind,id,reference]of [[history.viewId,'knowledge',ids.private,refs.private],[history.viewId,'knowledge',ids.raw,refs.raw],[library.viewId,'knowledge',ids.raw,refs.raw],[history.viewId,'bank','q','题目_images/original.png']]){const res=await image(view,kind,id,reference);assert.equal(res.status,200,JSON.stringify(res.value));assert.deepEqual(res.value,png);assert.equal(res.headers['cache-control'],'private, no-store')}
  assert.equal((await image(otherView.id,'knowledge',ids.private,refs.private)).status,404);assert.equal((await image(library.viewId,'knowledge',ids.private,refs.private)).status,404)
  assert.equal((await image(history.viewId,'bank','q','unrelated.png')).status,404);assert.equal((await image(history.viewId,'bank','q','题目_images/original.png',{root:imageRoot})).status,404)
  await stop();stop=await mountKaogong(ctx,config);assert.equal((await image(history.viewId,'knowledge',ids.private,refs.private)).status,200)
  const grant=(await resources.connection({viewId:history.viewId,ownerViewId:library.viewId,resourceId:'materials'})).connection;await resources.revoke(grant.id,grant.revision)
  assert.equal((await image(history.viewId,'knowledge',ids.raw,refs.raw)).status,404);assert.equal((await image(history.viewId,'bank','q','题目_images/original.png')).status,200,'bank authorization must not depend on the materials grant')
  assert.equal((await image(history.viewId,'knowledge',ids.private,refs.private)).status,200,'own private continuity must not depend on revoked source grants')
  const lease=await pool.acquire(history.instanceId),old=lease.state.knowledgeEntries.get(ids.private);await lease.state.knowledgeEntries.put(ids.private,{...old,content:old.content+' changed'});await lease.release();assert.equal((await image(history.viewId,'knowledge',ids.private,refs.private)).status,404)
  await writeFile(join(imageRoot,'original.png'),Buffer.concat([png,Buffer.from('changed')]));assert.equal((await image(history.viewId,'bank','q','题目_images/original.png')).status,404)
  assert.deepEqual(await readFile(knowledgePath),original)
 }finally{await stop?.();await pool.close();await resources.close();await apps.close();await backend.close();await context.fiber.dispose();await rm(root,{recursive:true,force:true});await rm(home,{recursive:true,force:true})}
})
