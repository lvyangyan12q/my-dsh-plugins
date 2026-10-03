import {selectRecipeWorkspace,checkInstanceWorkspace} from './recipe-workspace.ts'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-workspace'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { RoleBindingKey, RoleDefinition } from './role-binding-api.ts'
import { bindingKey } from './role-bindings.ts'
import { withCapabilityCatalog } from './capability-catalog.ts'
const instanceSchema=z.object({appId:z.string().min(1).max(200),instanceId:z.string().min(1).max(200),cwd:z.string().min(1)}).strict()
export const recipeInstancesDomain=defineDomain({name:'personal_workbench_recipe_instances',version:1,tables:{instances:domainTable<string,z.infer<typeof instanceSchema>>(instanceSchema)}})
export interface RecipeRoles { workspace(appId:string,instanceId:string):Promise<string>; register(key:RoleBindingKey, explicitEnsure?:boolean):Promise<void>; validate(definition:RoleDefinition):Promise<void> }
declare module '@deepseek-ai/cordis' { interface Context { personalWorkbenchRecipeRoles:RecipeRoles } }
/** Durable instance locations and app-owned declarations; registration never creates a Session. */
export async function installRecipeRoles(ctx:Context) {
 const domain=await ctx.storageDomain.open(recipeInstancesDomain),instances=domain.table('instances')
 const registrations=new Map<string,{signature:string;remove:()=>void}>();let tail=Promise.resolve(),closed=false
 const running=(appId:string)=>ctx.personalWorkbenchRecipes.list().find(r=>r.appId===appId)?.running
 const enabled=(appId:string)=>{if(ctx.personalWorkbenchApps.read(appId).enabled===false)throw new Error('Application disabled')}
 const sync=(row:z.infer<typeof instanceSchema>)=>{
  const recipe=running(row.appId);if(!recipe)return
  for(const role of recipe.roles){const key={appId:row.appId,instanceId:row.instanceId,roleId:role.id};const name=bindingKey(key),signature=JSON.stringify(role),old=registrations.get(name);if(old?.signature===signature)continue;old?.remove();registrations.delete(name)
   const remove=ctx.personalWorkbenchBindings.registerRole({key,presetId:role.presetId,skillNames:role.skillNames,creation:{cwd:row.cwd},display:{name:role.name,source:recipe.name}});registrations.set(name,{signature,remove})
  }
  for(const [name,entry]of registrations){const key=JSON.parse(name);if(key[0]===row.appId&&key[1]===row.instanceId&&!recipe.roles.some(r=>r.id===key[2])){entry.remove();registrations.delete(name)}}
 }
 const service:RecipeRoles={workspace:(appId,instanceId)=>{
  const task=tail.catch(()=>{}).then(async()=>{const recipe=running(appId);if(closed||!recipe)throw new Error('Recipe unavailable');enabled(appId);const id=JSON.stringify([appId,instanceId]);let row=instances.get(id);if(!row){const cwd=await selectRecipeWorkspace(ctx,recipe.workspace);row={appId,instanceId,cwd};await instances.put(id,row)}checkInstanceWorkspace(recipe.workspace,row.cwd);return row.cwd});tail=task.then(()=>{},()=>{});return task
 },register:(key,explicitEnsure=false)=>{
  const task=tail.catch(()=>{}).then(async()=>{if(closed)throw new Error('Recipe roles unavailable');const recipe=running(key.appId);if(!recipe)return;enabled(key.appId);if(key.subject!==undefined||!recipe.roles.some(r=>r.id===key.roleId))throw new Error('Recipe role unavailable');const id=JSON.stringify([key.appId,key.instanceId]);let row=instances.get(id)
   if(!row){const cwd=await selectRecipeWorkspace(ctx,recipe.workspace);row={appId:key.appId,instanceId:key.instanceId,cwd};await instances.put(id,row)}
   checkInstanceWorkspace(recipe.workspace,row.cwd);sync(row)
   const saved=await ctx.personalWorkbenchBindings.read(key),role=recipe.roles.find(r=>r.id===key.roleId)!
   if(explicitEnsure&&saved&&saved.presetId!==role.presetId&&!saved.selectedPreset){if(!ctx.personalWorkbenchBindings.setPreset)throw new Error('Role Agent replacement unavailable');await ctx.personalWorkbenchBindings.setPreset(key,role.presetId,saved.sessionId)}
  });tail=task;return task
 },validate:async definition=>{
  const recipe=running(definition.key.appId);if(!recipe)return
  enabled(definition.key.appId)
  const role=recipe.roles.find(r=>r.id===definition.key.roleId);if(!role)throw new Error('Recipe role unavailable')
  const preset=await ctx.agentPresets.resolve(definition.presetId);if(preset.broken)throw new Error('Unavailable Agent: '+definition.presetId)
  await withCapabilityCatalog(ctx,async capabilities=>{
  const agent=capabilities.agents().find(a=>'my-dsh.'+a.id===definition.presetId)
  if(definition.presetId.startsWith('my-dsh.')&&!agent?.userInvocable)throw new Error('Unavailable Agent: '+definition.presetId)
  const skillNames=[...new Set([...(definition.skillNames??[]),...(agent?.skillNames??[])])]
  const lease=await ctx.agentPresets.acquireScope(definition.presetId)
  try {const snapshot=await ctx.skills.snapshot({scope:lease.key,cwd:definition.creation?.cwd});for(const name of skillNames){const managed=capabilities.skill(name);if(managed&&!managed.userInvocable)throw new Error('Unavailable Skill: '+name);if(!snapshot.complete||!snapshot.skills.some(s=>s.name===name&&s.invocation.userInvocable))throw new Error('Unavailable Skill: '+name)}}finally{await lease[Symbol.asyncDispose]()}
  })
 }}
 for(const [id,row]of instances.entries()){if(id!==JSON.stringify([row.appId,row.instanceId]))throw new Error('Recipe instance identity mismatch');sync(row)}
 const remove=ctx.reflect.provide('personalWorkbenchRecipeRoles',service)
 return {service,dispose:async()=>{closed=true;remove();await tail.catch(()=>{});for(const row of registrations.values())row.remove();await domain.close()}}
}
