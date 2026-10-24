import {AsyncLocalStorage} from 'node:async_hooks'
import {compositionDefinition} from './composition-schema.mjs'
import {applicationState,applicationSchema} from './state-schema.mjs'
import {AdmissionGate} from './admission.mjs'
import {ProfileFileStore} from './persistence.mjs'
import { randomUUID } from 'node:crypto'
import { websiteEntry } from './web-policy.mjs'

export class ApplicationError extends Error {
  constructor(code, message, status=400) { super(message); this.code=code; this.status=status }
}
function projectScope(value,required=false){if((value===null||value===undefined)&&!required)return null;if(typeof value!=='string'||!value.trim())throw new ApplicationError('invalid-project','项目作用域无效，请选择项目或明确未归属。');return value}
function nextUse(data){return data.instances.reduce((time,item)=>Math.max(time,item.lastOpenedAt+1),Date.now())}

/** Profile-owned directory. Public methods return detached records; no DOM or session globals. */
export class ApplicationDirectory {
  provisionContext=new AsyncLocalStorage()
  /** Trusted backend scope only; browser IDs never confer this authority. */
  async withProvision(operationId,operation){
    this.provisionIdentity(operationId,operationId)
    const token={operationId,active:true,contributions:new Map(this.contributions)}
    try{return await this.provisionContext.run(token,operation)}finally{token.active=false}
  }
  async assertInstanceReady(instanceId,allowProvision=false){
    await this.pending;const data=await this.read(),instance=this.instance(data,instanceId)
    const receipt=data.provisions?.find(row=>row.kind==='instance-admission'&&row.id===instanceId)
    if(receipt?.state==='ready'||!receipt&&!data.provisions?.some(row=>row.kind==='instance'&&row.id===instanceId))return
    const token=this.provisionContext.getStore()
    if(allowProvision&&token?.active&&token.operationId===(receipt??data.provisions.find(row=>row.kind==='instance'&&row.id===instanceId)).operationId&&token.contributions.get(instance.appId)===this.contributions.get(instance.appId)&&this.contributions.has(instance.appId))return
    throw new ApplicationError('instance-not-ready','实例接管尚未完成；请由原应用明确恢复同一操作。',409)
  }
  completeProvision(instanceId,operationId){return this.change(data=>{
    const instance=this.instance(data,instanceId);this.application(data,instance.appId)
    const token=this.provisionContext.getStore()
    if(!token?.active||token.operationId!==operationId||!this.contributions.has(instance.appId)||token.contributions.get(instance.appId)!==this.contributions.get(instance.appId))throw new ApplicationError('provision-authority-expired','Trusted provisioning scope expired.',409)
    const receipt=data.provisions?.find(row=>row.kind==='instance-admission'&&row.id===instanceId)
    if(!receipt||receipt.operationId!==operationId)throw new ApplicationError('provision-conflict','接管操作身份不匹配。',409)
    receipt.state='ready';return instance
  })}
  constructor(file,options={}) { this.gate=options.gate??new AdmissionGate(); this.file=file; this.hostOrigin=options.hostOrigin; this.pending=Promise.resolve(); this.contributions=new Map(); this.closing=false; this.store=new ProfileFileStore(file,()=>({schema:1,applications:[],instances:[],views:[]}),applicationState,[1,2,3,4,5]) }
  setReadinessGuard(guard){if(typeof guard!=='function')throw new TypeError('Readiness guard required');this.readinessGuard=guard;return()=>{if(this.readinessGuard===guard)this.readinessGuard=null}}
  async read() {if(this.closing)throw new ApplicationError('unavailable','应用状态所有者已关闭。',503);return this.store.read()}
  close(){if(!this.closePromise){this.closing=true;this.closePromise=this.gate.run(async()=>{await this.pending;await this.store.close()})}return this.closePromise}
  change(operation,committed=()=>{}) {if(this.closing)return Promise.reject(new ApplicationError('unavailable','应用状态所有者已关闭。',503));return this.gate.run(()=>{if(this.closing)throw new ApplicationError('unavailable','应用状态所有者已关闭。',503);return this.changeWithin(operation,committed)})}
  async changeWithin(operation,committed=()=>{}) {
    const result=this.pending.then(async()=>{
      const data=await this.read(); const value=operation(data)
      data.schema=applicationSchema(data)
      await this.store.write(data)
      committed(value)
      return structuredClone(value)
    })
    this.pending=result.catch(()=>{}); return result
  }
  /** Trusted plugin-only registration; disposer never deletes durable instances or views. */
  async contribute(definition) {
    if(definition?.protocolVersion!==1) throw new ApplicationError('protocol-incompatible','应用协议版本不兼容。')
    if(definition.kind!=='deep'||typeof definition.id!=='string'||!/^[a-z][a-z0-9.-]{0,79}$/.test(definition.id)||typeof definition.title!=='string'||!definition.title.trim()||typeof definition.version!=='string'||!definition.version.trim()||!Array.isArray(definition.views)||!definition.views.length||definition.views.length>32) throw new ApplicationError('invalid-definition','深度应用定义无效。')
    const ids=new Set()
    const views=definition.views.map(view=>{if(typeof view.id!=='string'||!/^[a-z][a-z0-9.-]{0,79}$/.test(view.id)||ids.has(view.id)||typeof view.title!=='string'||!view.title.trim())throw new ApplicationError('invalid-definition','应用视图定义无效。');ids.add(view.id);return {id:view.id,title:view.title.trim()}})
    if(!ids.has('page'))throw new ApplicationError('invalid-definition','深度应用必须提供完整页面。')
    const clean={id:definition.id,title:definition.title.trim(),version:definition.version,protocolVersion:1,kind:'deep',views}
    // Reserve the identity in the same queue as website registration; publish only after durable commit.
    await this.change(data=>{
      if(data.compositions?.some(row=>row.appId===clean.id)||data.applications.some(app=>app.id===clean.id)||this.contributions.has(clean.id))throw new ApplicationError('application-conflict','应用标识已注册，请使用不同标识。',409)
      data.deepApplicationIds??=[]
      if(!data.deepApplicationIds.includes(clean.id))data.deepApplicationIds.push(clean.id)
      return clean
    },()=>this.contributions.set(clean.id,clean))
    return ()=>{if(this.contributions.get(clean.id)===clean)this.contributions.delete(clean.id)}
  }
  async register(definition) {
    if(definition?.protocolVersion!==1) throw new ApplicationError('protocol-incompatible','应用协议版本不兼容，当前支持版本1。')
    if(typeof definition.id!=='string'||!/^[a-z][a-z0-9.-]{0,79}$/.test(definition.id) || typeof definition.title!=='string'||!definition.title.trim() || typeof definition.version!=='string'||!definition.version.trim() || definition.kind!=='web') throw new ApplicationError('invalid-definition','请填写应用标识、名称、版本和网页入口。')
    let url
    try {url=websiteEntry(definition.url,this.hostOrigin)} catch(error) {throw new ApplicationError('unsafe-entry',error.message)}
    const clean={id:definition.id,title:definition.title.trim(),version:definition.version,protocolVersion:1,kind:'web',url}
    return this.change(data=>{ if(data.compositions?.some(row=>row.appId===clean.id)||data.deepApplicationIds?.includes(clean.id)||this.contributions.has(clean.id)||data.applications.some(a=>a.id===clean.id)) throw new ApplicationError('application-conflict','应用标识已注册，请使用不同标识。',409);data.applications.push(clean);return clean })
  }
  async catalog() { await this.pending; return structuredClone(this.available(await this.read())) }
  async unregister(appId) {return this.change(data=>{if(this.contributions.has(appId)||(data.compositions??[]).some(row=>row.appId===appId))throw new ApplicationError('contribution-owned','请由贡献应用的插件生命周期撤销入口。',409);this.application(data,appId);data.applications=data.applications.filter(a=>a.id!==appId);return {id:appId,removed:true}})}
  available(data) {return [...data.applications.filter(a=>!this.contributions.has(a.id)),...this.contributions.values(),...(data.compositions??[]).filter(row=>row.running).map(compositionDefinition)].map(app=>({...app,...this.lifecycle(data,app.id)}))}
  lifecycle(data,appId){const row=data.lifecycle?.find(row=>row.appId===appId);return {enabled:row?.enabled??true,lifecycleRevision:row?.revision??0}}
  setEnabled(appId,enabled,revision){return this.change(data=>{if(typeof enabled!=='boolean'||!Number.isSafeInteger(revision)||revision<0)throw new ApplicationError('invalid-lifecycle','停用操作需要明确状态与版本。');if(![...data.applications.map(a=>a.id),...(data.deepApplicationIds??[]),...(data.compositions??[]).filter(row=>row.running).map(row=>row.appId),...(data.lifecycle??[]).map(row=>row.appId)].includes(appId))throw new ApplicationError('application-missing','应用身份不存在。',404);const current=this.lifecycle(data,appId);if(current.lifecycleRevision!==revision)throw new ApplicationError('revision-conflict','应用状态已改变，请刷新。',409);data.lifecycle??=[];const next={appId,enabled,revision:revision+1},index=data.lifecycle.findIndex(row=>row.appId===appId);if(index<0)data.lifecycle.push(next);else data.lifecycle[index]=next;data.schema=data.presentationStates?.length?4:data.compositions?.length?3:data.lifecycle.some(row=>!row.enabled)?2:1;return next})}
  assertAvailable(data,appId){const app=this.application(data,appId);if(!app.enabled)throw new ApplicationError('application-disabled','应用已停用；新实例和新任务已阻止，历史原生会话保留。',409);return app}
  async assertReadiness(appId){await this.readinessGuard?.(appId)}
  async assertEnabled(appId){await this.pending;await this.assertReadiness(appId);return structuredClone(this.assertAvailable(await this.read(),appId))}
  async resolveStoredView(id){await this.pending;const data=await this.read(),view=data.views.find(row=>row.id===id);if(!view)throw new ApplicationError('view-missing','持久视图不存在。',404);return structuredClone({view,instance:this.instance(data,view.instanceId)})}

  application(data,id) { const found=this.available(data).find(a=>a.id===id); if(!found) throw new ApplicationError('application-missing','应用未注册或已移除；实例记录保留。',404); return found }
  instance(data,id) { const found=data.instances.find(a=>a.id===id); if(!found) throw new ApplicationError('instance-missing','实例不存在；请检查入口。',404); return found }
  async latest(appId,projectId) {
    projectId=projectScope(projectId)
    await this.pending; const data=await this.read(); this.application(data,appId)
    return structuredClone(data.instances.filter(i=>i.appId===appId && i.projectId===projectId).sort((a,b)=>b.lastOpenedAt-a.lastOpenedAt)[0]??null)
  }
  async createInstance(appId,projectId) {
    projectId=projectScope(projectId)
    return this.gate.run(async()=>{await this.readinessGuard?.(appId);return this.changeWithin(data=>{ this.assertAvailable(data,appId); const record={id:randomUUID(),appId,projectId,revision:1,createdAt:Date.now(),lastOpenedAt:nextUse(data)}; data.instances.push(record);return record })})
  }
  /** Trusted Host import intent only. Browser create never accepts caller-selected IDs. */
  ensureInstance({id,appId,projectId,operationId}) {
    this.provisionIdentity(id,operationId);projectId=projectScope(projectId)
    return this.gate.run(async()=>{await this.readinessGuard?.(appId);return this.changeWithin(data=>{
      this.assertAvailable(data,appId);const previous=data.instances.find(row=>row.id===id),receipt=data.provisions?.find(row=>row.kind==='instance'&&row.id===id)
      if(previous){if(!receipt||receipt.operationId!==operationId||previous.appId!==appId||previous.projectId!==projectId)throw new ApplicationError('provision-conflict','目标实例已存在且不属于此接管意图，未覆盖。',409);if(!data.provisions.some(row=>row.kind==='instance-admission'&&row.id===id))data.provisions.push({kind:'instance-admission',id,operationId,state:'pending'});return previous}
      if(receipt)throw new ApplicationError('provision-conflict','接管实例回执与目标不一致，未重建。',409)
      const record={id,appId,projectId,revision:1,createdAt:Date.now(),lastOpenedAt:nextUse(data)}
      data.instances.push(record);data.provisions??=[];data.provisions.push({kind:'instance',id,operationId},{kind:'instance-admission',id,operationId,state:'pending'});return record
    })})
  }
  provisionIdentity(id,operationId){const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);if(!uuid(id)||!uuid(operationId))throw new ApplicationError('provision-invalid','接管需要固定的实例/视图与操作 UUID。',400)}
  ensureView({id,instanceId,type='page',operationId}) {
    this.provisionIdentity(id,operationId)
    return this.change(data=>{
      const instance=this.instance(data,instanceId),app=this.application(data,instance.appId)
      if(typeof type!=='string'||(app.kind==='deep'?!app.views.some(row=>row.id===type):type!=='page'))throw new ApplicationError('view-unsupported','应用未声明此视图。')
      const previous=data.views.find(row=>row.id===id),receipt=data.provisions?.find(row=>row.kind==='view'&&row.id===id)
      if(previous){if(!receipt||receipt.operationId!==operationId||previous.instanceId!==instanceId||previous.type!==type)throw new ApplicationError('provision-conflict','目标视图已存在且不属于此接管意图，未覆盖。',409);return previous}
      if(receipt)throw new ApplicationError('provision-conflict','接管视图回执与目标不一致，未重建。',409)
      const view={id,instanceId,type};data.views.push(view);data.provisions??=[];data.provisions.push({kind:'view',id,operationId});instance.lastOpenedAt=nextUse(data);return view
    })
  }
  async resume(id) {
    await this.assertInstanceReady(id)
    return this.change(data=>{const instance=this.instance(data,id);this.application(data,instance.appId);instance.lastOpenedAt=nextUse(data);return instance})
  }
  async attach(id,projectId,revision) {
    await this.assertInstanceReady(id)
    projectId=projectScope(projectId,true)
    return this.change(data=>{
      const record=this.instance(data,id)
      if(record.projectId!==null && record.projectId!==projectId) throw new ApplicationError('project-conflict','该实例已关联其他项目，请显式新建实例。',409)
      if(record.projectId===projectId)return record
      if(record.revision!==revision) throw new ApplicationError('revision-conflict','实例已更新，请刷新后重试。',409)
      record.projectId=projectId; record.revision++; return record
    })
  }
  async createView(id,type='page') {
    await this.assertInstanceReady(id)
    return this.change(data=>{ const instance=this.instance(data,id);const app=this.application(data,instance.appId);if(typeof type!=='string'||(app.kind==='deep'?!app.views.some(v=>v.id===type):type!=='page'))throw new ApplicationError('view-unsupported','应用未声明此视图，请选择可用模块。'); const view={id:randomUUID(),instanceId:id,type};data.views.push(view);instance.lastOpenedAt=nextUse(data);return view })
  }
  async resolveView(id) {
    await this.pending; const data=await this.read();const view=data.views.find(v=>v.id===id)
    if(!view) throw new ApplicationError('view-missing','视图不存在；请从应用入口继续。',404)
    const instance=this.instance(data,view.instanceId);await this.assertInstanceReady(instance.id,true);return structuredClone({view,instance,application:this.application(data,instance.appId)})
  }
  async snapshot() {await this.pending;const data=await this.read();return structuredClone({...data,applications:this.available(data)})}
}
