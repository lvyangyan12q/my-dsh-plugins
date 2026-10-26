import type {Context} from '@deepseek-ai/cordis'
import type {Domain} from '@deepseek-ai/dsh-storage-domain'
import {isAbsolute} from 'node:path'
import {inspectMaterials,materialEvidenceSnapshot} from './materials-inspection.mjs'
import {prepareMaterialImport,type MaterialImportPlan} from './materials-plan.ts'
import {MaterialImportWorkflow} from './materials-import.ts'
import {assertMaterialImportAdmission,materialImportDomain,materialPlansDomain} from './materials-state.ts'

import {inspectLegacyMaterialEvidence,revalidateLegacyMaterialEvidence} from './legacy-material-evidence.mjs'
import {inspectLegacyBankImageEvidence,revalidateLegacyBankImageEvidence} from './legacy-bank-image-evidence.mjs'
import {inspectLegacyPrivateAssets,revalidateLegacyPrivateAssets} from './legacy-private-assets.mjs'
import {bankQuestion,knowledgeEntry} from './schemas.ts'
import {privateKnowledgeKey} from './legacy-adoption-state.ts'
import type {Config} from './business.ts'
import type {KaogongHost} from './instance-host.ts'
import type {StudyWorkspace} from './study-workspace.ts'
function fail(code:string):never{throw Object.assign(Error(code),{code})}
export function materialPreview(plan:MaterialImportPlan,status='prepared'){return {id:plan.id,fingerprint:plan.fingerprint,status,sourceRevision:plan.source.revision,sourceFiles:plan.source.files.map(({name,sha256,bytes})=>({name,sha256,bytes})),target:plan.target,counts:plan.counts,notice:'仅接入资料到当前空资料库；原文件原址保留，不接管会话或学习记录，也不自动共享。'}}
/** Authenticated material-only owner. Mounting/listing does not open any old source. */
export function createMaterialImportOwner(ctx:Context,host:KaogongHost,state:Domain<typeof materialImportDomain>,plansDomain:Domain<typeof materialPlansDomain>,config:Config,assertPriorTargetReady:(instanceId:string)=>void,workspace:StudyWorkspace){
 const journals=state.table('journals'),plans=plansDomain.table('plans'),privacy=state.table('private_knowledge');let closing=false;const pending=new Set<Promise<unknown>>()
 const admission=async(instanceId:string,planId?:string)=>{await workspace.assertProfile(instanceId);assertPriorTargetReady(instanceId);assertMaterialImportAdmission(journals,instanceId,planId)}
 const target=async(viewId:string)=>{const context=await workspace.resolveView(viewId);if(context.instance.appId!=='kaogong-library'||context.application.id!=='kaogong-library'||context.application.kind!=='deep'||context.application.enabled===false)fail('MATERIAL_LIBRARY_VIEW_REQUIRED');return {instanceId:context.instance.id,viewId:context.view.id,appId:'kaogong-library' as const,projectId:context.instance.projectId,revision:context.instance.revision}}
 const capture=async()=>{if(!config.materialSourceHome||!isAbsolute(config.materialSourceHome))fail('EXPLICIT_MATERIAL_HOME_REQUIRED');return (await inspectMaterials({home:config.materialSourceHome})).snapshot}
 const verify=async(plan:MaterialImportPlan,full=false)=>{
  const snapshot=await capture();if(snapshot.sourceHome!==plan.source.home||snapshot.sourceRevision!==plan.source.revision)fail('MATERIAL_SOURCE_CHANGED')
  if(full){const proof=materialEvidenceSnapshot(snapshot),evidence=plan.assetEvidence;if(evidence?.materials)await revalidateLegacyMaterialEvidence({snapshot:proof,materialRoot:evidence.materials.requestedMaterialRoot,evidence:evidence.materials});if(evidence?.bank)await revalidateLegacyBankImageEvidence({snapshot:proof,questionImageRoot:evidence.bank.requestedQuestionImageRoot,mineruRoot:evidence.bank.documentRoot?.requestedMineruRoot,evidence:evidence.bank});if(evidence?.private)await revalidateLegacyPrivateAssets({snapshot:proof,materialRoot:evidence.private.requestedMaterialRoot,privateEntryIds:plan.privateKnowledgeIds,evidence:evidence.private})}
 }
 const workflow=new MaterialImportWorkflow({
  store:{read:async id=>{const row=journals.get(id);if(!row)return null;const stored=plans.get(row.planId);if(!stored||stored.id!==id||stored.fingerprint!==row.planFingerprint||stored.plan.target.instanceId!==row.instanceId)fail('MATERIAL_CHECKPOINT_INVALID');const {planId,planFingerprint,instanceId,...journal}=row;return {...journal,plan:stored.plan}},write:async row=>{const {plan,...journal}=row;await admission(plan.target.instanceId,plan.id);const old=plans.get(plan.id);if(old&&old.fingerprint!==plan.fingerprint)fail('MATERIAL_INTENT_CONFLICT');if(!old)await plans.put(plan.id,{id:plan.id,fingerprint:plan.fingerprint,plan});await journals.put(row.id,{...journal,planId:plan.id,planFingerprint:plan.fingerprint,instanceId:plan.target.instanceId})}},
  source:{verify},
  target:{run:async(expected,operation,planId)=>{await admission(expected.instanceId,planId);const snapshot=await workspace.snapshot(),current=snapshot.instances.find(row=>row.id===expected.instanceId),app=snapshot.applications.find(row=>row.id==='kaogong-library');if(!current||current.appId!=='kaogong-library'||!app||app.kind!=='deep'||app.enabled===false||current.projectId!==expected.projectId||expected.revision!==undefined&&current.revision!==expected.revision)fail('MATERIAL_TARGET_IDENTITY_CHANGED');return host.importState(current.id,async state=>{await admission(current.id,planId);return operation({entries:domain=>domain==='bank'?state.bankQuestions.entries():state.knowledgeEntries.entries(),read:(domain,id)=>domain==='bank'?state.bankQuestions.get(id):state.knowledgeEntries.get(id),write:(domain,id,value)=>domain==='bank'?state.bankQuestions.put(id,bankQuestion.parse(value)):state.knowledgeEntries.put(id,knowledgeEntry.parse(value))})})}},
  privacy:{mark:async(instanceId,ids,sourceRevision)=>{for(const id of ids)await privacy.put(privateKnowledgeKey(instanceId,id),{instanceId,id,sourceRevision})}},
 })
 const run=<T>(operation:()=>Promise<T>)=>{if(closing)return Promise.reject(Error('Material importer is stopping'));const task=Promise.resolve().then(operation);pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task}
 const owned=async(viewId:string,id:string)=>{const current=await target(viewId),row=await workflow.inspect(id);if(row.plan.target.instanceId!==current.instanceId)fail('MATERIAL_PLAN_VIEW_MISMATCH');return row}
 return {
  prepare:(viewId:string)=>run(async()=>{
   const selected=await target(viewId);await admission(selected.instanceId);const snapshot=await capture(),proof=materialEvidenceSnapshot(snapshot)
   const materials=config.legacyMaterialRoot?(await inspectLegacyMaterialEvidence({snapshot:proof,materialRoot:config.legacyMaterialRoot})).evidence:undefined
   const raw=JSON.parse(Buffer.from(snapshot.files[1]!.bytesBase64,'base64').toString()).tables.entries
   const privateIds=Object.entries(raw).filter(([id,row])=>(row as {kind:string}).kind!=='笔记'&&!materials?.entries.some(entry=>entry.id===id)).map(([id])=>id)
   const privateEvidence=config.legacyMaterialRoot?(await inspectLegacyPrivateAssets({snapshot:proof,materialRoot:config.legacyMaterialRoot,privateEntryIds:privateIds})).evidence:undefined
   const questionRoot=config.questionImageRoot.get(),bank=questionRoot?(await inspectLegacyBankImageEvidence({snapshot:proof,questionImageRoot:questionRoot,mineruRoot:config.mineru.get()?.outputDir})).evidence:undefined
   const plan=prepareMaterialImport({snapshot,target:selected,assetEvidence:{...(materials?{materials}:{}),...(privateEvidence?{private:privateEvidence}:{}),...(bank?{bank}:{})}})
   await workflow.remember(plan);return materialPreview(plan)
  }),
  list:(viewId:string)=>run(async()=>{const current=await target(viewId);return [...journals.entries()].filter(([,row])=>row.instanceId===current.instanceId).map(([id,row])=>{const stored=plans.get(id);if(!stored||stored.fingerprint!==row.planFingerprint)fail('MATERIAL_CHECKPOINT_INVALID');return materialPreview(stored.plan,row.status)})}),
  inspect:(viewId:string,id:string)=>run(async()=>{const row=await owned(viewId,id);return materialPreview(row.plan,row.status)}),
  exportPlan:(viewId:string,id:string)=>run(async()=>structuredClone((await owned(viewId,id)).plan)),
  apply:(viewId:string,input:{id:string;fingerprint:string;confirmed:boolean})=>run(async()=>{const intent=await owned(viewId,input.id);await admission(intent.plan.target.instanceId,input.id);const row=await workflow.apply(input);return materialPreview(row.plan,row.status)}),
  async close(){closing=true;await Promise.allSettled([...pending]);await workflow.close()},
 }
}
