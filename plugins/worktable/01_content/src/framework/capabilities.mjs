import {AdmissionGate} from './admission.mjs'
import {WORKSPACE_BASE,managedAgentDefinition,assertManagedComposition} from './capability-native.mjs'
import {reject} from './roles.mjs'
const identity=row=>JSON.stringify([row.kind,row.id])
/** Public directory is exclusively management provenance, never a projection of all native presets. */
export class CapabilityDirectory {
 constructor(store,native,gate=new AdmissionGate()){this.gate=gate;this.store=store;this.native=native;this.private=new Map();this.removers=new Map();this.failures=new Map();this.pending=Promise.resolve();this.closing=false}
 async list(appId){const rows=(await this.store.snapshot()).capabilities.map(row=>({...row,...(this.failures.has(identity(row))?{unavailable:this.failures.get(identity(row))}:{})}));return structuredClone([...rows,...(appId?this.private.get(appId)??[]:[])])}
 contribute(appId,definitions){if(this.private.has(appId)||!Array.isArray(definitions))reject('capability-conflict','私有能力重复声明。');const seen=new Set();const rows=definitions.map(row=>{if(!['agent','skill'].includes(row.kind)||typeof row.id!=='string'||!row.id.trim()||seen.has(identity(row))||(row.kind==='agent'?!row.presetId:!row.provider))reject('capability-invalid','私有能力必须声明原生身份与provider。');seen.add(identity(row));return {...structuredClone(row),source:'application',ownerAppId:appId}});this.private.set(appId,rows);return()=>{if(this.private.get(appId)===rows)this.private.delete(appId)}}
 async install(row,verify=false){
  const key=identity(row);this.failures.delete(key)
  if(!row.enabled)return
  let remove
  try{
   if(row.kind==='agent')remove=await this.native.agentPresets.register(managedAgentDefinition(row))
   else remove=this.native.skills.register({name:row.id,description:row.description||row.title,content:row.content,source:'runtime',provider:row.provider,invocation:{userInvocable:row.userInvocable,modelInvocable:row.modelInvocable}})
   this.removers.set(key,remove)
   if(verify&&row.kind==='agent'){if(row.baseComposition!==undefined)await assertManagedComposition(this.native.agentPresets,row);else{const preset=await this.native.agentPresets.resolve(row.presetId);if(preset.broken)reject('agent-unavailable','原生Agent不可用：'+preset.broken)}}
  }catch(error){
   // Only a disposer returned for this registration is ours; conflicts never authorize deleting another owner.
   try{await remove?.()}catch{}
   if(this.removers.get(key)===remove)this.removers.delete(key)
   this.failures.set(key,{code:'capability-registration-failed',reason:error.message??'能力注册失败，请编辑或停用后保存。'})
   throw error
  }
 }
 /** Host activation must not call native diagnostics: those may await this same Loader activation. */
 async restore(){const rows=await this.list();for(const row of [...rows.filter(row=>row.kind==='skill'),...rows.filter(row=>row.kind==='agent')]){try{await this.install(row)}catch{/* Retain the failed record and its editable per-capability diagnostic. */}}}
 save(input,expectedRevision){return this.gate.run(()=>this.saveWithin(input,expectedRevision))}
 saveWithin(input,expectedRevision){if(this.closing)return Promise.reject(new Error('Capabilities unavailable'));const task=this.pending.then(async()=>{
  if(!['agent','skill'].includes(input?.kind)||! /^[a-z][a-z0-9.-]{0,79}$/.test(input.id)||typeof input.title!=='string'||!input.title.trim()||input.title.length>200||typeof input.content!=='string'||!input.content.trim()||input.content.length>64000||typeof input.enabled!=='boolean'||typeof input.userInvocable!=='boolean'||typeof input.modelInvocable!=='boolean')reject('capability-invalid','请填写能力标识、名称、内容与调用许可。')
  if(input.kind==='agent'&&input.baseComposition!==WORKSPACE_BASE)reject('base-required','请显式选择Agent基础能力。');
  const all=await this.list(),old=all.find(row=>identity(row)===identity(input));if((old?.revision??0)!==expectedRevision)reject('revision-conflict','能力已更新，请刷新。')
  const skillIds=input.kind==='agent'?input.skillIds??[]:[];if(!Array.isArray(skillIds)||skillIds.some(id=>typeof id!=='string'||!all.some(row=>row.kind==='skill'&&row.id===id)))reject('skill-unmanaged','Agent只能引用Skills管理入口建立的Skill。')
  if(input.kind==='skill'&&!old){const snapshot=await this.native.skills.snapshot();if(!snapshot.complete)reject('catalog-incomplete','Skills目录不完整。');if(snapshot.skills.some(row=>row.name===input.id))reject('skill-conflict','原生Skill已使用这个名称，请选择新标识。')}
  const next={kind:input.kind,id:input.id,title:input.title.trim(),description:typeof input.description==='string'?input.description.slice(0,4000):'',content:input.content,enabled:input.enabled,userInvocable:input.userInvocable,modelInvocable:input.modelInvocable,skillIds,source:'managed',revision:expectedRevision+1,...(input.kind==='agent'?{presetId:'worktable.managed.'+input.id,baseComposition:input.baseComposition}:{provider:'worktable-managed'})}
  await this.removers.get(identity(next))?.();this.removers.delete(identity(next))
  try{await this.install(next,true);await this.store.change(data=>{const index=data.capabilities.findIndex(row=>identity(row)===identity(next));if(index<0)data.capabilities.push(next);else data.capabilities[index]=next;return next})}catch(error){await this.removers.get(identity(next))?.();this.removers.delete(identity(next));if(old){try{await this.install(old,true)}catch{/* Keep rollback diagnostics; report the original explicit-save failure. */}}else this.failures.delete(identity(next));throw error}
  return next
 });this.pending=task.catch(()=>{});return task}
 async record(reference,appId,invocation='user'){if(!['user','model'].includes(invocation))reject('invocation-invalid','能力调用方式无效。');if(!reference||!['agent','skill'].includes(reference.kind)||!['managed','application'].includes(reference.source))reject('capability-invalid','能力来源无效。');if(reference.source==='application'&&reference.ownerAppId!==appId)reject('capability-owner','应用私有能力所有权不匹配。');const rows=reference.source==='managed'?(await this.store.snapshot()).capabilities:this.private.get(appId)??[];const row=rows.find(row=>row.kind===reference.kind&&row.id===reference.id);if(!row)reject('capability-missing','能力缺失，不能自动替换。');if(reference.source==='managed'&&this.failures.has(identity(row)))reject('capability-unavailable',this.failures.get(identity(row)).reason);if(!row.enabled||!row[invocation==='model'?'modelInvocable':'userInvocable'])reject('capability-disabled',invocation==='model'?'能力已停用或不允许模型调用。':'能力已停用或不允许用户调用。');return row}
 async validate(reference,appId,cwd,invocation='user'){
  await this.pending;const row=await this.record(reference,appId,invocation)
  try{
   if(row.kind==='agent'){
    const preset=await this.native.agentPresets.resolve(row.presetId)
    if(preset.broken)reject('agent-unavailable','原生Agent不可用：'+preset.broken)
    if(row.source==='managed')await assertManagedComposition(this.native.agentPresets,row)
    return row
   }
   const skill=await this.native.skills.get(row.id,{cwd})
   if(!skill||skill.provider!==row.provider||!skill.invocation[invocation==='model'?'modelInvocable':'userInvocable'])reject('skill-unavailable','Skill缺失、来源不同或不允许'+(invocation==='model'?'模型调用。':'用户调用。'))
   return row
  }catch(error){
   if(reference.source==='managed'&&row.kind==='agent')this.failures.set(identity(row),{code:error.code??'capability-unavailable',reason:error.message??'原生能力不可用。'})
   throw error
  }
 }
 async validateRole(definition,appId){const row=await this.validate(definition.agent,appId,definition.creation.cwd);const lease=await this.native.agentPresets.acquireScope(row.presetId);try{const snapshot=await this.native.skills.snapshot({scope:lease.key,cwd:definition.creation.cwd});if(!snapshot.complete)reject('catalog-incomplete','角色Skills目录不完整。');const references=[...(definition.skills??[]),...(row.skillIds??[]).map(id=>({kind:'skill',source:'managed',id}))];for(const ref of references){if(ref.kind!=='skill')reject('capability-invalid','角色Skill引用无效。');const record=await this.record(ref,appId,'model');const skill=await this.native.skills.get(record.id,{scope:lease.key,cwd:definition.creation.cwd});if(!skill||skill.provider!==record.provider||!skill.invocation.modelInvocable)reject('skill-unavailable','角色Skill缺失、来源不同或不允许模型调用。')}}finally{await lease[Symbol.asyncDispose]()}return row}
 async dispose(){this.closing=true;await this.pending;for(const remove of this.removers.values())await remove();this.removers.clear()}
}
