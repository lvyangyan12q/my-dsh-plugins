import {fingerprint} from './legacy-adoption-plan.ts'
import {validateMaterialPlan,type MaterialImportPlan} from './materials-plan.ts'
export type MaterialJournal={id:string;schema:1;status:'prepared'|'applying'|'unknown'|'applied';plan:MaterialImportPlan;index:number;active?:number;started:boolean;notice?:string}
export interface MaterialTarget{entries(domain:'bank'|'knowledge'):Iterable<[string,unknown]>;read(domain:'bank'|'knowledge',id:string):unknown;write(domain:'bank'|'knowledge',id:string,value:unknown):Promise<unknown>}
export interface MaterialImportServices{
 store:{read(id:string):Promise<MaterialJournal|null>;write(row:MaterialJournal):Promise<unknown>}
 source:{verify(plan:MaterialImportPlan,full?:boolean):Promise<void>}
 target:{run<T>(target:MaterialImportPlan['target'],operation:(target:MaterialTarget)=>Promise<T>):Promise<T>}
 privacy:{mark(instanceId:string,ids:string[],sourceRevision:string):Promise<unknown>}
}
function fail(code:string):never{throw Object.assign(Error(code),{code})}
/** Explicit material-only intent; no learning state, Native Session or source writes exist in this interface. */
export class MaterialImportWorkflow{
 private tail:Promise<unknown>=Promise.resolve();private closed=false
 constructor(private readonly services:MaterialImportServices){}
 private run<T>(operation:()=>Promise<T>){if(this.closed)return Promise.reject(Error('Material importer is stopping'));const task=this.tail.then(operation);this.tail=task.catch(()=>{});return task}
 remember(plan:MaterialImportPlan){return this.run(async()=>{validateMaterialPlan(plan);const old=await this.services.store.read(plan.id);if(old){if(old.plan.fingerprint!==plan.fingerprint)fail('MATERIAL_INTENT_CONFLICT');return old}const row:MaterialJournal={id:plan.id,schema:1,status:'prepared',plan:structuredClone(plan),index:0,started:false};await this.services.store.write(row);return row})}
 private validate(row:MaterialJournal){validateMaterialPlan(row.plan);if(row.schema!==1||row.id!==row.plan.id||!Number.isSafeInteger(row.index)||row.index<0||row.index>row.plan.records.length||row.active!==undefined&&row.active!==row.index||!row.started&&(row.index!==0||row.active!==undefined))fail('MATERIAL_CHECKPOINT_INVALID')}
 inspect(id:string){return this.run(async()=>{const row=await this.services.store.read(id);if(!row)fail('MATERIAL_PLAN_MISSING');this.validate(row);return row})}
 apply(input:{id:string;fingerprint:string;confirmed:boolean}){return this.run(async()=>{
  if(input.confirmed!==true)fail('MATERIAL_CONCRETE_CONFIRMATION_REQUIRED')
  let row=await this.services.store.read(input.id);if(!row)fail('MATERIAL_PLAN_MISSING');this.validate(row)
  const plan=row.plan;if(input.fingerprint!==plan.fingerprint)fail('MATERIAL_PLAN_CHANGED');if(row.status==='applied')return row
  const save=async(patch:Partial<MaterialJournal>)=>{row={...row!,...patch};await this.services.store.write(row);return row}
  try{
   await this.services.source.verify(plan,true)
   await this.services.target.run(plan.target,async target=>{
    for(const domain of ['bank','knowledge'] as const)for(const[id,value]of target.entries(domain)){
     const index=plan.records.findIndex(record=>record.domain===domain&&record.key===id)
     if(!row!.started||index<0||index>=row!.index&&index!==row!.active||fingerprint(value)!==plan.records[index]!.hash)fail('MATERIAL_TARGET_NOT_EMPTY_OR_CHANGED')
    }
    await save({started:true,status:'applying',notice:'Only this confirmed material plan is being applied; source files remain untouched'})
    await this.services.privacy.mark(plan.target.instanceId,plan.privateKnowledgeIds,plan.source.revision)
   })
   while(row.index<plan.records.length){
    await this.services.source.verify(plan)
    const end=Math.min(row.index+20,plan.records.length)
    await this.services.target.run(plan.target,async target=>{
     while(row!.index<end){
      const index=row!.index,record=plan.records[index]!,current=target.read(record.domain,record.key)
      if(current!==undefined&&(row!.active!==index||fingerprint(current)!==record.hash))fail('MATERIAL_TARGET_CHANGED')
      if(row!.active===undefined)await save({active:index})
      if(current===undefined)await target.write(record.domain,record.key,record.value)
      await save({index:index+1,active:undefined})
     }
    })
   }
   await this.services.source.verify(plan,true)
   await this.services.target.run(plan.target,async target=>{for(const record of plan.records)if(fingerprint(target.read(record.domain,record.key))!==record.hash)fail('MATERIAL_TARGET_CHANGED')})
   return save({status:'applied',notice:'Material metadata confirmed; original files remain in place and no learning instance or sharing grant was created'})
  }catch(error){if(row.started)try{await save({status:'unknown',notice:'Import outcome requires explicit same-plan inspection/recovery; target remains isolated'})}catch{}throw error}
 })}
 async close(){this.closed=true;await this.tail}
}

