import {defineDomain,domainTable} from '@deepseek-ai/dsh-storage-domain'
import type {KvTable} from '@deepseek-ai/dsh-storage-domain'
import {z} from 'zod'
import type {AdoptionJournal} from './legacy-adoption-workflow.ts'
import type {LegacyAdoptionPlan} from './legacy-adoption-plan.ts'
export type StoredAdoptionJournal=Omit<AdoptionJournal,'plan'>&{planId:string;planFingerprint:string}
export type StoredAdoptionPlan={id:string;fingerprint:string;plan:LegacyAdoptionPlan}
const index=z.number().int().nonnegative()
const journal=z.object({id:z.string(),schema:z.literal(1),status:z.enum(['prepared','applying','unknown','applied']),planId:z.string(),planFingerprint:z.string(),globalIndex:index,recordIndex:index,roleIndex:index,grantIndex:index,targetIntents:z.array(z.string()).optional(),active:z.object({kind:z.enum(['record','global']),index,beforeHash:z.string().nullable(),afterHash:z.string()}).optional(),notice:z.string().optional()})
/** New metadata only; it contains no alias of a legacy domain. */
export const adoptionDomain=defineDomain({name:'kaogong_adoption_rc3',version:1,tables:{
 journals:domainTable<string,StoredAdoptionJournal>(journal),
 private_knowledge:domainTable(z.object({instanceId:z.string(),id:z.string(),sourceRevision:z.string()})),
}})
/** Large immutable plans are separate from frequent small checkpoint writes. */
export const adoptionPlansDomain=defineDomain({name:'kaogong_adoption_plans_rc3',version:1,tables:{plans:domainTable<string,StoredAdoptionPlan>(z.object({id:z.string(),fingerprint:z.string(),plan:z.unknown()}) as z.ZodType<StoredAdoptionPlan>)}})
export const privateKnowledgeKey=(instanceId:string,id:string)=>JSON.stringify([instanceId,id])
export function assertAdoptionReady(journals:Pick<KvTable<string,StoredAdoptionJournal>,'entries'>,instanceId:string){
 for(const [,row]of journals.entries())if(['applying','unknown'].includes(row.status)&&row.targetIntents?.includes(instanceId))throw Error('此历史接管尚未确认完成；原数据保留，请检查接管回执后显式恢复。')
}
