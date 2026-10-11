import {workbenchBuilderPreset} from './workbench-skill-api.ts'
import type { ManagementCatalog } from './management-api.ts'
import { useEffect, useRef, useState } from 'react'
import { managementCall } from './management-view.tsx'
import type { AppRecipe } from './recipe-api.ts'
export function RecipeRolesEditor({recipe,change,t}:{recipe:AppRecipe;change:(update:(r:AppRecipe)=>void)=>void;t:(key:any)=>string}) {
 const [agents,setAgents]=useState<{presetId:string;name:string;available:boolean}[]>([]),[loading,setLoading]=useState(false),[catalogReady,setCatalogReady]=useState(false),[error,setError]=useState('')
 const [nativePresets,setNativePresets]=useState<ManagementCatalog['presets']>([])
 const [ownedRoles,setOwnedRoles]=useState<ManagementCatalog['roles']>([])
 // Scoped application roles are intentionally absent from the reusable Agent catalog.
 const privatePreset=(role:AppRecipe['roles'][number])=>{
  if(role.presetId.startsWith('my-dsh.')||agents.some(agent=>agent.presetId===role.presetId))return false
  const owned=ownedRoles.filter(entry=>entry.key.appId===recipe.appId&&entry.key.roleId===role.id&&entry.key.subject===undefined&&entry.presetId===role.presetId)
  return owned.length?owned.some(entry=>entry.available):Boolean(nativePresets.find(preset=>preset.id===role.presetId&&!preset.broken))
 }
 const controller=useRef<AbortController>(),hasRoles=recipe.roles.length>0
 const load=async()=>{
  controller.current?.abort();const current=new AbortController();controller.current=current;setLoading(true);setError('')
  try{const catalog:ManagementCatalog=await managementCall({action:'catalog'},current.signal);if(current.signal.aborted)return
   if(catalog.version!==1||!Array.isArray(catalog.presets)||!Array.isArray(catalog.agents??[]))throw new Error(t('recipeAgentsUnavailable'))
   const options=new Map<string,{presetId:string;name:string;available:boolean}>()
   const builder=catalog.presets.find(p=>p.id===workbenchBuilderPreset);if(builder)options.set(builder.id,{presetId:builder.id,name:builder.name??builder.id,available:!builder.broken})
   for(const agent of catalog.agents??[])if(agent.managed&&agent.presetId)options.set(agent.presetId,{presetId:agent.presetId,name:agent.name,available:agent.userInvocable&&!agent.broken})
   setOwnedRoles(catalog.roles??[]);setNativePresets(catalog.presets);setAgents([...options.values()]);setCatalogReady(true)
  }catch(error){if(!current.signal.aborted){setError(error instanceof Error?error.message:String(error));setCatalogReady(false)}}finally{if(!current.signal.aborted)setLoading(false)}
 }
 useEffect(()=>{if(hasRoles)void load();return()=>controller.current?.abort()},[hasRoles])
 return <fieldset><legend>{t('appRoles')}</legend>{hasRoles&&<><button data-pwb-button type="button" disabled={loading} onClick={()=>{void load()}}>{t('recipeRefreshAgents')}</button>{loading&&<p role="status">{t('recipeAgentsLoading')}</p>}{error&&<p role="alert">{t('recipeAgentsUnavailable')}: {error}</p>}</>}{recipe.roles.map((role,index)=><fieldset key={role.id}><legend>{role.id}</legend><label>{t('recipeRoleName')}<input value={role.name} onChange={e=>change(r=>{r.roles[index].name=e.target.value})}/></label><label>{t('recipeRoleAgent')}<select aria-label={t('recipeRoleAgent')+': '+role.id} disabled={loading||!catalogReady} value={role.presetId} onChange={e=>change(r=>{r.roles[index].presetId=e.target.value})}><option value="">{t('recipeChooseAgent')}</option>{role.presetId&&!agents.some(a=>a.presetId===role.presetId)&&<option value={role.presetId} disabled>{role.presetId} · {t(privatePreset(role)?'canvasExistingPrivateRole':'recipeRoleMissingAgent')}</option>}{agents.map(agent=><option key={agent.presetId} value={agent.presetId} disabled={!agent.available}>{agent.name}{agent.available?'':' · '+t('recipeRoleMissingAgent')}</option>)}</select></label>{catalogReady&&role.presetId&&!privatePreset(role)&&!agents.some(a=>a.presetId===role.presetId&&a.available)&&<p role="alert">{t('recipeRoleMissingAgent')}: {role.presetId}</p>}<label>{t('recipeRoleSkills')}<input value={role.skillNames.join(', ')} onChange={e=>change(r=>{r.roles[index].skillNames=e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}/></label><button data-pwb-button onClick={()=>change(r=>{r.roles.splice(index,1);for(const page of r.pages)for(const module of page.modules)if(module.roleId===role.id)delete module.roleId})}>{t('taskRemove')}</button></fieldset>)}<button data-pwb-button onClick={()=>change(r=>{r.roles.push({id:'role.'+crypto.randomUUID(),name:t('recipeRoleName'),presetId:'',skillNames:[]})})}>{t('recipeAddRole')}</button>{recipe.pages.map((page,pageIndex)=><fieldset key={page.id}><legend>{page.label}</legend><button data-pwb-button disabled={!recipe.roles.length} onClick={()=>change(r=>{r.pages[pageIndex].modules.push({id:'chat.'+crypto.randomUUID(),type:'role-chat',title:t('appRoles'),roleId:r.roles[0].id,config:{}})})}>{t('appRoles')}</button>{page.modules.map((module,moduleIndex)=><fieldset key={module.id}><legend>{module.title}: {t('recipeTaskAction')}</legend><label>{t('recipeTaskRole')}<select value={module.roleId??''} onChange={e=>change(r=>{const m=r.pages[pageIndex].modules[moduleIndex];if(e.target.value)m.roleId=e.target.value;else delete m.roleId})}><option value="">{t('appNone')}</option>{recipe.roles.map(role=><option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label>{t('recipeTaskPrompt')}<input value={String(module.config.taskPrompt??'')} onChange={e=>change(r=>{r.pages[pageIndex].modules[moduleIndex].config.taskPrompt=e.target.value})}/></label></fieldset>)}</fieldset>)}</fieldset>
}
