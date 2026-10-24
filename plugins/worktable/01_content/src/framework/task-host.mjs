import {RequestLifetime} from './request-lifetime.mjs'
import {readRequestText} from './request-body.mjs'
import {join} from 'node:path'
import {TaskDirectory,TaskStore} from './tasks.mjs'
import {RoleError} from './roles.mjs'
const actionFields={
 prepare:['action','viewId','roleId','text','contexts'],
 'prepare-owned':['action','viewId','roleId','kind','payload'],
 list:['action','viewId'],edit:['action','viewId','id','revision','text','contexts'],
 discard:['action','viewId','id','revision'],submit:['action','viewId','id','revision'],
 open:['action','viewId','id','revision'],stop:['action','viewId','id','revision'],
 'recover-owner':['action','viewId','id','revision'],
 handoff:['action'],'handoff-open':['action','id'],'handoff-stop':['action','id'],
}
/** One authenticated route; no browser-selected native Session or direct prompt endpoint. */
export function mountTasks(ctx){
 let owner=null,closing=false;
 ctx.inject(['worktableAdmission','worktableApplications','worktableRoles','worktableResources','profileContext','connection','sessionController','sessionPersistence'],child=>{
  child.effect(async function*(){
   const store=await TaskStore.open(join(child.profileContext.dir,'worktable-platform','tasks.v1.json'));
   const tasks=new TaskDirectory(store,{gate:child.worktableAdmission,applications:child.worktableApplications,roles:child.worktableRoles,resources:child.worktableResources,native:{prompt:(request,signal)=>child.sessionController.prompt(request,signal),flush:()=>child.sessionPersistence.flush(),cancel:request=>child.sessionController.cancel(request)}});
   const lifetime=new RequestLifetime();const runtime={tasks,connection:child.connection,requests:lifetime.requests,lifetime};owner=runtime;try{child.provide('worktableTasks',tasks);child.provide('worktableTaskOwners',Object.freeze({contribute:(appId,kind,handler)=>tasks.contributeOwner(appId,kind,handler)}))}catch(error){if(owner===runtime)owner=null;try{await lifetime.close(()=>tasks.close())}catch(cleanupError){throw new AggregateError([error,cleanupError],'任务启动失败；清理也有失败，请检查全部诊断。')}throw error}
   yield async()=>{if(owner===runtime)owner=null;await lifetime.close(()=>tasks.close())}
  },'worktable durable task owner')
 });
 const remove=ctx.webServer.register({kind:'exact',path:'/api/worktable/tasks',handler:async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))};const runtime=owner;
  if(!runtime||closing)return send(503,{code:'task-unavailable',error:'任务服务暂不可用；准备记录保留，原生会话仍可操作。'});
  const admitted=runtime.connection.admit(req);if('rejection' in admitted)return send(admitted.rejection,{error:'请登录当前DSH。'});
  const request=(async()=>{try{
   if(req.method!=='POST')return send(405,{error:'POST required'});if(!String(req.headers['content-type']??'').startsWith('application/json'))return send(415,{error:'JSON required'});
   const text=await readRequestText(req,180000,()=>new RoleError('request-too-large','任务请求过大。'),runtime.lifetime.controller.signal);
   let body;try{body=JSON.parse(text)}catch{throw new RoleError('invalid-request','JSON格式无效。')};
   if(!body||Array.isArray(body)||typeof body!=='object')throw new RoleError('invalid-request','任务请求格式无效。');
   if(typeof body.action!=='string'||!Object.hasOwn(actionFields,body.action))throw new RoleError('invalid-action','不支持此任务操作。');
   if(Object.keys(body).some(key=>!actionFields[body.action].includes(key)))throw new RoleError('invalid-request','不能在任务请求中指定任意实例、会话或发送通道。');
   runtime.lifetime.check();const {tasks}=runtime;if(body.action==='handoff')return send(200,await tasks.handoff());if(body.action==='handoff-open')return send(200,await tasks.openSession(body.id));if(body.action==='handoff-stop')return send(200,await tasks.stopSession(body.id));const historical=['list','open','stop'].includes(body.action),context=await (historical&&tasks.applications.resolveStoredView?tasks.applications.resolveStoredView(body.viewId):tasks.applications.resolveView(body.viewId));if(!historical&&context.application.kind!=='deep')throw new RoleError('deep-required','网页没有任务执行权限。');
   if(!['prepare','prepare-owned','list'].includes(body.action)){const row=await tasks.find(body.id);if(row.instanceId!==context.instance.id)throw new RoleError('task-owner','任务不属于当前应用实例。')}
   let value;switch(body.action){
    case 'list':value=await tasks.list(body.viewId);break;
    case 'prepare':value=await tasks.prepare(body);break;
    case 'prepare-owned':value=await tasks.prepareOwned(body);break;
    case 'recover-owner':value=await tasks.recoverOwner(body.id);break;
    case 'edit':value=await tasks.edit(body.id,body.revision,body);break;
    case 'discard':value=await tasks.discard(body.id,body.revision);break;
    case 'submit':value=await tasks.submit(body.id,body.revision);break;
    case 'open':value=await tasks.open(body.id);break;
    case 'stop':value=await tasks.stop(body.id);break;
    default:throw new RoleError('invalid-action','不支持此任务操作。');
   }return send(200,value);
  }catch(error){return send(error.status??500,{code:error.code??'task-failed',error:error.message??'任务操作失败；记录保留。'})}})();
  runtime.requests.add(request);try{await request}finally{runtime.requests.delete(request)}
 }});
 ctx.effect(()=>()=>{closing=true;remove()},'worktable authenticated task route');
}
