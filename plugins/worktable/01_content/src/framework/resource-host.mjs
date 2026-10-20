import {RequestLifetime} from './request-lifetime.mjs'
import {readRequestText} from './request-body.mjs'
import {join} from 'node:path'
import {ResourceDirectory} from './resources.mjs'
import {ApplicationError} from './applications.mjs'
export function mountResources(ctx){
  let owner
  ctx.inject(['worktableApplications','profileContext','connection','worktableAdmission'],child=>{
    if(!child.worktableApplications||!child.profileContext?.dir)return
    const owned=new ResourceDirectory(join(child.profileContext.dir,'worktable-platform','resources.v1.json'),child.worktableApplications,child.worktableAdmission)
    const runtime={service:owned,connection:child.connection,lifetime:new RequestLifetime()};owner=runtime;child.provide('worktableResources',owned)
    child.effect(()=>async()=>{if(owner===runtime)owner=null;await runtime.lifetime.close(()=>owned.close())},'worktable resource lifetime')
  })
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/api/worktable/resources',handler:async(req,res)=>{
    const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
    const runtime=owner;
    try{
      if(!runtime?.service||!runtime.connection?.admit)return send(503,{error:'数据授权服务不可用；资料保留。'})
      const admission=runtime.connection.admit(req);if('rejection' in admission)return send(admission.rejection,{error:'请登录当前DSH实例。'})
      await runtime.lifetime.run(async()=>{const {service}=runtime;
      if(req.method!=='POST')return send(405,{error:'POST required'})
      if(!String(req.headers['content-type']??'').startsWith('application/json'))return send(415,{error:'JSON required'})
      const text=await readRequestText(req,16384,()=>new ApplicationError('request-too-large','请求过大。',413),runtime.lifetime.controller.signal)
      let body;try{body=JSON.parse(text)}catch{throw new ApplicationError('invalid-request','JSON无效。')}
      if(!body||typeof body!=='object'||Array.isArray(body))throw new ApplicationError('invalid-request','请求无效。')
      runtime.lifetime.check();let result
      switch(body.operation){
        case 'snapshot': result=await service.snapshot();break
        case 'share': result=await service.share(body);break
        case 'permissions': result=await service.permissions(body.id,body.revision,body.allowedActions);break
        case 'revoke': result=await service.revoke(body.id,body.revision);break
        case 'call': {
          if(Object.keys(body).some(key=>!['operation','viewId','resourceId','action','payload','expectedRevision','expectedConnectionRevision'].includes(key)))throw new ApplicationError('invalid-request','不能在数据请求中指定任意实例或所属应用。',403)
          result=await service.call(body);break
        }
        default: throw new ApplicationError('unknown-action','不支持此数据操作。')
      }
      send(200,result)
      })
    }catch(error){send(error.status??409,{code:error.code??'resource-failed',error:error.message??'数据操作失败。'})}
  }}),'worktable authenticated data resources')
}
