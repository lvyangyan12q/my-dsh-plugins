import {randomUUID} from 'node:crypto'
import {controlledWebsiteEntry} from './web-policy.mjs'
import {ApplicationError} from './applications.mjs'
const reject=(code,message,status=403)=>{throw new ApplicationError(code,message,status)}
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key))
/** Ephemeral, explicitly granted website-module authority. Restart and pane close require fresh consent. */
export class WebBridgeDirectory{
 constructor({applications,compositions,resources,roles,tasks,gate}){Object.assign(this,{applications,compositions,resources,roles,tasks,gate});this.capabilities=new Map();this.closed=false}
 async target(viewId,moduleId,hostOrigin){
  const context=await this.applications.resolveView(viewId);await this.applications.assertEnabled(context.instance.appId)
  if(context.application.kind!=='deep'||!context.application.composition)reject('bridge-target','只有当前组合应用的网站模块支持桥接。')
  const row=await this.compositions.get(context.instance.appId),recipe=row.running,page=context.view.type==='page'?recipe.pages[0]:recipe.pages.find(page=>'page.'+page.id===context.view.type),module=page?.modules.find(module=>module.id===moduleId)
  if(module?.type!=='website')reject('bridge-target','网站模块已替换或移除。')
  let url;try{url=controlledWebsiteEntry(module.config?.url,hostOrigin)}catch(error){reject('bridge-origin',error.message)}const origin=new URL(url).origin,ref=recipe.connections.find(ref=>ref.id===module.connectionId)
  return {context,module,ref,url,origin,fingerprint:JSON.stringify([context.instance.id,context.instance.revision,context.application.lifecycleRevision,context.view.id,recipe.version,module,ref])}
 }
 open(input){return this.gate.run(async()=>{
  if(this.closed)reject('bridge-closed','桥接已关闭。')
  if(!exact(input,['viewId','moduleId','hostOrigin','allowRead','allowPrepare'])||typeof input.allowRead!=='boolean'||typeof input.allowPrepare!=='boolean'||!input.allowRead&&!input.allowPrepare)reject('bridge-input','请明确选择网站可用能力。')
  let host;try{host=new URL(input.hostOrigin);if(!['http:','https:'].includes(host.protocol)||host.origin!==input.hostOrigin)throw Error()}catch{reject('bridge-input','宿主来源无效。')}
  const target=await this.target(input.viewId,input.moduleId,input.hostOrigin)
  let resource=null,binding=null,contextRef=null
  if(input.allowRead&&!target.ref)reject('bridge-resource','请先在模块内选择数据连接。');if(target.ref&&(input.allowRead||input.allowPrepare)){const current=await this.resources.resolve({viewId:input.viewId,resourceId:target.ref.resourceId,action:'read'}),source=await this.applications.resolveView(target.ref.viewId);if(current.ownerInstanceId!==source.instance.id)reject('bridge-resource','资料授权与配方所选来源不一致。');resource={id:target.ref.resourceId,ownerInstanceId:current.ownerInstanceId,handler:current.handler,connectionId:current.connection?.id??null,revision:current.connection?.revision??null};contextRef={resourceId:target.ref.resourceId,...(target.module.config?.taskSelection!==undefined?{selection:structuredClone(target.module.config.taskSelection)}:{})}}
  if(input.allowPrepare){if(!target.module.roleId||!this.roles||!this.tasks)reject('bridge-role','请先关联并创建当前模块的角色。');const role=await this.roles.read(target.context.instance.id,target.module.roleId);if(role.unavailable||role.binding?.phase!=='ready')reject('bridge-role','模块角色会话尚未就绪。');binding={roleId:target.module.roleId,revision:role.binding.revision,sessionId:role.binding.sessionId};if(contextRef)try{await this.resources.captureTaskContexts(input.viewId,[contextRef])}catch{reject('bridge-context','所选资料尚无有效受控任务上下文。请在模块字段配置中按资料Owner协议设置taskSelection，或移除资料连接后准备纯文本任务。')}}
  const cap={id:randomUUID(),revision:1,epoch:randomUUID(),viewId:input.viewId,moduleId:input.moduleId,hostOrigin:input.hostOrigin,url:target.url,origin:target.origin,fingerprint:target.fingerprint,instanceId:target.context.instance.id,allowRead:input.allowRead,resource,contextRef,binding,active:true,expiresAt:Date.now()+600000,requests:new Set()};this.capabilities.set(cap.id,cap)
  return this.present(cap)
 })}
 present(cap){return {id:cap.id,revision:cap.revision,epoch:cap.epoch,viewId:cap.viewId,moduleId:cap.moduleId,hostOrigin:cap.hostOrigin,instanceId:cap.instanceId,url:cap.url,origin:cap.origin,expiresAt:cap.expiresAt,methods:[...(cap.allowRead?['read-resource']:[]),...(cap.binding?['prepare-task']:[])]}}
 async current(id,revision,epoch){
  const cap=this.capabilities.get(id);if(this.closed||!cap?.active||cap.revision!==revision||epoch!==undefined&&cap.epoch!==epoch||Date.now()>=cap.expiresAt)reject('bridge-revoked','网站桥接已撤销、关闭或过期，请显式重新启用。')
  const target=await this.target(cap.viewId,cap.moduleId,cap.hostOrigin);if(target.fingerprint!==cap.fingerprint)reject('bridge-changed','应用、实例或模块已改变，请重新启用桥接。')
  if(cap.binding){const role=await this.roles.read(cap.instanceId,cap.binding.roleId);if(role.unavailable||role.binding?.phase!=='ready'||role.binding.sessionId!==cap.binding.sessionId||role.binding.revision!==cap.binding.revision)reject('bridge-changed','角色关联已改变。')}
  if(cap.resource){const current=await this.resources.resolve({viewId:cap.viewId,resourceId:cap.resource.id,action:'read'});if(current.handler!==cap.resource.handler||current.ownerInstanceId!==cap.resource.ownerInstanceId||(current.connection?.id??null)!==cap.resource.connectionId||(current.connection?.revision??null)!==cap.resource.revision)reject('bridge-changed','资料授权已改变。')}
  return cap
 }
 revoke(id,revision){return this.gate.run(()=>{const cap=this.capabilities.get(id);if(cap&&cap.revision===revision){cap.active=false;cap.revision++}return {revoked:true}})}
 async request(input){
  const cap=await this.gate.run(async()=>{if(!exact(input,['capabilityId','revision','epoch','requestId','method','params'])||typeof input.requestId!=='string'||!/^[-a-zA-Z0-9_.]{1,80}$/.test(input.requestId)||typeof input.epoch!=='string'||input.epoch.length!==36||!Number.isSafeInteger(input.revision)||!exact(input.params, input.method==='prepare-task'?['text']:[]))reject('bridge-input','网页请求格式无效。');const cap=await this.current(input.capabilityId,input.revision,input.epoch);if(!this.present(cap).methods.includes(input.method))reject('bridge-method','网页仅可读取所选资料或准备任务。');if(cap.requests.has(input.requestId)||cap.requests.size>=64)reject('bridge-request','请求已使用或本次授权请求额度已用完。');cap.requests.add(input.requestId);return cap})
  let value
  if(input.method==='read-resource')value=(await this.resources.call({viewId:cap.viewId,resourceId:cap.resource.id,action:'read'})).value
  else value=await this.gate.run(async()=>{await this.current(cap.id,input.revision,input.epoch);const text=input.params.text;if(typeof text!=='string'||!text.trim()||text.length>4000)reject('bridge-input','网页任务说明需为1至4000字。');const row=await this.tasks.prepareFromWeb({viewId:cap.viewId,roleId:cap.binding.roleId,text:'网页请求（不可信输入，需在原生任务面板审阅）：'+cap.origin+'\n'+text,contexts:cap.contextRef?[structuredClone(cap.contextRef)]:[]},{kind:'website-module',origin:cap.origin,moduleId:cap.moduleId,capabilityId:cap.id,revision:cap.revision});return {taskId:row.id,revision:row.revision,status:row.status,notice:'仅已准备，请在当前应用AI任务面板审阅并显式发送。'}})
  return this.gate.run(async()=>{await this.current(cap.id,input.revision,input.epoch);if(Buffer.byteLength(JSON.stringify(value),'utf8')>65536)reject('bridge-result-size','所选资源过大，网页未收到资料。',413);return structuredClone(value)})
 }
 frame(id){return this.gate.run(async()=>{const cap=this.capabilities.get(id);if(!cap)reject('bridge-revoked','桥接不存在。');await this.current(id,cap.revision,cap.epoch);return this.present(cap)})}
 close(){this.closed=true;for(const cap of this.capabilities.values())cap.active=false;this.capabilities.clear();return Promise.resolve()}
}
