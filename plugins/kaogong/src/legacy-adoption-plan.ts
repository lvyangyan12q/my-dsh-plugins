import {createHash,randomUUID} from 'node:crypto'
import {isAbsolute} from 'node:path'
import type {RoleAdoptionPreview} from 'dsh-worktable/sdk'
import {questionRecord,planConfig,dayPlan,bankQuestion,knowledgeEntry,practiceRound} from './schemas.ts'
import {lessonRecord,lessonSelection} from './lesson-schema.ts'
import {roleSubjects,subjectRoleIds} from './role-definitions.ts'
import type {LegacyMaterialEvidence} from './legacy-material-evidence.mjs'
export function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
 if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>JSON.stringify(key)+':'+canonical(value)).join(',')+'}'
 return JSON.stringify(value)
}
export const fingerprint=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex')
const bytesHash=(value:Buffer)=>createHash('sha256').update(value).digest('hex')
function fail(code:string):never{throw Object.assign(new Error(code),{code})}
const specs={kaogong_bank:['bank',2,'questions',bankQuestion],kaogong_knowledge:['knowledge',1,'entries',knowledgeEntry],kaogong_lessons:['lessons',1,'lessons',lessonRecord],kaogong_notebook:['notebook',1,'questions',questionRecord],kaogong_practice:['practice',1,'rounds',practiceRound],kaogong_progress:['progress',1,'days',dayPlan]} as const
type Domain=typeof specs[keyof typeof specs][0]
export type LegacyInspectionSnapshot={format:string;formatVersion:number;private:true;sourceHome:string;sourceRevision:string;files:{name:string;sourcePath:string;resolvedPath:string;version:number;table:string;sha256:string;bytesBase64:string}[]}
export type RoleInput={sourceKey:string;roleId:string;revision:string;binding:Record<string,unknown>}
type Inspection=Pick<RoleAdoptionPreview,'status'|'fingerprint'|'blockers'|'source'|'native'>
export type LegacyAdoptionPlan={
 format:'kaogong-adoption-plan';formatVersion:1;private:true;id:string;status:'ready'|'blocked';fingerprint:string
 source:{home:string;revision:string;files:{name:string;resolvedPath:string;sha256:string;version:number}[]}
 targets:{history:{instanceId:string;viewId:string;appId:'kaogong';projectId:null};library:{instanceId:string;viewId:string;appId:'kaogong-library';projectId:null}}
 records:{domain:Domain;target:'history'|'library';key:string;value:unknown;hash:string}[]
 globals:{domain:'progress'|'lessons';target:'history';value:unknown;hash:string}[]
 roles:(RoleInput&{inspection:Inspection})[];privateKnowledgeIds:string[];counts:Record<string,number>
 readOnlyGrants:{resourceId:'question-bank'|'materials';owner:'library';consumer:'history'}[]
 assetEvidence?:{materials?:LegacyMaterialEvidence}
 blockers:{code:string;roleId?:string}[]
 rollback:{mode:'journal-only-no-source-or-profile-restore';schemaGate:5;sourceWrites:0;nativeMessagesCopied:false;newerTargetRows:'never-overwrite-or-delete';legacyAssets:'preserved-unadopted-until-verified-owner-manifest'}
}
function exact(schema:{safeParse(value:unknown):{success:boolean;data?:unknown}},value:unknown){const result=schema.safeParse(value);if(!result.success||canonical(result.data)!==canonical(value))fail('LEGACY_RECORD_UNSUPPORTED_OR_LOSSY')}
/** Pure preparation over a private byte snapshot. No domain, native Session or target is created. */
export function legacyRoleInput(sourceRevision:string,id:string,binding:Record<string,unknown>):RoleInput|null{
 const key=binding.key as {appId?:string;roleId?:string;subject?:string}
 if(key?.appId!=='kaogong')return null
 let roleId=key.roleId
 if(roleId==='teacher'&&key.subject){const index=roleSubjects.indexOf(key.subject);if(index<0)fail('LEGACY_SUBJECT_UNMAPPED');roleId=subjectRoleIds[index]}
 if(!roleId||!['teacher','class-advisor','counselor',...subjectRoleIds].includes(roleId))fail('LEGACY_ROLE_UNMAPPED')
 return {sourceKey:'legacy.'+fingerprint([sourceRevision,id]),roleId,revision:sourceRevision,binding:structuredClone(binding)}
}
export async function prepareLegacyAdoption({snapshot,inspectRole,materialEvidence}:{snapshot:LegacyInspectionSnapshot;inspectRole:(input:RoleInput)=>Promise<Inspection>;materialEvidence?:LegacyMaterialEvidence}):Promise<LegacyAdoptionPlan>{
 if(snapshot?.format!=='kaogong-legacy-inspection'||snapshot.formatVersion!==1||snapshot.private!==true||!isAbsolute(snapshot.sourceHome)||snapshot.files.length!==7)fail('LEGACY_SNAPSHOT_INVALID')
 const expected=[...Object.keys(specs),'personal_workbench_role_bindings']
 if(snapshot.files.some((row,index)=>row.name!==expected[index]))fail('LEGACY_SNAPSHOT_INVALID')
 const sourceRevision=createHash('sha256').update(JSON.stringify(snapshot.files.map(({name,sha256,resolvedPath})=>[name,sha256,resolvedPath]))).digest('hex')
 if(sourceRevision!==snapshot.sourceRevision)fail('LEGACY_SNAPSHOT_REVISION_CHANGED')
 if(materialEvidence&&materialEvidence.sourceRevision!==sourceRevision)fail('LEGACY_MATERIAL_SOURCE_CHANGED')
 const rawMaterials=new Map(materialEvidence?.entries.map(row=>[row.id,row])??[])
 if(rawMaterials.size!==(materialEvidence?.entries.length??0))fail('LEGACY_MATERIAL_SOURCE_CHANGED')
 const targets={history:{instanceId:randomUUID(),viewId:randomUUID(),appId:'kaogong' as const,projectId:null},library:{instanceId:randomUUID(),viewId:randomUUID(),appId:'kaogong-library' as const,projectId:null}}
 const records:LegacyAdoptionPlan['records']=[],globals:LegacyAdoptionPlan['globals']=[],roles:LegacyAdoptionPlan['roles']=[],privateKnowledgeIds:string[]=[],counts:Record<string,number>={},blockers:LegacyAdoptionPlan['blockers']=[]
 for(const file of snapshot.files){
  const bytes=Buffer.from(file.bytesBase64,'base64');if(bytesHash(bytes)!==file.sha256)fail('LEGACY_SNAPSHOT_BYTES_CHANGED')
  let data;try{data=JSON.parse(bytes.toString('utf8'))}catch{fail('LEGACY_SNAPSHOT_INVALID')}
  if(data.unit?.name!==file.name||data.unit?.version!==file.version||!data.tables||Object.keys(data.tables).length!==1||!data.tables[file.table])fail('LEGACY_SNAPSHOT_INVALID')
  if(file.name==='personal_workbench_role_bindings'){
   if(file.version!==1||file.table!=='bindings')fail('LEGACY_SNAPSHOT_INVALID')
   for(const [id,value] of Object.entries(data.tables.bindings)){
    const input=legacyRoleInput(sourceRevision,id,value as Record<string,unknown>);if(!input)continue
    const inspection=await inspectRole(input);if(inspection.status!=='ready'||!inspection.fingerprint)blockers.push({code:'LEGACY_NATIVE_IDENTITY_BLOCKED',roleId:input.roleId})
    if(input.binding.phase==='intent')counts.pendingRoleIntents=(counts.pendingRoleIntents??0)+1
    roles.push({...input,inspection})
   }
   continue
  }
  const spec=specs[file.name as keyof typeof specs];if(!spec||file.version!==spec[1]||file.table!==spec[2])fail('LEGACY_SNAPSHOT_INVALID')
  const [domain,,,schema]=spec;const rows=Object.entries(data.tables[file.table]);counts[domain]=rows.length
  if(domain==='progress'){exact(planConfig,data.global);globals.push({domain,target:'history',value:data.global,hash:fingerprint(data.global)})}
  else if(domain==='lessons'){exact(lessonSelection,data.global);const value={...data.global,instanceId:targets.history.instanceId};globals.push({domain,target:'history',value,hash:fingerprint(value)})}
  else if(data.global!==null)fail('LEGACY_GLOBAL_UNSUPPORTED')
  for(const [key,original] of rows){
   if(!key)fail('LEGACY_RECORD_INVALID');exact(schema,original)
   const row=original as Record<string,unknown>,value=domain==='lessons'?{...row,instanceId:targets.history.instanceId,roleKey:{...(row.roleKey as object),instanceId:targets.history.instanceId}}:original
   if(domain==='lessons')exact(lessonRecord,value)
   const proof=domain==='knowledge'?rawMaterials.get(key):undefined
   if(proof&&(row.kind==='笔记'||typeof row.content!=='string'||bytesHash(Buffer.from(row.content))!==proof.sourceContentSha256))fail('LEGACY_MATERIAL_SOURCE_CHANGED')
   if(domain==='knowledge'&&!proof)privateKnowledgeIds.push(key)
   if(domain==='practice'&&row.review==='sending')counts.unknownReviews=(counts.unknownReviews??0)+1
   if(domain==='practice'&&Number(row.projectedRevision)<Number(row.revision))counts.pendingProjections=(counts.pendingProjections??0)+1
   records.push({domain,target:domain==='bank'||proof?'library':'history',key,value,hash:fingerprint(value)})
  }
 }
 const body={format:'kaogong-adoption-plan' as const,formatVersion:1 as const,private:true as const,id:randomUUID(),status:blockers.length?'blocked' as const:'ready' as const,source:{home:snapshot.sourceHome,revision:sourceRevision,files:snapshot.files.map(({name,resolvedPath,sha256,version})=>({name,resolvedPath,sha256,version}))},targets,records,globals,roles,privateKnowledgeIds,counts,readOnlyGrants:[{resourceId:'question-bank' as const,owner:'library' as const,consumer:'history' as const}],blockers,rollback:{mode:'journal-only-no-source-or-profile-restore' as const,schemaGate:5 as const,sourceWrites:0 as const,nativeMessagesCopied:false as const,newerTargetRows:'never-overwrite-or-delete' as const,legacyAssets:'preserved-unadopted-until-verified-owner-manifest' as const}}
 if([...rawMaterials.keys()].some(id=>!records.some(row=>row.domain==='knowledge'&&row.key===id)))fail('LEGACY_MATERIAL_SOURCE_CHANGED')
 const readOnlyGrants:LegacyAdoptionPlan['readOnlyGrants']=[...body.readOnlyGrants];if(rawMaterials.size)readOnlyGrants.push({resourceId:'materials',owner:'library',consumer:'history'});const complete={...body,readOnlyGrants,...(materialEvidence?{assetEvidence:{materials:structuredClone(materialEvidence)}}:{})}
 return {...complete,fingerprint:fingerprint(complete)}
}
