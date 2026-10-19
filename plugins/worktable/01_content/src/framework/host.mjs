import {AdmissionGate} from './admission.mjs'
import {mountResources} from './resource-host.mjs'
import {join,isAbsolute} from 'node:path'
import {ApplicationDirectory,ApplicationError} from './applications.mjs'
import {websiteEntry} from './web-policy.mjs'

/** Local facade only: never modifies the host's shared webServer service. */
export function protectWorktableRoutes(ctx,server) {
  function rejection(req){
    let connection;try{connection=ctx.get?.('connection')}catch{}
    if(!connection?.admit)return 503
    const result=connection.admit(req);return 'rejection' in result?result.rejection:null
  }
  return {
    register(route){
      if(route.path==='/api/worktable/health'||route.path==='/api/worktable/template')return server.register(route)
      return server.register({...route,handler:async(req,res)=>{
        const status=rejection(req)
        if(status){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify({error:status===503?'当前宿主缺少公开认证接口，文件与工具访问不可用。':'请使用已登录的DSH工作台访问此功能。'}));return}
        return route.handler(req,res)
      }})
    },
    ...(typeof server.registerUpgrade==='function'?{registerUpgrade(route){return server.registerUpgrade({...route,handler:(req,socket,head)=>{
      const status=rejection(req);if(status){socket.end('HTTP/1.1 '+status+' Forbidden\r\nConnection: close\r\n\r\n');return}return route.handler(req,socket,head)
    }})}}:{})
  }
}

/** New API owns its authentication; webServer.register itself is not an auth fence. */
export function mountApplications(ctx) {
  const gate=new AdmissionGate()
  mountResources(ctx)
  let service=null,connection=null
  // Parent Worktable remains mounted while the optional platform dependency fiber waits.
  ctx.inject(['profileContext','connection'],platformCtx=>{
    const profile=platformCtx.profileContext
    if(!profile?.dir||!isAbsolute(profile.dir))return
    const owned=new ApplicationDirectory(join(profile.dir,'worktable-platform','applications.v1.json'),{gate})
    service=owned;connection=platformCtx.connection
    platformCtx.provide('worktableAdmission',gate)
    platformCtx.provide('worktableApplications',owned)
    platformCtx.effect(()=>()=>{if(service===owned){service=null;connection=null}},'worktable: release application service')
  })
  const dispose=ctx.webServer.register({kind:'exact',path:'/api/worktable/applications',handler:async(req,res)=>{
    const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
    try {
      if(!connection?.admit || !service) return send(503,{code:'host-capability-missing',error:'当前宿主缺少公开认证或profile接口，应用管理不可用；原工作台仍可使用。'})
      const admitted=connection.admit(req)
      if('rejection' in admitted) return send(admitted.rejection,{code:'unauthorized',error:'请先登录当前DSH实例。'})
      if(req.method==='GET') return send(200,await service.snapshot())
      if(req.method!=='POST') return send(405,{error:'此入口仅支持GET和POST。'})
      if(!String(req.headers['content-type']??'').startsWith('application/json')) return send(415,{error:'应用操作需要JSON请求。'})
      req.setEncoding('utf8')
      let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>65536) throw new ApplicationError('request-too-large','应用请求过大。',413)}
      let body;try{body=JSON.parse(text)}catch{throw new ApplicationError('invalid-request','应用请求格式无效。')}
      let result
      switch(body.action){
        case 'register': {
          try{websiteEntry(body.application?.url,new URL('http://'+req.headers.host).origin)}catch(error){throw new ApplicationError('unsafe-entry',error.message)}
          result=await service.register(body.application);break
        }
        case 'create': result=await service.createInstance(body.appId,body.projectId??null);break
        case 'latest': result=await service.latest(body.appId,body.projectId??null);break
        case 'attach': {
          if(typeof body.projectId!=='string'||!body.projectId.trim()) throw new ApplicationError('invalid-project','请选择关联项目。')
          result=await service.attach(body.instanceId,body.projectId,body.revision);break
        }
        case 'view': result=await service.createView(body.instanceId,body.viewType??'page');break
        case 'resume': result=await service.resume(body.instanceId);break
        case 'resolve': result=await service.resolveView(body.viewId);break
        default: throw new ApplicationError('unknown-action','应用操作不受支持。')
      }
      return send(200,result)
    } catch(error){return send(error.status??500,{code:error.code??'application-failed',error:error.status?error.message:'应用操作失败；原记录保留，请重试。'})}
  }})
  ctx.effect(()=>dispose,'worktable: authenticated applications API')
  return service
}
