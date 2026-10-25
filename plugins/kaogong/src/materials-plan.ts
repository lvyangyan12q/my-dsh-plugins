import {createHash,randomUUID} from 'node:crypto'
import {fingerprint,canonical,type LegacyInspectionSnapshot} from './legacy-adoption-plan.ts'
import {materialEvidenceSnapshot} from './materials-inspection.mjs'
import {bankQuestion,knowledgeEntry} from './schemas.ts'
import type {LegacyMaterialEvidence} from './legacy-material-evidence.mjs'
import type {LegacyBankImageEvidence} from './legacy-bank-image-evidence.mjs'
import type {LegacyPrivateAssetEvidence} from './legacy-private-assets.mjs'
export type MaterialSnapshot=LegacyInspectionSnapshot&{format:'kaogong-material-inspection'}
export type MaterialImportPlan={
 format:'kaogong-material-import-plan';formatVersion:1;private:true;id:string;fingerprint:string
 source:{home:string;revision:string;files:{name:string;resolvedPath:string;sha256:string;version:number}[]}
 target:{instanceId:string;viewId:string;appId:'kaogong-library';projectId:string|null;revision?:number}
 records:{domain:'bank'|'knowledge';key:string;value:unknown;hash:string}[]
 privateKnowledgeIds:string[];retainedNoteIds:string[];counts:Record<string,number>
 assetEvidence?:{materials?:LegacyMaterialEvidence;bank?:LegacyBankImageEvidence;private?:LegacyPrivateAssetEvidence}
 policy:{sourceWrites:0;nativeSessions:'not-read-or-adopted';learningRecords:'not-read-or-copied';sharing:'explicit-readonly-only';files:'original-paths-no-copy'}
}
function fail(code:string):never{throw Object.assign(Error(code),{code})}
export function prepareMaterialImport({snapshot,assetEvidence,target}:{snapshot:MaterialSnapshot;assetEvidence?:MaterialImportPlan['assetEvidence'];target?:MaterialImportPlan['target']}):MaterialImportPlan{
 materialEvidenceSnapshot(snapshot)
 if(assetEvidence&&Object.values(assetEvidence).some(value=>value.sourceRevision!==snapshot.sourceRevision))fail('MATERIAL_EVIDENCE_SOURCE_CHANGED')
 const proven=new Map(assetEvidence?.materials?.entries.map(row=>[row.id,row])??[]),records:MaterialImportPlan['records']=[],privateKnowledgeIds:string[]=[],retainedNoteIds:string[]=[]
 for(const file of snapshot.files){
  const data=JSON.parse(Buffer.from(file.bytesBase64,'base64').toString('utf8')),domain=file.name==='kaogong_bank'?'bank':'knowledge',schema=domain==='bank'?bankQuestion:knowledgeEntry
  if(data.unit?.name!==file.name||data.unit?.version!==file.version||data.global!==null||Object.keys(data.tables??{}).join()!==file.table)fail('MATERIAL_SOURCE_FORMAT_UNSUPPORTED')
  for(const[key,value]of Object.entries(data.tables[file.table])){
   const result=schema.safeParse(value);if(!key||!result.success||canonical(result.data)!==canonical(value))fail('MATERIAL_RECORD_UNSUPPORTED_OR_LOSSY')
   if(domain==='knowledge'){
    if((value as {kind:string}).kind==='笔记'){retainedNoteIds.push(key);continue}
    const proof=proven.get(key)
    if(proof&&proof.sourceContentSha256!==fingerprintContent((value as {content:string}).content))fail('MATERIAL_PROVEN_CONTENT_CHANGED')
    if(!proof)privateKnowledgeIds.push(key)
   }
   records.push({domain,key,value:structuredClone(value),hash:fingerprint(value)})
  }
 }
 if([...proven.keys()].some(id=>!records.some(row=>row.domain==='knowledge'&&row.key===id)))fail('MATERIAL_EVIDENCE_SOURCE_CHANGED')
 const evidenceFiles=[...(assetEvidence?.materials?.files??[]),...(assetEvidence?.bank?.files??[]),...(assetEvidence?.bank?.documentFiles??[]),...(assetEvidence?.private?.files??[])]
 const assetCounts={provenUniqueFiles:new Set(evidenceFiles.map(file=>file.resolvedPath)).size,bankReferenceBindings:assetEvidence?.bank?.questions.reduce((sum,row)=>sum+row.assets.reduce((total,asset)=>total+asset.bindings.length,0),0)??0,rawAssetReferences:assetEvidence?.materials?.entries.reduce((sum,row)=>sum+row.assets.length,0)??0,privateAssetReferences:assetEvidence?.private?.entries.reduce((sum,row)=>sum+row.bindings.length,0)??0,blockedBankReferences:assetEvidence?.bank?.unavailable.length??0,missingAssociationIndices:assetEvidence?.bank?.missingIndices.length??0,privateEntriesWithoutImageProof:assetEvidence?.private?.unprovenEntries.length??privateKnowledgeIds.length}
 const body={format:'kaogong-material-import-plan' as const,formatVersion:1 as const,private:true as const,id:randomUUID(),source:{home:snapshot.sourceHome,revision:snapshot.sourceRevision,files:snapshot.files.map(({name,resolvedPath,sha256,version})=>({name,resolvedPath,sha256,version}))},target:structuredClone(target??{instanceId:randomUUID(),viewId:randomUUID(),appId:'kaogong-library' as const,projectId:null}),records,privateKnowledgeIds,retainedNoteIds,counts:{...assetCounts,bank:records.filter(row=>row.domain==='bank').length,knowledge:records.filter(row=>row.domain==='knowledge').length,shareableMaterials:proven.size,privateMaterials:privateKnowledgeIds.length,notesRetainedAtSource:retainedNoteIds.length},...(assetEvidence?{assetEvidence:structuredClone(assetEvidence)}:{}),policy:{sourceWrites:0 as const,nativeSessions:'not-read-or-adopted' as const,learningRecords:'not-read-or-copied' as const,sharing:'explicit-readonly-only' as const,files:'original-paths-no-copy' as const}}
 return {...body,fingerprint:fingerprint(body)}
}

const fingerprintContent=(text:string)=>createHash('sha256').update(text).digest('hex')
export function validateMaterialPlan(plan:MaterialImportPlan){
 const {fingerprint:expected,...body}=plan
 if(plan.format!=='kaogong-material-import-plan'||plan.formatVersion!==1||plan.private!==true||expected!==fingerprint(body)||plan.records.some(row=>!['bank','knowledge'].includes(row.domain)||row.hash!==fingerprint(row.value)))fail('MATERIAL_PLAN_CHANGED')
}
