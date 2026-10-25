import {reject} from './roles.mjs'

const identity=binding=>JSON.stringify([binding.appId,binding.instanceId,binding.roleId,binding.sessionId,binding.presetId,binding.creation.cwd,binding.agent])

/** Trusted application installers; Native Agent contexts own their private registrations. */
export class RoleSessionScopes {
 constructor(){this.owners=new Map();this.live=new Map();this.closed=false;this.catalogPending=Promise.resolve()}
 // Native snapshots include a global provider revision, even for private scopes.
 // Keep our temporary registrations alive through validation and disposal so
 // another role inspection cannot exhaust Native's stable-snapshot retries.
 catalog(operation){const job=this.catalogPending.then(operation);this.catalogPending=job.catch(()=>{});return job}
 contribute(appId,provider){
  if(this.closed||this.owners.has(appId)||typeof provider?.prepare!=='function'||typeof provider?.mount!=='function')reject('session-scope-owner','应用私有角色作用域声明无效或重复。')
  const owner={provider,active:true,pending:new Set(),records:new Set()};this.owners.set(appId,owner)
  return async()=>{
   owner.active=false;if(this.owners.get(appId)===owner)this.owners.delete(appId)
   await Promise.allSettled([...owner.pending])
   const results=await Promise.allSettled([...owner.records].map(record=>{record.active=false;return this.catalog(()=>record.remove())}))
   const failures=results.filter(row=>row.status==='rejected');if(failures.length)throw new AggregateError(failures.map(row=>row.reason),'应用角色作用域释放失败。')
  }
 }
 owner(appId){const owner=this.owners.get(appId);if(this.closed||!owner?.active)reject('session-scope-unavailable','应用私有角色作用域未就绪或已停用；不会退回通用Agent执行。');return owner}
 assertOwner(appId,owner){if(this.owner(appId)!==owner)reject('session-scope-changed','应用角色作用域已改变，请关闭并重新打开原生会话。')}
 track(owner,operation){const job=Promise.resolve().then(operation);owner.pending.add(job);void job.finally(()=>owner.pending.delete(job)).catch(()=>{});return job}
 probe(row,cwd,baseScope,validate){
  const owner=this.owner(row.ownerAppId)
  return this.track(owner,()=>this.catalog(async()=>{
   let lease
   try{
    this.assertOwner(row.ownerAppId,owner);lease=await owner.provider.prepare({capabilityId:row.id,cwd,baseScope})
    if(!lease?.scope||typeof lease.scope!=='object'||lease.scope===baseScope||typeof lease.dispose!=='function')reject('session-scope-invalid','应用必须提供独立且可释放的角色校验作用域。')
    this.assertOwner(row.ownerAppId,owner);const value=await validate(lease.scope);this.assertOwner(row.ownerAppId,owner);return value
   }finally{if(typeof lease?.dispose==='function')await lease.dispose()}
  }))
 }
 async mount(row,binding,definition,agent,validate,assertBinding){
  const owner=this.owner(binding.appId)
  return this.track(owner,()=>this.catalog(async()=>{
   this.assertOwner(binding.appId,owner)
   const current=this.live.get(agent)
   if(current){
    if(!current.active||current.owner!==owner||current.identity!==identity(binding))reject('session-scope-changed','原生会话的私有角色已停用或改变，请关闭并重新打开；不会自动换角色。')
    await validate(agent);this.assertOwner(binding.appId,owner);return
   }
   let remove,record
   try{
    this.assertOwner(binding.appId,owner);remove=await owner.provider.mount({capabilityId:row.id,cwd:binding.creation.cwd,context:agent.ctx})
    if(typeof remove!=='function')reject('session-scope-invalid','角色安装器必须返回精确释放函数。')
    this.assertOwner(binding.appId,owner);await validate(agent);this.assertOwner(binding.appId,owner)
    let removing
    record={owner,active:true,identity:identity(binding),remove:()=>removing??=Promise.resolve().then(()=>remove())}
    this.live.set(agent,record);owner.records.add(record)
    // This safety guard belongs to the Agent, surviving owner unload until the Agent itself leaves.
    // An unloaded application must never silently become a generic model execution.
    agent.ctx.on('agent/pre-step',async({agent:subject},next)=>{
     if(subject!==agent||!record.active||this.closed||!owner.active)reject('session-scope-unavailable','应用私有角色已停用，原会话与资料保留；请重新打开角色会话。')
     await assertBinding();return next()
    })
    agent.ctx.effect(()=>async()=>{record.active=false;owner.records.delete(record);if(this.live.get(agent)===record)this.live.delete(agent);await this.catalog(()=>record.remove())},'worktable application role scope')
   }catch(error){record&&(record.active=false);if(record){owner.records.delete(record);this.live.delete(agent)}if(typeof remove==='function')await remove();throw error}
  }))
 }
 async assert(binding,agent,validate){
  const owner=this.owner(binding.appId),record=this.live.get(agent)
  if(!record?.active||record.owner!==owner||record.identity!==identity(binding))reject('session-scope-unavailable','此原生会话尚未加载有效的应用角色作用域，请关闭并重新打开。')
  await this.track(owner,()=>this.catalog(async()=>{this.assertOwner(binding.appId,owner);await validate(agent);this.assertOwner(binding.appId,owner)}))
 }
 async close(){this.closed=true;const owners=[...this.owners.values()];for(const owner of owners)owner.active=false;this.owners.clear();await Promise.allSettled(owners.flatMap(owner=>[...owner.pending]));const results=await Promise.allSettled([...this.live.values()].map(record=>{record.active=false;return this.catalog(()=>record.remove())}));this.live.clear();const failures=results.filter(row=>row.status==='rejected');if(failures.length)throw new AggregateError(failures.map(row=>row.reason),'私有角色作用域清理失败。')}
}

/** Public Native lifecycle: creation is awaited; pre-step only verifies an already installed scope. */
export function bindRoleSessionScopes(ctx,roles){
 ctx.on('agent/created',async({agent})=>{await roles.activateNativeSession(agent)})
 ctx.on('agent/pre-step',async({agent},next)=>{await roles.assertNativeSession(agent);return next()})
}
