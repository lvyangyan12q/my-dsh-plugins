import type { Context } from '@deepseek-ai/cordis'
import { capabilityDomain } from './capability-domain.ts'
import type { AgentRecord, SkillRecord } from './capability-domain.ts'
export interface CapabilityCatalog { agents():readonly AgentRecord[]; skill(name:string):SkillRecord|undefined }
declare module '@deepseek-ai/cordis' { interface Context { personalWorkbenchCapabilities:CapabilityCatalog } }
/** A domain has one owner. Readers reuse that owner's catalog instead of reopening it. */
export async function withCapabilityCatalog<T>(ctx:Context,visit:(catalog:CapabilityCatalog)=>Promise<T>):Promise<T> {
 const shared=ctx.get?.('personalWorkbenchCapabilities');if(shared)return visit(shared)
 const domain=await ctx.storageDomain.open(capabilityDomain)
 try {return await visit({agents:()=>[...domain.table('agents').entries()].map(([,row])=>row),skill:name=>domain.table('skills').get(name)})}finally{await domain.close()}
}
