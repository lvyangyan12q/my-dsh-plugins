import {RoleError} from './roles.mjs'
const fail=(code,message)=>{throw new RoleError(code,message)}
const identifier=value=>typeof value==='string'&&/^[a-z][a-z0-9.-]{0,79}$/.test(value)
const key=(appId,kind)=>JSON.stringify([appId,kind])
/** Trusted app callbacks own business receipts, never native prompt authority. */
export class ApplicationTaskOwners {
 constructor(directory){this.directory=directory;this.entries=new Map()}
 contribute(appId,kind,owner){
  if(this.directory.closing||!identifier(appId)||!identifier(kind)||typeof owner?.version!=='string'||!owner.version||owner.version.length>80||!['prepare','validate','beforeSubmit','accepted'].every(name=>typeof owner[name]==='function')||this.entries.has(key(appId,kind)))fail('task-owner-invalid','应用任务所有者无效或重复。')
  const entry={appId,kind,owner,version:owner.version,active:true,pending:new Set()};this.entries.set(key(appId,kind),entry)
  return async()=>{entry.active=false;if(this.entries.get(key(appId,kind))===entry)this.entries.delete(key(appId,kind));await Promise.allSettled([...entry.pending])}
 }
 entry(appId,kind,version){const entry=this.entries.get(key(appId,kind));if(!entry?.active||version!==undefined&&entry.version!==version)fail('task-owner-unavailable','应用任务所有者暂不可用或版本已变化；不会改用其他发送通道。');return entry}
 assert(entry){if(this.entry(entry.appId,entry.kind)!==entry)fail('task-owner-unavailable','应用任务所有者已更换，请重新准备。')}
 invoke(entry,method,...args){this.assert(entry);const task=Promise.resolve().then(()=>entry.owner[method](...args.map(value=>structuredClone(value))));entry.pending.add(task);void task.finally(()=>entry.pending.delete(task)).catch(()=>{});return task.then(value=>{this.assert(entry);return value})}
 async plan(input){
  if(!identifier(input.kind)||JSON.stringify(input.payload??null).length>32768)fail('task-owner-input-invalid','应用任务类型或来源选择无效。')
  const context=await this.directory.applications.resolveView(input.viewId);if(context.application.kind!=='deep')fail('deep-required','普通网页没有应用任务权限。')
  const entry=this.entry(context.instance.appId,input.kind)
  const plan=await this.invoke(entry,'prepare',{appId:context.instance.appId,instanceId:context.instance.id,viewId:context.view.id,roleId:input.roleId},input.payload??null)
  if(typeof plan?.id!=='string'||!plan.id||plan.id.length>256||typeof plan.text!=='string'||!Array.isArray(plan.contexts??[])||JSON.stringify(plan.token??null).length>32768)fail('task-owner-plan-invalid','应用未提供可验证的任务来源。')
  return {input:{viewId:input.viewId,roleId:input.roleId,text:plan.text,contexts:plan.contexts??[]},preparation:{kind:entry.kind,id:plan.id,ownerAppId:entry.appId,ownerVersion:entry.version,token:structuredClone(plan.token??null)}}
 }
 forTask(row){const p=row.preparation;if(!p?.ownerAppId||p.ownerAppId!==row.appId)fail('task-owner-invalid','任务来源与应用不匹配。');return this.entry(row.appId,p.kind,p.ownerVersion)}
 validate(row){return this.invoke(this.forTask(row),'validate',row)}
 beforeSubmit(row){return this.invoke(this.forTask(row),'beforeSubmit',row)}
 async reject(row){
  const entry=this.forTask(row)
  if(typeof entry.owner.notAdmitted!=='function')fail('task-owner-recovery-unavailable','Owner cannot recover proven no-admission; restore the compatible owner.')
  await this.invoke(entry,'notAdmitted',row)
  return this.directory.put({...row,ownerRejection:'done',notice:'未调用原生发送；应用发送标记已恢复，可重新准备。'})
 }
 async finalize(row){
  try{await this.invoke(this.forTask(row),'accepted',row);return await this.directory.put({...row,ownerFinalization:'done',notice:'已进入原生会话；应用发送标记已确认。'})}
  catch{return this.directory.put({...row,ownerFinalization:'pending',notice:'原生已接纳；应用发送标记待恢复。不会再次发送原生消息。'})}
 }
 async stop(row){try{const entry=this.forTask(row);if(typeof entry.owner.stop==='function')await this.invoke(entry,'stop',row)}catch{/* Owner absence must never prevent native Stop. Business claims remain honest. */}}
 async close(){const entries=[...this.entries.values()];for(const entry of entries)entry.active=false;this.entries.clear();await Promise.allSettled(entries.flatMap(entry=>[...entry.pending]))}
}
