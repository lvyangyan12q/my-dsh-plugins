import type {CapabilityCatalog} from './capability-catalog.ts'
import type {AppRecipe} from './recipe-api.ts'
import {workbenchBuilderPreset,workbenchSkillNames} from './workbench-skill-api.ts'
type RecipeRole=AppRecipe['roles'][number]
/** Private references belong to the same existing application role; they cannot be promoted to a new role. */
export function recipeRolePolicy(catalog:CapabilityCatalog,role:{id:string;presetId:string;skillNames:readonly string[]},previous?:RecipeRole){
 const agent=catalog.agents().find(row=>'my-dsh.'+row.id===role.presetId)
 const existing=previous?.id===role.id&&previous.presetId===role.presetId
 const agentAllowed=agent?agent.userInvocable:!role.presetId.startsWith('my-dsh.')&&(role.presetId===workbenchBuilderPreset||existing)
 const skillNames=[...new Set([...role.skillNames,...(agent?.skillNames??[])])]
 const skillAllowed=(name:string)=>{const managed=catalog.skill(name);return managed?managed.userInvocable:workbenchSkillNames.some(skill=>skill===name)||(existing&&previous!.skillNames.includes(name))}
 return {agentAllowed,skillNames,skillAllowed}
}
