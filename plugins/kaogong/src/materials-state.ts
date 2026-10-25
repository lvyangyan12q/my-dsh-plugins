import {defineDomain,domainTable} from '@deepseek-ai/dsh-storage-domain'
import type {KvTable} from '@deepseek-ai/dsh-storage-domain'
import {z} from 'zod'
import type {MaterialJournal} from './materials-import.ts'
import type {MaterialImportPlan} from './materials-plan.ts'
export type StoredMaterialJournal=Omit<MaterialJournal,'plan'>&{planId:string;planFingerprint:string;instanceId:string}
export type StoredMaterialPlan={id:string;fingerprint:string;plan:MaterialImportPlan}
const stored=z.object({id:z.string(),schema:z.literal(1),status:z.enum(['prepared','applying','unknown','applied']),index:z.number().int().nonnegative(),active:z.number().int().nonnegative().optional(),started:z.boolean(),notice:z.string().optional(),planId:z.string(),planFingerprint:z.string(),instanceId:z.string()})
export const materialImportDomain=defineDomain({name:'kaogong_material_import_rc3',version:1,tables:{journals:domainTable<string,StoredMaterialJournal>(stored),private_knowledge:domainTable(z.object({instanceId:z.string(),id:z.string(),sourceRevision:z.string()}))}})
export const materialPlansDomain=defineDomain({name:'kaogong_material_plans_rc3',version:1,tables:{plans:domainTable<string,StoredMaterialPlan>(z.object({id:z.string(),fingerprint:z.string(),plan:z.unknown()}) as z.ZodType<StoredMaterialPlan>)}})
export function assertMaterialImportReady(table:Pick<KvTable<string,StoredMaterialJournal>,'entries'>,instanceId:string){for(const[,row]of table.entries())if(row.instanceId===instanceId&&row.started&&['applying','unknown'].includes(row.status))throw Error('此资料接入尚未确认完成；目标保持隔离，请检查同一计划后显式恢复。')}
