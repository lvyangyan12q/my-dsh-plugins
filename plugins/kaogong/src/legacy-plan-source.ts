import * as fs from 'node:fs/promises'
import {join,relative,isAbsolute} from 'node:path'
import {createHash} from 'node:crypto'
import type {LegacyAdoptionPlan} from './legacy-adoption-plan.ts'
/** Bounded, read-only hash fence for each import checkpoint; never opens legacy domains. */
export async function revalidatePlanSource(plan:LegacyAdoptionPlan,sourceHome:string){
 const root=await fs.realpath(sourceHome)
 if(root!==plan.source.home)throw Object.assign(Error('LEGACY_SOURCE_CHANGED'),{code:'LEGACY_SOURCE_CHANGED'})
 for(const file of plan.source.files){
  const resolved=await fs.realpath(join(root,'storages',file.name+'.json')),path=relative(root,resolved)
  if(resolved!==file.resolvedPath||path.startsWith('..')||isAbsolute(path))throw Object.assign(Error('LEGACY_SOURCE_CHANGED'),{code:'LEGACY_SOURCE_CHANGED'})
  const bytes=await fs.readFile(resolved),hash=createHash('sha256').update(bytes).digest('hex')
  if(hash!==file.sha256)throw Object.assign(Error('LEGACY_SOURCE_CHANGED'),{code:'LEGACY_SOURCE_CHANGED'})
 }
}
