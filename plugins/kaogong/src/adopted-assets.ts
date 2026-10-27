import {createHash} from 'node:crypto'
import type {StudySources as ResourceDirectory} from './study-sources.ts'
import {fingerprint,type LegacyAdoptionPlan} from './legacy-adoption-plan.ts'
import {readLegacyMaterialAsset} from './legacy-material-evidence.mjs'
import {readLegacyBankImageAsset} from './legacy-bank-image-evidence.mjs'
import {readLegacyPrivateAsset} from './legacy-private-assets.mjs'
import type {Rows} from './host-resources.ts'
import type {MaterialImportPlan} from './materials-plan.ts'
import {materialLocationIO,assertRelocatedEvidence} from './material-location.ts'
export type ProvenAssetPlan=LegacyAdoptionPlan|MaterialImportPlan
const libraryId=(plan:ProvenAssetPlan)=>plan.format==='kaogong-material-import-plan'?plan.target.instanceId:plan.targets.library.instanceId
const privateOwnerId=(plan:ProvenAssetPlan)=>plan.format==='kaogong-material-import-plan'?plan.target.instanceId:plan.targets.history.instanceId
function deny():never{throw Object.assign(Error('This exact image reference is not authorized'),{code:'LEGACY_ASSET_UNAVAILABLE'})}
const contentHash=(value:string)=>createHash('sha256').update(value).digest('hex')
export type AdoptedAssetReaders={material:typeof readLegacyMaterialAsset;bank:typeof readLegacyBankImageAsset;private:typeof readLegacyPrivateAsset}
/** All paths, source IDs and binding keys come from immutable trusted plans, never request fields. */
export async function readAdoptedAsset(input:{
 kind:'knowledge'|'bank';id:string;reference:string;instanceId:string;viewId:string
 ownRecord:unknown;plans:readonly ProvenAssetPlan[];resources:Pick<ResourceDirectory,'call'>
 readers?:AdoptedAssetReaders
}){
 if(!input.id||input.id.length>1024||!input.reference||input.reference.length>8192)deny()
 const resourceId=input.kind==='bank'?'question-bank':'materials'
 const readers=input.readers??{material:readLegacyMaterialAsset,bank:readLegacyBankImageAsset,private:readLegacyPrivateAsset}
 let current=input.ownRecord,owner=input.instanceId
 let capture:Awaited<ReturnType<ResourceDirectory['call']>>|undefined
 if(current===undefined){
  const source=await input.resources.call<Rows<unknown>>({viewId:input.viewId,resourceId,action:'read'})
  capture=source;owner=source.value.ownerInstanceId??deny();current=source.value.rows.find(([id])=>id===input.id)?.[1]
 }
 if(current===undefined)deny()
 const domain=input.kind==='bank'?'bank':'knowledge'
 const candidates=input.plans.filter(plan=>{
  if(plan.format==='kaogong-material-import-plan')return owner===plan.target.instanceId&&plan.records.some(row=>row.domain===domain&&row.key===input.id&&row.hash===fingerprint(current))
  const target=owner===plan.targets.history.instanceId?'history':owner===plan.targets.library.instanceId?'library':null
  return target&&plan.records.some(row=>row.domain===domain&&row.key===input.id&&row.target===target&&row.hash===fingerprint(current))
 })
 if(candidates.length!==1)deny()
 const plan=candidates[0]!,{fingerprint:expected,...body}=plan
 if(fingerprint(body)!==expected)deny()
 const location=plan.format==='kaogong-material-import-plan'?plan.location:undefined
 const io=await materialLocationIO(location)
 assertRelocatedEvidence(location,plan.assetEvidence?.materials)
 let bytes:Buffer
 if(input.kind==='bank'){
  const evidence=plan.assetEvidence?.bank,question=evidence?.questions.find(row=>row.questionId===input.id)
  const selected=question?.assets.flatMap(asset=>asset.bindings.filter(binding=>binding.reference===input.reference).map(binding=>({asset,binding})))??[]
  if(!evidence||!selected.length||new Set(selected.map(row=>row.asset.asset)).size!==1)deny()
  const {asset,binding}=selected[0]!
  bytes=await readers.bank({evidence,questionId:input.id,asset:asset.asset,bindingKey:binding.bindingKey,io})
 }else{
  const privateEvidence=plan.assetEvidence?.private,entry=privateEvidence?.entries.find(row=>row.id===input.id)
  if(entry){
   if(owner!==input.instanceId||owner!==privateOwnerId(plan)||!plan.privateKnowledgeIds.includes(input.id))deny()
   const bindings=entry.bindings.filter(row=>row.src===input.reference)
   if(!bindings.length||new Set(bindings.map(row=>row.asset)).size!==1)deny()
   const binding=bindings[0]!
   bytes=await readers.private({evidence:privateEvidence!,entryId:input.id,jobId:entry.jobId,asset:binding.asset,bindingKey:binding.bindingKey,currentRecord:current,access:{kind:plan.format==='kaogong-material-import-plan'?'private-material-library':'private-history',ownerInstanceId:owner,instanceId:input.instanceId},io})
  }else{
   const evidence=plan.assetEvidence?.materials,entry=evidence?.entries.find(row=>row.id===input.id),content=(current as {content?:unknown}).content
   if(!evidence||!entry||owner!==libraryId(plan)||typeof content!=='string'||contentHash(content)!==entry.sourceContentSha256)deny()
   const refs=[...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(row=>row[1])
   if(!refs.includes(input.reference))deny()
   const url=new URL(input.reference,'http://kaogong.local')
   const assets=url.searchParams.getAll('asset'),jobs=url.searchParams.getAll('id')
   if(url.pathname!=='/api/kaogong/document-image'||jobs.length!==1||jobs[0]!==entry.jobId||assets.length!==1||!entry.assets.some(row=>row.asset===assets[0]))deny()
   bytes=await readers.material({evidence,entryId:input.id,asset:assets[0]!,io})
  }
 }
 // A file read can outlive permission changes. Reauthorize the same guarded resource and source receipt.
 if(capture){
  const fresh=await input.resources.call<Rows<unknown>>({viewId:input.viewId,resourceId,action:'read'})
  if(fingerprint(capture.connection)!==fingerprint(fresh.connection)||fingerprint(capture.value)!==fingerprint(fresh.value))deny()
 }
 return bytes
}
