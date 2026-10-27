import {createHash} from 'node:crypto'
import {readFile,realpath,stat} from 'node:fs/promises'
import {resolve} from 'node:path'
import type {BankQuestionRecord} from './domain.ts'
import type {ProvenAssetPlan} from './adopted-assets.ts'
import type {LegacyBankImageEvidence} from './legacy-bank-image-evidence.mjs'
import {verifyLegacyBankPracticeEvidence,readLegacyBankImageAsset} from './legacy-bank-image-evidence.mjs'
import {loadVerifiedPracticeMaterials,loadVerifiedPracticeOptions,type VerifiedPracticeFiles} from './verified-practice-materials.ts'
import {fingerprint} from './legacy-adoption-plan.ts'
import {materialLocationIO,assertRelocatedEvidence} from './material-location.ts'
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex')
function fail():never{throw Error('练习资料的原图或核验索引已变化；请核对原资料并重新确认新计划。')}
function owns(plan:ProvenAssetPlan,owner:string,id:string,row:BankQuestionRecord){
 if(plan.format==='kaogong-material-import-plan')return plan.target.instanceId===owner&&plan.records.some(record=>record.domain==='bank'&&record.key===id&&record.hash===fingerprint(row))
 const target=owner===plan.targets.library.instanceId?'library':owner===plan.targets.history.instanceId?'history':null
 return target&&plan.records.some(record=>record.domain==='bank'&&record.target===target&&record.key===id&&record.hash===fingerprint(row))
}
function files(evidence:LegacyBankImageEvidence):VerifiedPracticeFiles{
 const receipts=new Map<string,LegacyBankImageEvidence['files'][number]>()
 for(const row of evidence.files)for(const path of [resolve(evidence.questionImageRoot,row.relativePath),row.resolvedPath]){const previous=receipts.get(path);if(previous&&(previous.sha256!==row.sha256||previous.resolvedPath!==row.resolvedPath))fail();receipts.set(path,row)}
 const pinned=async(path:string)=>{const receipt=receipts.get(resolve(path));if(!receipt||await realpath(path)!==receipt.resolvedPath)fail();return receipt}
 return {realpath:async path=>{if(resolve(path)===resolve(evidence.questionImageRoot)){const actual=await realpath(path);if(actual!==evidence.questionImageRoot)fail();return actual}return (await pinned(path)).resolvedPath},stat:async path=>{await pinned(path);return stat(path)},readFile:async path=>{const receipt=await pinned(path),bytes=await readFile(receipt.resolvedPath);if(sha(bytes)!==receipt.sha256)fail();return bytes}}
}
/** Presentation only. Every transformation belongs to the current authorized owner and an immutable applied plan. */
export async function prepareBankPracticeDisplay(input:{instanceId:string;ownBank:{get(id:string):BankQuestionRecord|undefined};rows:Iterable<[string,BankQuestionRecord]>;externalOwner?:string;plans:readonly ProvenAssetPlan[];revalidate():Promise<void>}){
 const checked=new Set<ProvenAssetPlan>(),groups=new Map<ProvenAssetPlan,[string,BankQuestionRecord][]>(),stems=new Map<string,{before:string;after:string}>(),options=new Map<string,{stem:string;before:string;after:string[]}>()
 for(const[id,row]of input.rows){const owner=input.ownBank.get(id)!==undefined?input.instanceId:input.externalOwner;if(!owner)continue
  const candidates=input.plans.filter(plan=>owns(plan,owner,id,row));if(candidates.length!==1)continue
  const plan=candidates[0]!;if(!checked.has(plan)){const {fingerprint:expected,...body}=plan;if(fingerprint(body)!==expected)fail();checked.add(plan)}
  if(!plan.assetEvidence?.bank)continue;const rows=groups.get(plan)??[];rows.push([id,row]);groups.set(plan,rows)
 }
 for(const[plan,rows]of groups){const evidence=plan.assetEvidence!.bank!,indices=new Set(evidence.files.map(row=>row.relativePath)),hasStem=indices.has('verified/associations.json'),hasOptions=indices.has('verified/option-repairs.json');if(!hasStem&&!hasOptions)continue
  const location=plan.format==='kaogong-material-import-plan'?plan.location:undefined
  const locationIO=await materialLocationIO(location);assertRelocatedEvidence(location,plan.assetEvidence?.materials)
  try{await verifyLegacyBankPracticeEvidence({evidence,io:locationIO})}catch{fail()}
  const io=files(evidence);let stem:(id:string,value:string)=>string,option:(id:string,stem:string,values:string[])=>string[]
  try{stem=hasStem?await loadVerifiedPracticeMaterials(evidence.questionImageRoot,io):(_id,value)=>value;option=hasOptions?await loadVerifiedPracticeOptions(evidence.questionImageRoot,io):(_id,_stem,values)=>values}catch{fail()}
  for(const[id,row]of rows){if(evidence.unavailable.some(value=>value.questionId===id))continue
   const question=evidence.questions.find(value=>value.questionId===id),manual=question?.proofs.some(value=>value.kind==='stem-association'&&value.indexRelativePath==='verified/associations.json')
   const projectedStem=manual&&question?.recordSha256===fingerprint(row)?stem(id,row.stem):row.stem,projectedOptions=option(id,row.stem,row.options)
   if(projectedStem===row.stem&&JSON.stringify(projectedOptions)===JSON.stringify(row.options))continue
   if(question){if(question.recordSha256!==fingerprint(row))fail();for(const asset of question.assets)for(const binding of asset.bindings)try{await readLegacyBankImageAsset({evidence,questionId:id,asset:asset.asset,bindingKey:binding.bindingKey,io:locationIO})}catch{fail()}}
   stems.set(id,{before:row.stem,after:projectedStem});options.set(id,{stem:row.stem,before:sha(JSON.stringify(row.options)),after:[...projectedOptions]})
  }
  try{await verifyLegacyBankPracticeEvidence({evidence,io:locationIO})}catch{fail()}
 }
 await input.revalidate()
 return {materialStem:(id:string,stem:string)=>{const value=stems.get(id);return value?.before===stem?value.after:stem},materialOptions:(id:string,stem:string,values:string[])=>{const value=options.get(id);return value?.stem===stem&&value.before===sha(JSON.stringify(values))?[...value.after]:values}}
}
