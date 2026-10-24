import {fingerprint,type LegacyAdoptionPlan} from './legacy-adoption-plan.ts'
type RecordStep=LegacyAdoptionPlan['records'][number]
type GlobalStep=LegacyAdoptionPlan['globals'][number]
export interface AdoptionTarget {
 read(domain:RecordStep['domain'],key:string):unknown
 write(domain:RecordStep['domain'],key:string,value:unknown):Promise<void>
 global(domain:GlobalStep['domain']):unknown
 initialGlobal(domain:GlobalStep['domain']):unknown
 setGlobal(domain:GlobalStep['domain'],value:unknown):Promise<void>
}
export interface AdoptionJournal {
 id:string;schema:1;status:'prepared'|'applying'|'unknown'|'applied';plan:LegacyAdoptionPlan
 globalIndex:number;recordIndex:number;roleIndex:number;grantIndex:number
 targetIntents?:string[]
 active?:{kind:'record'|'global';index:number;beforeHash:string|null;afterHash:string}
 notice?:string
}
export interface AdoptionServices {
 store:{read(id:string):Promise<AdoptionJournal|null>;write(row:AdoptionJournal):Promise<void>}
 source:{verify(plan:LegacyAdoptionPlan,phase?:'initial'|'final'):Promise<void>}
 applications:{completeProvision?(instanceId:string,operationId:string):Promise<unknown>;ensureInstance(input:{id:string;appId:string;projectId:null;operationId:string}):Promise<unknown>;ensureView(input:{id:string;instanceId:string;type:string;operationId:string}):Promise<unknown>}
 target:{run<T>(instanceId:string,operation:(target:AdoptionTarget)=>Promise<T>):Promise<T>}
 privacy:{markPrivate(instanceId:string,ids:string[],sourceRevision:string):Promise<void>}
 roles:{apply(plan:LegacyAdoptionPlan,role:LegacyAdoptionPlan['roles'][number]):Promise<void>}
 grants:{ensure(plan:LegacyAdoptionPlan,grant:LegacyAdoptionPlan['readOnlyGrants'][number]):Promise<void>}
}
function fail(code:string):never{throw Object.assign(new Error(code),{code})}
const hash=(value:unknown)=>value===undefined?null:fingerprint(value)
function validate(plan:LegacyAdoptionPlan){const {fingerprint:expected,...body}=plan;if(plan.format!=='kaogong-adoption-plan'||plan.formatVersion!==1||plan.private!==true||expected!==fingerprint(body))fail('ADOPTION_PLAN_CHANGED');for(const row of [...plan.records,...plan.globals])if(row.hash!==fingerprint(row.value))fail('ADOPTION_PLAN_CHANGED')}
function validateJournal(row:AdoptionJournal){
 validate(row.plan);if(row.schema!==1||row.id!==row.plan.id)fail('ADOPTION_CHECKPOINT_INVALID')
 for(const [index,size]of [[row.globalIndex,row.plan.globals.length],[row.recordIndex,row.plan.records.length],[row.roleIndex,row.plan.roles.length],[row.grantIndex,row.plan.readOnlyGrants.length]])if(!Number.isSafeInteger(index)||index<0||index>size)fail('ADOPTION_CHECKPOINT_INVALID')
 if(row.recordIndex>0&&row.globalIndex!==row.plan.globals.length||row.roleIndex>0&&row.recordIndex!==row.plan.records.length||row.grantIndex>0&&row.roleIndex!==row.plan.roles.length)fail('ADOPTION_CHECKPOINT_INVALID')
 if(row.targetIntents?.some(id=>![row.plan.targets.history.instanceId,row.plan.targets.library.instanceId].includes(id)))fail('ADOPTION_CHECKPOINT_INVALID')
}
/** App-owned durable import intent. It never restores or writes the old profile. */
export class LegacyAdoptionWorkflow {
 private tail:Promise<unknown>=Promise.resolve()
 private closing=false
 constructor(private readonly services:AdoptionServices){}
 private run<T>(operation:()=>Promise<T>){if(this.closing)return Promise.reject(Error('Adoption owner is stopping'));const task=this.tail.then(operation);this.tail=task.catch(()=>{});return task}
 remember(plan:LegacyAdoptionPlan){return this.run(async()=>{
  validate(plan);const previous=await this.services.store.read(plan.id)
  if(previous){if(previous.plan.fingerprint!==plan.fingerprint)fail('ADOPTION_INTENT_CONFLICT');return previous}
  const row:AdoptionJournal={id:plan.id,schema:1,status:'prepared',plan:structuredClone(plan),globalIndex:0,recordIndex:0,roleIndex:0,grantIndex:0}
  await this.services.store.write(row);return row
 })}
 inspect(id:string){return this.run(async()=>{const row=await this.services.store.read(id);if(!row)fail('ADOPTION_PLAN_MISSING');validateJournal(row);return row})}
 apply(input:{id:string;fingerprint:string;confirmed:boolean}){return this.run(async()=>{
  if(input.confirmed!==true)fail('ADOPTION_CONCRETE_CONFIRMATION_REQUIRED')
  let journal=await this.services.store.read(input.id);if(!journal)fail('ADOPTION_PLAN_MISSING')
  validateJournal(journal);const plan=journal.plan
  if(plan.fingerprint!==input.fingerprint||plan.status!=='ready')fail('ADOPTION_PLAN_BLOCKED_OR_CHANGED')
  const isApplied=()=>journal?.status==='applied'
  const complete=async()=>{for(const target of [plan.targets.history,plan.targets.library])await this.services.applications.completeProvision?.(target.instanceId,plan.id)}
  if(journal.status==='applied'){await complete();return journal}
  const save=async(patch:Partial<AdoptionJournal>)=>{journal={...journal!,...patch};await this.services.store.write(journal);return journal}
  try{
   await this.services.source.verify(plan,'initial')
   await save({status:'applying',notice:'Applying only this confirmed intent; source remains unchanged'})
   for(const target of [plan.targets.history,plan.targets.library]){
    await this.services.source.verify(plan)
    await save({targetIntents:[...new Set([...(journal.targetIntents??[]),target.instanceId])]})
    try{await this.services.applications.ensureInstance({id:target.instanceId,appId:target.appId,projectId:target.projectId,operationId:plan.id})}
    catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='provision-conflict')await save({targetIntents:journal.targetIntents?.filter(id=>id!==target.instanceId)});throw error}
    await this.services.applications.ensureView({id:target.viewId,instanceId:target.instanceId,type:'page',operationId:plan.id})
   }
   await this.services.privacy.markPrivate(plan.targets.history.instanceId,plan.privateKnowledgeIds,plan.source.revision)
   await this.services.source.verify(plan)
   while(journal.globalIndex<plan.globals.length){
    const index=journal.globalIndex,step=plan.globals[index]!,instanceId=plan.targets[step.target].instanceId
    await this.services.target.run(instanceId,async target=>{
     const currentHash=hash(target.global(step.domain)),active=journal!.active
     if(active){if(active.kind!=='global'||active.index!==index||active.afterHash!==step.hash||active.beforeHash!==hash(target.initialGlobal(step.domain)))fail('ADOPTION_CHECKPOINT_INVALID');if(currentHash!==active.beforeHash&&currentHash!==active.afterHash)fail('ADOPTION_TARGET_CHANGED')}
     else {if(currentHash!==hash(target.initialGlobal(step.domain)))fail('ADOPTION_TARGET_CHANGED');await save({active:{kind:'global',index,beforeHash:currentHash,afterHash:step.hash}})}
     if(currentHash!==step.hash)await target.setGlobal(step.domain,step.value)
     await save({globalIndex:index+1,active:undefined})
    })
   }
   while(journal.recordIndex<plan.records.length){
    await this.services.source.verify(plan)
    // Keep the native domain lease for a bounded same-instance chunk; no public platform call is made under it.
    const first=plan.records[journal.recordIndex]!,end=Math.min(journal.recordIndex+20,plan.records.length),instanceId=plan.targets[first.target].instanceId
    await this.services.target.run(instanceId,async target=>{
     while(journal!.recordIndex<end){
      const index=journal!.recordIndex,step=plan.records[index]!
      if(plan.targets[step.target].instanceId!==instanceId)break
      const currentHash=hash(target.read(step.domain,step.key)),active=journal!.active
      if(active){if(active.kind!=='record'||active.index!==index||active.afterHash!==step.hash||active.beforeHash!==null)fail('ADOPTION_CHECKPOINT_INVALID');if(currentHash!==active.beforeHash&&currentHash!==active.afterHash)fail('ADOPTION_TARGET_CHANGED')}
      else {if(currentHash!==null)fail('ADOPTION_TARGET_NOT_EMPTY');await save({active:{kind:'record',index,beforeHash:null,afterHash:step.hash}})}
      if(currentHash!==step.hash)await target.write(step.domain,step.key,step.value)
      await save({recordIndex:index+1,active:undefined})
     }
    })
   }
   while(journal.roleIndex<plan.roles.length){await this.services.source.verify(plan);await this.services.roles.apply(plan,plan.roles[journal.roleIndex]!);await save({roleIndex:journal.roleIndex+1})}
   while(journal.grantIndex<plan.readOnlyGrants.length){await this.services.source.verify(plan);await this.services.grants.ensure(plan,plan.readOnlyGrants[journal.grantIndex]!);await save({grantIndex:journal.grantIndex+1})}
   await this.services.source.verify(plan,'final')
   // Confirm migrated values without touching unrelated rows written after this plan.
   for(const targetId of [plan.targets.history.instanceId,plan.targets.library.instanceId])await this.services.target.run(targetId,async target=>{
    for(const step of plan.records)if(plan.targets[step.target].instanceId===targetId&&hash(target.read(step.domain,step.key))!==step.hash)fail('ADOPTION_TARGET_CHANGED')
    for(const step of plan.globals)if(plan.targets[step.target].instanceId===targetId&&hash(target.global(step.domain))!==step.hash)fail('ADOPTION_TARGET_CHANGED')
   })
   await save({status:'applied',notice:'Confirmed records applied; original profile and newer target rows retained'})
   await complete();return journal
  }catch(error){if(isApplied())throw error;try{await save({status:'unknown',notice:'Phase failed or receipt unknown; only explicit same-plan recovery may continue'})}catch{}throw error}
 })}
 async close(){this.closing=true;await this.tail}
}
