import {readRequestText} from './request-body.mjs'
import {join} from 'node:path'
import {RoleDirectory,RoleStore,RoleError} from './roles.mjs'
import {CapabilityDirectory} from './capabilities.mjs'
import {createRoleAuthority} from './role-native.mjs'
/** Independent optional fiber; no coupling to legacy workbench or its execution tools. */
export function mountRoles(ctx){
 let owner=null,closing=false
 ctx.inject(['worktableAdmission','profileContext','connection','worktableApplications','sessionController','sessionPersistence','workspaceRegistry','agentPresets','skills'],child=>{
  child.effect(async function*(){
   const store=await RoleStore.open(join(child.profileContext.dir,'worktable-platform','roles.v1.json'))
   const capabilities=new CapabilityDirectory(store,child,child.worktableAdmission)
   const roles=new RoleDirectory(store,child.worktableApplications,createRoleAuthority(child,capabilities),child.worktableAdmission)
   const requests=new Set()
   try{
    await capabilities.restore()
    const runtime={roles,capabilities,connection:child.connection,requests}
    child.provide('worktableCapabilities',capabilities);child.provide('worktableRoles',roles);owner=runtime
    yield async()=>{if(owner===runtime)owner=null;await Promise.allSettled([...requests]);capabilities.closing=true;roles.closing=true;await Promise.allSettled([capabilities.pending,roles.pending]);await capabilities.dispose();await roles.dispose()}
   }catch(error){capabilities.closing=true;roles.closing=true;await Promise.allSettled([capabilities.pending,roles.pending]);await capabilities.dispose();await roles.dispose();throw error}
  },'worktable role and capability owner')
 })
 const remove=ctx.webServer.register({kind:'exact',path:'/api/worktable/roles',handler:async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
  const runtime=owner
  if(!runtime||closing)return send(503,{error:'角色与能力服务暂不可用；原工作台仍可使用。'})
  const admitted=runtime.connection.admit(req);if('rejection' in admitted)return send(admitted.rejection,{error:'请先登录当前DSH。'})
  const task=(async()=>{try{
   if(req.method!=='POST')return send(405,{error:'此入口需要POST。'})
   if(!String(req.headers['content-type']??'').startsWith('application/json'))return send(415,{error:'需要JSON请求。'})
   const text=await readRequestText(req,131072,()=>new RoleError('request-too-large','请求过大。'))
   let body;try{body=JSON.parse(text)}catch{throw new RoleError('invalid-request','JSON格式无效。')}
   const {roles,capabilities}=runtime;let value
   switch(body.action){
    case 'capabilities':value=await capabilities.list();break
    case 'capability-save':value=await capabilities.save(body.capability,body.revision);break
    case 'list':{const rows=await roles.list(body.instanceId);const snapshot=await roles.applications.snapshot();const instance=snapshot.instances.find(row=>row.id===body.instanceId);value={roles:rows,capabilities:await capabilities.list(instance.appId)};break}
    case 'read':value=await roles.read(body.instanceId,body.roleId);break
    case 'ensure':value=await roles.ensure(body.instanceId,body.roleId,body.agent);break
    case 'retry':value=await roles.retry(body.instanceId,body.roleId,body.sessionId,body.revision);break
    case 'replace':value=await roles.replace(body.instanceId,body.roleId,body.sessionId,body.revision,body.agent);break
    case 'open':value=await roles.open(body.instanceId,body.roleId,body.sessionId,body.revision);break
    case 'history':value=await roles.history(body.instanceId,body.roleId,body.sessionId,body.revision,body.historicalId);break
    default:throw new RoleError('invalid-action','角色操作不受支持。')
   }
   return send(200,value)
  }catch(error){return send(error.status??500,{code:error.code??'role-failed',error:error.message??'角色操作失败，原绑定保留。'})}})()
  runtime.requests.add(task);try{await task}finally{runtime.requests.delete(task)}
 }})
 ctx.effect(()=>()=>{closing=true;remove()},'worktable role route')
}
