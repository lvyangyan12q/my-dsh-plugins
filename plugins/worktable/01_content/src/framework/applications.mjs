import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { websiteEntry } from './web-policy.mjs'

export class ApplicationError extends Error {
  constructor(code, message, status=400) { super(message); this.code=code; this.status=status }
}
function projectScope(value,required=false){if((value===null||value===undefined)&&!required)return null;if(typeof value!=='string'||!value.trim())throw new ApplicationError('invalid-project','项目作用域无效，请选择项目或明确未归属。');return value}
function nextUse(data){return data.instances.reduce((time,item)=>Math.max(time,item.lastOpenedAt+1),Date.now())}

/** Profile-owned directory. Public methods return detached records; no DOM or session globals. */
export class ApplicationDirectory {
  constructor(file,options={}) { this.file=file; this.hostOrigin=options.hostOrigin; this.pending=Promise.resolve() }
  async read() {
    try { const data=JSON.parse(await readFile(this.file,'utf8')); if(data.schema!==1) throw new Error('unsupported schema'); return data }
    catch(error) { if(error.code==='ENOENT') return {schema:1,applications:[],instances:[],views:[]}; throw new ApplicationError('storage-unavailable','应用状态无法读取；原数据保留。',503) }
  }
  async change(operation) {
    const result=this.pending.then(async()=>{
      const data=await this.read(); const value=operation(data)
      const temporary=this.file+'.'+randomUUID()+'.tmp'
      try { await mkdir(dirname(this.file),{recursive:true}); await writeFile(temporary,JSON.stringify(data,null,2),'utf8'); await rename(temporary,this.file) }
      catch { throw new ApplicationError('storage-unavailable','应用状态未保存，请重试。',503) }
      return structuredClone(value)
    })
    this.pending=result.catch(()=>{}); return result
  }
  async register(definition) {
    if(definition?.protocolVersion!==1) throw new ApplicationError('protocol-incompatible','应用协议版本不兼容，当前支持版本1。')
    if(typeof definition.id!=='string'||!/^[a-z][a-z0-9.-]{0,79}$/.test(definition.id) || typeof definition.title!=='string'||!definition.title.trim() || typeof definition.version!=='string'||!definition.version.trim() || definition.kind!=='web') throw new ApplicationError('invalid-definition','请填写应用标识、名称、版本和网页入口。')
    let url
    try {url=websiteEntry(definition.url,this.hostOrigin)} catch(error) {throw new ApplicationError('unsafe-entry',error.message)}
    const clean={id:definition.id,title:definition.title.trim(),version:definition.version,protocolVersion:1,kind:'web',url}
    return this.change(data=>{ if(data.applications.some(a=>a.id===clean.id)) throw new ApplicationError('application-conflict','应用标识已注册，请使用不同标识。',409);data.applications.push(clean);return clean })
  }
  async catalog() { await this.pending; return structuredClone((await this.read()).applications) }
  async unregister(appId) {return this.change(data=>{this.application(data,appId);data.applications=data.applications.filter(a=>a.id!==appId);return {id:appId,removed:true}})}
  application(data,id) { const found=data.applications.find(a=>a.id===id); if(!found) throw new ApplicationError('application-missing','应用未注册或已移除；实例记录保留。',404); return found }
  instance(data,id) { const found=data.instances.find(a=>a.id===id); if(!found) throw new ApplicationError('instance-missing','实例不存在；请检查入口。',404); return found }
  async latest(appId,projectId) {
    projectId=projectScope(projectId)
    await this.pending; const data=await this.read(); this.application(data,appId)
    return structuredClone(data.instances.filter(i=>i.appId===appId && i.projectId===projectId).sort((a,b)=>b.lastOpenedAt-a.lastOpenedAt)[0]??null)
  }
  async createInstance(appId,projectId) {
    projectId=projectScope(projectId)
    return this.change(data=>{ this.application(data,appId); const record={id:randomUUID(),appId,projectId,revision:1,createdAt:Date.now(),lastOpenedAt:nextUse(data)}; data.instances.push(record);return record })
  }
  async attach(id,projectId,revision) {
    projectId=projectScope(projectId,true)
    return this.change(data=>{
      const record=this.instance(data,id)
      if(record.projectId!==null && record.projectId!==projectId) throw new ApplicationError('project-conflict','该实例已关联其他项目，请显式新建实例。',409)
      if(record.projectId===projectId)return record
      if(record.revision!==revision) throw new ApplicationError('revision-conflict','实例已更新，请刷新后重试。',409)
      record.projectId=projectId; record.revision++; return record
    })
  }
  async createView(id) {
    return this.change(data=>{ const instance=this.instance(data,id);this.application(data,instance.appId); const view={id:randomUUID(),instanceId:id,type:'page'};data.views.push(view);instance.lastOpenedAt=nextUse(data);return view })
  }
  async resolveView(id) {
    await this.pending; const data=await this.read();const view=data.views.find(v=>v.id===id)
    if(!view) throw new ApplicationError('view-missing','视图不存在；请从应用入口继续。',404)
    const instance=this.instance(data,view.instanceId);return structuredClone({view,instance,application:this.application(data,instance.appId)})
  }
  async snapshot() {await this.pending;return structuredClone(await this.read())}
}
