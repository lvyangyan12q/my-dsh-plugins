import {join} from 'node:path'
import {inspectLegacyMaterialEvidence,revalidateLegacyMaterialEvidence} from './legacy-material-evidence.mjs'
import {inspectLegacyBankImageEvidence,revalidateLegacyBankImageEvidence} from './legacy-bank-image-evidence.mjs'
import {inspectLegacyPrivateAssets,revalidateLegacyPrivateAssets} from './legacy-private-assets.mjs'
import {fingerprint,type LegacyInspectionSnapshot,type LegacyAdoptionPlan} from './legacy-adoption-plan.ts'

/** Explicit configured roots are read only on concrete preparation, never plugin activation. */
export async function inspectAdoptionEvidence(snapshot:LegacyInspectionSnapshot,roots:{materialRoot?:string;questionImageRoot?:string}){
 const materials=roots.materialRoot?(await inspectLegacyMaterialEvidence({snapshot,materialRoot:roots.materialRoot})).evidence:undefined
 const file=snapshot.files.find(row=>row.name==='kaogong_knowledge')!
 const rows=JSON.parse(Buffer.from(file.bytesBase64,'base64').toString()).tables.entries
 const positives=new Set(materials?.entries.map(row=>row.id)??[])
 const privateEntryIds=Object.keys(rows).filter(id=>!positives.has(id))
 const privateEvidence=roots.materialRoot?(await inspectLegacyPrivateAssets({snapshot,materialRoot:roots.materialRoot,privateEntryIds})).evidence:undefined
 const bank=roots.questionImageRoot?(await inspectLegacyBankImageEvidence({snapshot,questionImageRoot:roots.questionImageRoot,mineruRoot:roots.materialRoot?join(roots.materialRoot,'storage/mineru'):undefined})).evidence:undefined
 return {...(materials?{materials}:{}),...(privateEvidence?{private:privateEvidence}:{}),...(bank?{bank}:{})}
}
export function pinAdoptionEvidence(plan:LegacyAdoptionPlan,evidence:NonNullable<LegacyAdoptionPlan['assetEvidence']>):LegacyAdoptionPlan{
 if(Object.values(evidence).some(value=>value.sourceRevision!==plan.source.revision))throw Error('LEGACY_EVIDENCE_SOURCE_CHANGED')
 const {fingerprint:_,...body}=plan
 const counts={...body.counts,rawMaterials:evidence.materials?.entries.length??0,privateImageBindings:evidence.private?.entries.reduce((sum,row)=>sum+row.bindings.length,0)??0,bankImageBindings:evidence.bank?.questions.reduce((sum,row)=>sum+row.assets.reduce((total,asset)=>total+asset.bindings.length,0),0)??0,rawMaterialImages:evidence.materials?.entries.reduce((sum,row)=>sum+row.assets.length,0)??0}
 const complete={...body,counts,assetEvidence:structuredClone(evidence)}
 return {...complete,fingerprint:fingerprint(complete)}
}
/** Full dependency proof at entry/exit; cheap seven-source hashes guard bounded record chunks. */
export async function revalidateAdoptionEvidence(plan:LegacyAdoptionPlan,snapshot:LegacyInspectionSnapshot){
 const evidence=plan.assetEvidence
 if(evidence?.materials)await revalidateLegacyMaterialEvidence({snapshot,materialRoot:evidence.materials.requestedMaterialRoot,evidence:evidence.materials})
 if(evidence?.private)await revalidateLegacyPrivateAssets({snapshot,materialRoot:evidence.private.requestedMaterialRoot,privateEntryIds:plan.privateKnowledgeIds,evidence:evidence.private})
 if(evidence?.bank)await revalidateLegacyBankImageEvidence({snapshot,questionImageRoot:evidence.bank.requestedQuestionImageRoot,mineruRoot:evidence.bank.documentRoot?.requestedMineruRoot,evidence:evidence.bank})
}
