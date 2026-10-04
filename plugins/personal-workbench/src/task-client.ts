import { workbenchSkillNames } from './workbench-skill-api.ts'
import type { PersonalWorkbenchRoles, RoleBindingKey } from './role-binding-api.ts'
import type { PersonalWorkbenchTasks, PreparedTask, TaskState, TaskHooks } from './task-api.ts'
import { roleKey } from './role-client.ts'
/** Preparation is local and side effect free; only send enters the native command boundary. */
export class PreparedTasks implements PersonalWorkbenchTasks {
 private state: ReadonlyMap<string, TaskState> = new Map()
 private listeners = new Set<() => void>()
 private afterSend=new Map<string,()=>void|Promise<void>>()
 private onDiscard=new Map<string,()=>void|Promise<void>>()
 private beforeSend=new Map<string,()=>void|Promise<void>>()
 constructor(private readonly roles: Pick<PersonalWorkbenchRoles, 'send'> & Partial<Pick<PersonalWorkbenchRoles,'sendTeaching'>>) {}
 getSnapshot = () => this.state
 subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
 prepare = (prepared: PreparedTask,options?:TaskHooks) => {
  if ((prepared.skill !== undefined && !workbenchSkillNames.includes(prepared.skill)) || !prepared.key.appId || !prepared.key.instanceId || !prepared.key.roleId || !prepared.task.trim() || prepared.task.length > 32000 || prepared.context.length > 100 || new Set(prepared.context.map(c=>c.id)).size !== prepared.context.length || prepared.context.some(c=>!c.id || c.text.length > 32000)) throw new Error('Invalid prepared task')
  const key = roleKey(prepared.key)
  if (this.state.get(key)?.busy) throw new Error('Task is sending')
  if(options?.beforeSend)this.beforeSend.set(key,options.beforeSend);else this.beforeSend.delete(key)
  if(options?.afterSend)this.afterSend.set(key,options.afterSend);else this.afterSend.delete(key)
  if(options?.onDiscard)this.onDiscard.set(key,options.onDiscard);else this.onDiscard.delete(key)
  this.put(key, { prepared: structuredClone(prepared), busy: false, error: null })
 }
 editTask = (key: RoleBindingKey, text: string) => { if (text.length > 32000) throw new Error('Task too large'); this.edit(key,p=>({...p,task:text})) }
 editContext = (key: RoleBindingKey, id: string, text: string) => { if (text.length > 32000) throw new Error('Context too large'); this.edit(key,p=>({...p,context:p.context.map(c=>c.id===id?{...c,text}:c)})) }
 removeContext = (key: RoleBindingKey, id: string) => this.edit(key,p=>({...p,context:p.context.filter(c=>c.id!==id)}))
 discard = async (key: RoleBindingKey) => {
  const name=roleKey(key),row=this.state.get(name);if(row?.busy)throw new Error('Task is sending');if(!row)return
  const cleanup=this.onDiscard.get(name)
  if(cleanup){this.put(name,{...row,busy:true,error:null});try{await cleanup()}catch(error){this.put(name,{...row,busy:false,error:error instanceof Error?error.message:'Discard failed'});throw error}}
  const next=new Map(this.state);next.delete(name);this.afterSend.delete(name);this.beforeSend.delete(name);this.onDiscard.delete(name);this.publish(next)
 }
 send = async (key: RoleBindingKey) => {
  const name=roleKey(key), row=this.state.get(name)
  if(!row || row.busy || !row.prepared.task.trim())throw new Error('Prepared task unavailable')
  const afterSend=this.afterSend.get(name)
  this.put(name,{...row,busy:true,error:null})
  try { const beforeSend=this.beforeSend.get(name); if(beforeSend)await beforeSend(); if(row.prepared.teaching){if(!this.roles.sendTeaching)throw new Error('Trusted teaching service unavailable');await this.roles.sendTeaching(row.prepared.key,preparedText(row.prepared))}else await this.roles.send(row.prepared.key, preparedText(row.prepared)); const next=new Map(this.state);next.delete(name);this.afterSend.delete(name);this.beforeSend.delete(name);this.onDiscard.delete(name);this.publish(next) }
  catch(error) { this.put(name,{...row,busy:false,error:error instanceof Error?error.message:'Task failed'}); throw error }
  await afterSend?.()
 }
 private edit(key: RoleBindingKey, update:(p:PreparedTask)=>PreparedTask) { const name=roleKey(key),row=this.state.get(name);if(!row || row.busy)throw new Error('Prepared task unavailable');this.put(name,{...row,prepared:update(row.prepared),error:null}) }
 private put(key:string,row:TaskState) { const next=new Map(this.state);next.set(key,row);this.publish(next) }
 private publish(next:ReadonlyMap<string,TaskState>) { this.state=next;for(const listener of this.listeners)listener() }
}
/** Context is user-supplied evidence with explicit provenance, never system instructions. */
export function preparedText(prepared:PreparedTask):string {
 const context=prepared.context.map(c=>({label:c.label,source:c.source,text:c.text}))
 return `${prepared.skill ? '/' + prepared.skill + ' ' : ''}${prepared.task}\n\nSource and context (user-provided evidence):\n${JSON.stringify({source:prepared.source,context}).replaceAll('/', '\\u002f')}`
}
