import {useEffect,useState} from 'react'
import type {AppRecipe} from './recipe-api.ts'
import type {ManagementCatalog} from './management-api.ts'
import {managementCall} from './management-view.tsx'
export function RecipeRoleSettings({recipe,pageIndex,moduleIndex,change,t}:{recipe:AppRecipe;pageIndex:number;moduleIndex:number;change:(fn:(r:AppRecipe)=>void)=>void;t:(key:any)=>string}){
 const module=recipe.pages[pageIndex].modules[moduleIndex],roleIndex=recipe.roles.findIndex(r=>r.id===module.roleId),role=recipe.roles[roleIndex]
 const [open,setOpen]=useState(false),[catalog,setCatalog]=useState<ManagementCatalog|null>(null),[error,setError]=useState('')
 useEffect(()=>{if(!open)return;const abort=new AbortController();setError('');void managementCall({action:'catalog'},abort.signal).then(value=>{if(!abort.signal.aborted)setCatalog(value as ManagementCatalog)}).catch(error=>{if(!abort.signal.aborted)setError(error instanceof Error?error.message:String(error))});return()=>abort.abort()},[open])
 const agents=catalog?.agents?.filter(a=>a.managed&&a.presetId&&a.userInvocable&&!a.broken)??[],skills=catalog?.skills.filter(s=>s.managed&&s.userInvocable)??[]
 const create=()=>{change(copy=>{const id='role.'+crypto.randomUUID();copy.roles.push({id,name:t('recipeRoleName'),presetId:'',skillNames:[]});copy.pages[pageIndex].modules[moduleIndex].roleId=id});setOpen(true)}
 return <div className="pwb-canvas-role-settings">{role?<button data-pwb-button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{t('canvasRoleSettings')}</button>:<button data-pwb-button type="button" onClick={create}>{t('recipeAddRole')}</button>}
 {open&&role&&<><label>{t('recipeRoleName')}<input aria-label={t('recipeRoleName')+': '+role.id} value={role.name} onChange={e=>change(copy=>{copy.roles[roleIndex].name=e.target.value})}/></label><label>{t('recipeRoleAgent')}<select aria-label={t('recipeRoleAgent')+': '+role.id} value={role.presetId} disabled={!catalog} onChange={e=>change(copy=>{copy.roles[roleIndex].presetId=e.target.value})}><option value="">{t('recipeChooseAgent')}</option>{role.presetId&&!agents.some(a=>a.presetId===role.presetId)&&<option value={role.presetId} disabled>{role.presetId} · {t('canvasExistingPrivateRole')}</option>}{agents.map(a=><option key={a.id} value={a.presetId}>{a.name}</option>)}</select></label><small>{t('canvasReusableOnly')}</small>
 <label>{t('recipeRoleSkills')}<select aria-label={t('recipeRoleSkills')+': '+role.id} value="" onChange={e=>{const name=e.target.value;if(name)change(copy=>{const r=copy.roles[roleIndex];if(!r.skillNames.includes(name))r.skillNames.push(name)})}}><option value="">{t('recipeRoleSkills')}</option>{skills.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</select></label>{role.skillNames.map(name=><button data-pwb-button key={name} type="button" onClick={()=>change(copy=>{copy.roles[roleIndex].skillNames=copy.roles[roleIndex].skillNames.filter(n=>n!==name)})}>{name} ×</button>)}
 {!agents.length&&catalog&&<p role="status">{t('canvasNoReusableAgents')}</p>}{error&&<p role="alert">{error}</p>}</>}
 </div>
}
