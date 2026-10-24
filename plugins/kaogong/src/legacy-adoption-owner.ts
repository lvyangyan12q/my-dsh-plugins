import type {Context} from '@deepseek-ai/cordis'
import type {Domain} from '@deepseek-ai/dsh-storage-domain'
import type {LegacyRoleSnapshot,CapabilityRef} from 'dsh-worktable/sdk'
import {isAbsolute} from 'node:path'
import {inspectLegacy} from './legacy-inspection.mjs'
import {legacyRoleInput,prepareLegacyAdoption,type LegacyInspectionSnapshot,type LegacyAdoptionPlan} from './legacy-adoption-plan.ts'
import {LegacyAdoptionWorkflow} from './legacy-adoption-workflow.ts'
import {adoptionDomain,adoptionPlansDomain,privateKnowledgeKey} from './legacy-adoption-state.ts'
import {adoptionTarget} from './adoption-target.ts'
import type {KaogongHost} from './instance-host.ts'
import type {Config} from './business.ts'
import {adoptionPreview} from './adoption-preview.ts'
import {revalidatePlanSource} from './legacy-plan-source.ts'
import {inspectAdoptionEvidence,pinAdoptionEvidence,revalidateAdoptionEvidence} from './adoption-evidence.ts'
function fail(code:string):never{throw Object.assign(new Error(code),{code})}
function source(snapshot:LegacyInspectionSnapshot,sourceKey:string,roleId:string):LegacyRoleSnapshot|null{
 const file=snapshot.files.find(row=>row.name==='personal_workbench_role_bindings');if(!file)return null
 const rows=JSON.parse(Buffer.from(file.bytesBase64,'base64').toString('utf8')).tables.bindings
 for(const [id,value]of Object.entries(rows)){
  const input=legacyRoleInput(snapshot.sourceRevision,id,value as Record<string,unknown>);if(!input||input.sourceKey!==sourceKey||input.roleId!==roleId)continue
  const row=input.binding,creation=row.creation as {cwd?:unknown},previous=row.previousSessionIds
  if(typeof row.sessionId!=='string'||typeof row.presetId!=='string'||typeof creation?.cwd!=='string'||!isAbsolute(creation.cwd)||!['intent','ready'].includes(String(row.phase))||!Array.isArray(previous)||!previous.every((value):value is string=>typeof value==='string')||row.selectedPreset!==undefined&&typeof row.selectedPreset!=='boolean')fail('LEGACY_ROLE_SOURCE_INVALID')
  let agent:CapabilityRef&{kind:'agent'}|undefined
  if(row.agent!==undefined){const value=row.agent as {kind?:unknown;source?:unknown;id?:unknown;ownerAppId?:unknown};if(value.kind!=='agent'||typeof value.id!=='string')fail('LEGACY_AGENT_UNMAPPED');if(value.source==='managed')agent={kind:'agent',source:'managed',id:value.id};else if(value.source==='application'&&typeof value.ownerAppId==='string')agent={kind:'agent',source:'application',id:value.id,ownerAppId:value.ownerAppId};else fail('LEGACY_AGENT_UNMAPPED')}
  return {sourceKey,revision:input.revision,roleId,sessionId:row.sessionId,presetId:row.presetId,creation:{cwd:creation.cwd},phase:row.phase==='ready'?'ready':'intent',previousSessionIds:previous, ...(typeof row.selectedPreset==='boolean'?{selectedPreset:row.selectedPreset}:{}),...(agent?{agent}:{})}
 }
 return null
}
/** Authenticated Host-owned preparation/import service. Merely mounting it never reads the legacy home. */
export function createAdoptionOwner(ctx:Context,host:KaogongHost,metadata:Domain<typeof adoptionDomain>,planMetadata:Domain<typeof adoptionPlansDomain>,config:Config){
 const journals=metadata.table('journals'),plans=planMetadata.table('plans'),privacy=metadata.table('private_knowledge')
 let closing=false;const pending=new Set<Promise<unknown>>()
 const capture=async()=>{if(!config.legacySourceHome||!isAbsolute(config.legacySourceHome))fail('EXPLICIT_LEGACY_HOME_REQUIRED');return (await inspectLegacy({home:config.legacySourceHome})).snapshot}
 const removeSource=config.legacySourceHome?ctx.worktableRoles.contributeLegacy('kaogong',{
  inspectSource:async(sourceKey,{roleId})=>source(await capture(),sourceKey,roleId),
  inspect:async(sourceKey,{roleId})=>source(await capture(),sourceKey,roleId),
 }):()=>{}
 const workflow=new LegacyAdoptionWorkflow({
  store:{read:async id=>{const row=journals.get(id);if(!row)return null;const stored=plans.get(row.planId);if(!stored||stored.fingerprint!==row.planFingerprint||stored.id!==row.id)fail('ADOPTION_CHECKPOINT_INVALID');const {planId,planFingerprint,...journal}=row;return {...journal,plan:stored.plan}},write:async row=>{const {plan,...journal}=row,stored=plans.get(plan.id);if(stored&&stored.fingerprint!==plan.fingerprint)fail('ADOPTION_INTENT_CONFLICT');if(!stored)await plans.put(plan.id,{id:plan.id,fingerprint:plan.fingerprint,plan});await journals.put(row.id,{...journal,planId:plan.id,planFingerprint:plan.fingerprint})}},
  source:{verify:async(plan,phase)=>{if(!config.legacySourceHome)fail('EXPLICIT_LEGACY_HOME_REQUIRED');await revalidatePlanSource(plan,config.legacySourceHome);if(phase)await revalidateAdoptionEvidence(plan,await capture());if(phase)for(const role of plan.roles){const inspection=await ctx.worktableRoles.inspectLegacySource('kaogong',role.roleId,role.sourceKey);if(inspection.status!=='ready'||inspection.fingerprint!==role.inspection.fingerprint)fail('LEGACY_NATIVE_SOURCE_CHANGED')}}},
  applications:ctx.worktableApplications,
  target:{run:(instanceId,operation)=>host.importState(instanceId,state=>operation(adoptionTarget(state)))},
  privacy:{markPrivate:async(instanceId,ids,sourceRevision)=>{for(const id of ids)await privacy.put(privateKnowledgeKey(instanceId,id),{instanceId,id,sourceRevision})}},
  roles:{apply:async(plan,role)=>{
   const fresh=await ctx.worktableRoles.inspectLegacySource('kaogong',role.roleId,role.sourceKey)
   if(fresh.status!=='ready'||fresh.fingerprint!==role.inspection.fingerprint)fail('LEGACY_NATIVE_SOURCE_CHANGED')
   const preview=await ctx.worktableRoles.previewAdoption(plan.targets.history.instanceId,role.roleId,role.sourceKey)
   if(preview.status==='blocked'||preview.sourceFingerprint!==role.inspection.fingerprint||!preview.fingerprint)fail('LEGACY_NATIVE_TARGET_BLOCKED')
   await ctx.worktableRoles.applyAdoption(plan.targets.history.instanceId,role.roleId,role.sourceKey,preview.fingerprint,true)
  }},
  grants:{ensure:async(plan,grant)=>{
   if(typeof ctx.worktableResources.connection!=='function')fail('RESOURCE_CONNECTION_INSPECTION_REQUIRED')
   const current=await ctx.worktableResources.connection({viewId:plan.targets.history.viewId,ownerViewId:plan.targets.library.viewId,resourceId:grant.resourceId})
   if(current.status==='active'){if(current.connection?.allowedActions.some(action=>action!=='read'))fail('LEGACY_GRANT_CHANGED');return}
   if(current.status!=='none')fail('LEGACY_GRANT_CHANGED')
   await ctx.worktableResources.share({ownerViewId:plan.targets.library.viewId,consumerInstanceId:plan.targets.history.instanceId,resourceId:grant.resourceId})
  }},
 })
 const run=<T>(operation:()=>Promise<T>)=>{if(closing)return Promise.reject(Error('Adoption service is stopping'));const task=Promise.resolve().then(operation);pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task}
 return {
  prepare:()=>run(async()=>{const snapshot=await capture(),evidence=await inspectAdoptionEvidence(snapshot,{materialRoot:config.mineru.get()?.outputDir,questionImageRoot:config.questionImageRoot.get()});const plan=pinAdoptionEvidence(await prepareLegacyAdoption({snapshot,materialEvidence:evidence.materials,inspectRole:input=>ctx.worktableRoles.inspectLegacySource('kaogong',input.roleId,input.sourceKey)}),evidence);await workflow.remember(plan);return adoptionPreview(plan)}),
  inspect:(id:string)=>run(async()=>{const row=await workflow.inspect(id);return adoptionPreview(row.plan,row.status)}),
  apply:(input:{id:string;fingerprint:string;confirmed:boolean})=>run(()=>ctx.worktableApplications.withProvision(input.id,async()=>{const row=await workflow.apply(input);return adoptionPreview(row.plan,row.status)})),
  exportPlan:(id:string)=>run(async()=>structuredClone((await workflow.inspect(id)).plan)),
  async close(){closing=true;await Promise.allSettled([...pending]);await workflow.close();await removeSource()},
 }
}
