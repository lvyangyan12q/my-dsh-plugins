import {createHash} from 'node:crypto'
import {isAbsolute} from 'node:path'

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const keyOf=(instanceId,roleId)=>JSON.stringify([instanceId,roleId])
const text=value=>typeof value==='string'&&value.length>0&&value.length<=4096
const session=row=>({sessionId:row.sessionId,presetId:row.presetId,creation:{cwd:row.creation.cwd}})

/** One trusted application inspector; browser callers can select a source key, never supply a binding. */
export class RoleAdoptions {
 constructor(directory,reject){this.directory=directory;this.reject=reject;this.owners=new Map()}
 contribute(appId,inspector){
  if(this.directory.closing)this.reject('unavailable','角色所有者已关闭。')
  const definitions=this.directory.roles.get(appId)
  if(!definitions||typeof inspector?.inspect!=='function'||this.owners.has(appId))this.reject('legacy-owner-invalid','旧绑定检查器需要有效且唯一的应用角色所有者。')
  const owner={inspector,definitions,active:true};this.owners.set(appId,owner)
  return()=>{owner.active=false;if(this.owners.get(appId)===owner)this.owners.delete(appId);return this.directory.pending.then(()=>{})}
 }
 assertOwner(appId,owner){
  if(!owner?.active||this.owners.get(appId)!==owner||this.directory.roles.get(appId)!==owner.definitions)this.reject('legacy-source-unavailable','旧绑定检查器已结束，请重新预览；原记录保留。')
 }
 close(){for(const owner of this.owners.values())owner.active=false;this.owners.clear()}
 source(value,sourceKey,roleId){
  if(!value||value.sourceKey!==sourceKey||value.roleId!==roleId||!text(value.revision)||!['ready','intent'].includes(value.phase)||!text(value.sessionId)||!text(value.presetId)||!isAbsolute(value.creation?.cwd??'')||value.previousSessions!==undefined&&!Array.isArray(value.previousSessions)||value.previousSessionIds!==undefined&&!Array.isArray(value.previousSessionIds)||value.previousSessions===undefined&&value.previousSessionIds===undefined||(value.previousSessions?.length??value.previousSessionIds?.length)>256||value.selectedPreset!==undefined&&typeof value.selectedPreset!=='boolean')this.reject('legacy-source-invalid','旧绑定缺少可验证的身份、目录、阶段或来源版本。')
  const previous=(value.previousSessions??[]).map(row=>{
   if(!text(row?.sessionId)||!text(row.presetId)||!isAbsolute(row.creation?.cwd??''))this.reject('legacy-history-invalid','历史会话缺少独立的Agent或目录证据，未接管。')
   return session(row)
  })
  const raw=value.previousSessionIds
  if(raw&&(raw.length>256||raw.some(id=>!text(id))||value.previousSessions!==undefined&&JSON.stringify(raw)!==JSON.stringify(previous.map(row=>row.sessionId))))this.reject('legacy-history-invalid','历史会话身份列表冲突或无效。')
  const ids=[value.sessionId,...(raw??previous.map(row=>row.sessionId))]
  if(new Set(ids).size!==ids.length)this.reject('legacy-history-invalid','旧绑定包含重复的当前或历史会话身份。')
  return {sourceKey,revision:value.revision,roleId,...session(value),phase:value.phase,selectedPreset:value.selectedPreset??false,previousSessions:previous,...(raw?{previousSessionIds:[...raw]}:{}),...(value.agent?{agent:structuredClone(value.agent)}:{})}
 }
 async inspectTrusted(appId,roleId,sourceKey,target){
  const directory=this.directory
  if(!text(sourceKey))this.reject('legacy-source-invalid','旧绑定来源标识无效。')
  await directory.applications.assertEnabled?.(appId)
  const owner=this.owners.get(appId);this.assertOwner(appId,owner)
  const definition=owner.definitions.find(row=>row.id===roleId)
  if(!definition)this.reject('role-unavailable','应用未声明此角色。')
  let inspected
  try{
   if(target)inspected=await owner.inspector.inspect(sourceKey,target)
   else{
    if(typeof owner.inspector.inspectSource!=='function')this.reject('legacy-source-unavailable','旧绑定检查器未提供无目标只读检查能力。')
    inspected=await owner.inspector.inspectSource(sourceKey,{roleId})
   }
  }catch{this.reject('legacy-source-unavailable','旧绑定来源暂不可读，未执行接管。')}
  this.assertOwner(appId,owner)
  const source=this.source(inspected,sourceKey,roleId)
  if(source.previousSessionIds){
   if(typeof directory.authority.hydrateLegacy!=='function')this.reject('legacy-validation-unavailable','当前宿主缺少历史身份公开读取能力。')
   const hydrated=[]
   for(const id of source.previousSessionIds){
    const actual=await directory.authority.hydrateLegacy(id)
    const declared=source.previousSessions.find(row=>row.sessionId===id)
    if(declared&&(declared.presetId!==actual.presetId||declared.creation.cwd!==actual.creation.cwd))this.reject('legacy-history-invalid','历史身份声明与原生事实冲突。')
    hydrated.push(session(actual))
   }
   source.previousSessions=hydrated;delete source.previousSessionIds
  }
  const agent=source.agent??definition.agent
  const capability=await directory.authority.validate({...definition,agent,creation:source.creation},appId)
  if(capability.presetId!==source.presetId)this.reject('legacy-agent-unmapped','旧Agent选择尚未映射到同一原生预设，未重建或替换。')
  if(typeof directory.authority.validateLegacy!=='function')this.reject('legacy-validation-unavailable','当前宿主缺少旧绑定公开校验能力。')
  const evidence=[await directory.authority.validateLegacy(source,{allowMissing:source.phase==='intent'})]
  for(const previous of source.previousSessions)evidence.push(await directory.authority.validateLegacy(previous))
  this.assertOwner(appId,owner)
  return {owner,definition,source,sourceFingerprint:digest(source),inspectionFingerprint:digest({source,definition,evidence}),evidence}
 }
 async inspect(appId,roleId,sourceKey,target){
  try{
   const plan=await this.inspectTrusted(appId,roleId,sourceKey)
   if(target)await this.checkOwnership(appId,roleId,target.instanceId,plan)
   return {status:'ready',fingerprint:plan.inspectionFingerprint,blockers:[],source:{...plan.source,agent:plan.source.agent??plan.definition.agent},native:plan.evidence}
  }catch(error){return {status:'blocked',fingerprint:null,blockers:[{code:error.code??'legacy-preview-failed',reason:error.code?error.message:'旧绑定无法验证，原记录保留。'}]}}
 }
 async checkOwnership(appId,roleId,instanceId,plan){
  if(!text(instanceId))this.reject('legacy-target-invalid','接管预检需要固定目标身份。')
  const {source,sourceFingerprint}=plan,state=await this.directory.store.snapshot(),key=keyOf(instanceId,roleId),binding=state.bindings.find(row=>row.key===key)??null
  if(state.bindings.some(row=>row.key!==key&&row.appId===appId&&row.adoption?.sourceKey===source.sourceKey))this.reject('legacy-source-owned','旧绑定来源已经接管到其他实例或角色。')
  if(binding&&(!binding.adoption||binding.adoption.sourceKey!==source.sourceKey||binding.adoption.sourceFingerprint!==sourceFingerprint||binding.revision!==binding.adoption.bindingRevision))this.reject('adoption-binding-changed','目标角色已有不同或更新的绑定，未覆盖原身份。')
  const ids=new Set([source.sessionId,...source.previousSessions.map(row=>row.sessionId)])
  if(state.bindings.some(row=>row.key!==key&&[row.sessionId,...row.previousSessionIds].some(id=>ids.has(id))))this.reject('session-owned','当前或历史原生会话已归属其他角色或实例。')
  this.assertOwner(appId,plan.owner)
  return binding
 }
 async prepare(instanceId,roleId,sourceKey){
  const directory=this.directory
  const {instance}=await directory.definition(instanceId,roleId,true)
  const plan=await this.inspectTrusted(instance.appId,roleId,sourceKey,{instanceId,roleId})
  const {definition,source,evidence}=plan
  const binding=await this.checkOwnership(instance.appId,roleId,instanceId,plan)
  await directory.applications.assertInstanceReady?.(instanceId,true)
  const fingerprint=binding?.adoption.fingerprint??digest({source,definition,instanceRevision:instance.revision,binding,evidence})
  return {...plan,instance,binding,fingerprint}
 }
 async preview(instanceId,roleId,sourceKey){
  try{
   const plan=await this.prepare(instanceId,roleId,sourceKey)
   return {status:plan.binding?'applied':'ready',fingerprint:plan.fingerprint,sourceFingerprint:plan.inspectionFingerprint,blockers:[],source:{...plan.source,agent:plan.source.agent??plan.definition.agent},target:{appId:plan.instance.appId,instanceId,roleId},native:plan.evidence}
  }catch(error){return {status:'blocked',fingerprint:null,blockers:[{code:error.code??'legacy-preview-failed',reason:error.code?error.message:'旧绑定无法验证，原记录保留。'}]}}
 }
 async apply(instanceId,roleId,sourceKey,fingerprint,confirmed){
  if(confirmed!==true)this.reject('confirmation-required','请先确认本次旧绑定接管预览。')
  const plan=await this.prepare(instanceId,roleId,sourceKey)
  if(plan.fingerprint!==fingerprint)this.reject('adoption-preview-changed','来源、原生身份或目标已变化，请重新预览，未覆盖旧记录。')
  if(plan.binding)return structuredClone(plan.binding)
  const {source,instance,definition}=plan,key=keyOf(instanceId,roleId)
  const row={key,instanceId,roleId,appId:instance.appId,agent:source.agent??definition.agent,presetId:source.presetId,creation:source.creation,sessionId:source.sessionId,revision:1,phase:source.phase,selectedPreset:source.selectedPreset,previousSessionIds:source.previousSessions.map(row=>row.sessionId),historicalSessions:source.previousSessions,adoption:{sourceKey,sourceRevision:source.revision,sourceFingerprint:plan.sourceFingerprint,fingerprint,bindingRevision:1},...(source.phase==='intent'?{creationAttempt:'started'}:{})}
  await this.directory.store.change(data=>{
   this.assertOwner(instance.appId,plan.owner)
   if(data.bindings.some(saved=>saved.key===key))this.reject('adoption-binding-changed','目标角色已更新，请重新预览。')
   const ids=new Set([row.sessionId,...row.previousSessionIds])
   if(data.bindings.some(saved=>[saved.sessionId,...saved.previousSessionIds].some(id=>ids.has(id))||saved.appId===row.appId&&saved.adoption?.sourceKey===sourceKey))this.reject('session-owned','旧绑定或会话已由其他操作接管。')
   data.schema=3;data.bindings.push(row);return row
  })
  return structuredClone(row)
 }
 async resolveSession(appId,sessionId,{access='read'}={}){
  const directory=this.directory
  if(!['read','write'].includes(access))this.reject('session-access-invalid','应用工具访问模式无效。')
  const binding=(await directory.store.snapshot()).bindings.find(row=>row.appId===appId&&(row.sessionId===sessionId||row.previousSessionIds.includes(sessionId)))
  if(!binding)this.reject('session-unbound','该原生会话没有此应用的可信实例绑定。')
  await directory.definition(binding.instanceId,binding.roleId)
  await directory.applications.assertEnabled?.(appId)
  const history=binding.sessionId!==sessionId
  if(history){
   if(access==='write')this.reject('history-read-only','历史会话只读，不能作为当前教学或修改学习记录的工具上下文。')
   const evidence=binding.historicalSessions?.find(row=>row.sessionId===sessionId)
   if(!evidence||!directory.authority.validateLegacy)this.reject('history-evidence-missing','历史会话缺少独立身份依据，拒绝提供应用工具上下文。')
   await directory.authority.validateLegacy(evidence)
  }else{
   if(binding.phase!=='ready')this.reject('role-not-ready','旧创建仍待明确恢复，不能作为当前教学或写入会话。')
   const {unavailable}=await directory.read(binding.instanceId,binding.roleId)
   if(unavailable)this.reject(unavailable.code,unavailable.reason)
  }
  return {appId,instanceId:binding.instanceId,roleId:binding.roleId,sessionId,kind:history?'history':'current',readOnly:history}
 }
}
