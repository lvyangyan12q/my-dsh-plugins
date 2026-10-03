import { registerRecipeModuleContextProvider } from './module-context.ts'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { RecipeModuleProps } from './recipe-view.tsx'
import type { RoleBindingKey } from './role-binding-api.ts'
import { registerRecipeModuleRenderer } from './recipe-view.tsx'
import { roleKey } from './role-client.ts'
import { PreparedTasks } from './task-client.ts'
const emptyStates:ReadonlyMap<string,import('./role-binding-api.ts').RoleViewState>=new Map()
const emptySubscribe=()=>()=>{}
const emptySnapshot=()=>emptyStates
export function PreparedTaskEditor({ctx,bindingKey,label,t}:{ctx:Context;bindingKey:RoleBindingKey;label?:string;t:(key:any)=>string}) {
 const tasks=ctx.get('personalWorkbenchTasks')
 if(!tasks)return <p role="alert">{t('taskUnavailable')}</p>
 return <TaskEditor tasks={tasks} bindingKey={bindingKey} label={label} t={t} roles={ctx.get('personalWorkbenchRoles')}/>
}
function TaskEditor({tasks,bindingKey,label,t,roles}:{tasks:PreparedTasks|import('./task-api.ts').PersonalWorkbenchTasks;bindingKey:RoleBindingKey;label?:string;t:(key:any)=>string;roles?:import('./role-binding-api.ts').PersonalWorkbenchRoles}) {
 const roleStates=useSyncExternalStore(roles?.view?.subscribe??emptySubscribe,roles?.view?.getSnapshot??emptySnapshot),roleState=roleStates.get(roleKey(bindingKey))
 const identity=roleKey(bindingKey)
 useEffect(()=>{void roles?.open(bindingKey).catch(()=>{})},[roles,identity])
 const states=useSyncExternalStore(tasks.subscribe,tasks.getSnapshot),state=states.get(roleKey(bindingKey))
 if(!state)return null
 const {prepared,busy}=state
 return <fieldset disabled={busy}><legend>{t('taskPrepared')}</legend><p>{t('taskTarget')}: {label??bindingKey.roleId}{bindingKey.subject ? ' · ' + bindingKey.subject : ''}</p><p>{t('taskSource')}: {prepared.source.label} · {prepared.source.pageId}/{prepared.source.moduleId}</p><label>{t('taskText')}<textarea aria-label={t('taskText')} value={prepared.task} onChange={e=>tasks.editTask(bindingKey,e.target.value)}/></label>{prepared.context.map(c=><section key={c.id}><label>{c.label} · {c.source}<textarea aria-label={c.label} value={c.text} onChange={e=>tasks.editContext(bindingKey,c.id,e.target.value)}/></label><button onClick={()=>tasks.removeContext(bindingKey,c.id)}>{t('taskRemove')}</button></section>)}<button disabled={!prepared.task.trim()||!!roleState?.error||roleState?.busy} onClick={()=>{void tasks.send(bindingKey).catch(()=>{})}}>{t('taskSend')}</button><button onClick={()=>tasks.discard(bindingKey)}>{t('taskDiscard')}</button>{roleState?.error&&<><p role="alert">{roleState.error}</p><button onClick={()=>{void roles?.open(bindingKey).catch(()=>{})}}>{t('retry')}</button></>}{state.error&&<p role="alert">{state.error}</p>}</fieldset>
}
function RecipeRoleChat({ctx,recipe,module,appId,instanceId,preview,taskEditorHost=true,t,renderFactorySlot}:RecipeModuleProps) {
 const key=useMemo(()=>({appId,instanceId,roleId:module.roleId??''}),[appId,instanceId,module.roleId]),role=recipe.roles.find(r=>r.id===module.roleId)
 if(!role)return <p role="alert">{t('taskMissingRole')}</p>
 if(preview)return <p role="status">{t('taskPreview')}</p>
 return <section>{ctx&&taskEditorHost&&<PreparedTaskEditor ctx={ctx} bindingKey={key} label={role.name} t={t}/>}<div style={{minHeight:400}}>{renderFactorySlot?.('personal-workbench.role-conversation',{bindingKey:key,active:true,label:role.name},{fallback:<p role="alert">{t('taskUnavailable')}</p>})??<p role="alert">{t('taskUnavailable')}</p>}</div></section>
}
export function installTasks(ctx:Context) {
 ctx.effect(()=>registerRecipeModuleRenderer('role-chat',RecipeRoleChat),'recipe role renderer')
 ctx.effect(()=>registerRecipeModuleContextProvider('role-chat',()=>({phase:'ready',context:[]})),'role chat context')
 ctx.inject(['personalWorkbenchRoles'],child=>child.effect(()=>child.reflect.provide('personalWorkbenchTasks',new PreparedTasks(child.personalWorkbenchRoles)),'prepared tasks'))
}
