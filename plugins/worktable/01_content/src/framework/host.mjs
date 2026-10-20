import {describeProtocol} from '../sdk.mjs'
import {RequestLifetime} from './request-lifetime.mjs'
import {readRequestText} from './request-body.mjs'
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
  const gate=new AdmissionGate();mountResources(ctx);let owner=null,closing=false;
  ctx.inject(['profileContext','connection'],platformCtx=>{
    const profile=platformCtx.profileContext;if(!profile?.dir||!isAbsolute(profile.dir))return;
    const owned=new ApplicationDirectory(join(profile.dir,'worktable-platform','applications.v1.json'),{gate});
    const runtime={service:owned,connection:platformCtx.connection,lifetime:new RequestLifetime()};owner=runtime;
    platformCtx.provide('worktableAdmission',gate);platformCtx.provide('worktableApplications',owned);platformCtx.provide('worktableProtocol',Object.freeze({describe:describeProtocol}));
    platformCtx.effect(()=>async()=>{if(owner===runtime)owner=null;await runtime.lifetime.close(()=>owned.close())},'worktable: release application service');
  });
  const dispose=ctx.webServer.register({kind:'exact',path:'/api/worktable/applications',handler:async(req,res)=>{
    const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))};const runtime=owner;
    try{
      if(closing||!runtime?.connection?.admit)return send(503,{code:'host-capability-missing',error:'应用服务暂不可用，原记录保留。'});
      const admitted=runtime.connection.admit(req);if('rejection' in admitted)return send(admitted.rejection,{code:'unauthorized',error:'请先登录当前DSH实例。'});
      const value=await runtime.lifetime.run(async()=>{
        const service=runtime.service;
        if(req.method==='GET')return service.snapshot();
        if(req.method!=='POST')throw new ApplicationError('method-not-allowed','此入口仅支持GET和POST。',405);
        if(!String(req.headers['content-type']??'').startsWith('application/json'))throw new ApplicationError('json-required','应用操作需要JSON请求。',415);
        const text=await readRequestText(req,65536,()=>new ApplicationError('request-too-large','应用请求过大。',413),runtime.lifetime.controller.signal);
        let body;try{body=JSON.parse(text)}catch{throw new ApplicationError('invalid-request','应用请求格式无效。')};runtime.lifetime.check();
        switch(body.action){
          case 'register':try{websiteEntry(body.application?.url,new URL('http://'+req.headers.host).origin)}catch(error){throw new ApplicationError('unsafe-entry',error.message)}return service.register(body.application);
          case 'create':return service.createInstance(body.appId,body.projectId??null);
          case 'latest':return service.latest(body.appId,body.projectId??null);
          case 'attach':if(typeof body.projectId!=='string'||!body.projectId.trim())throw new ApplicationError('invalid-project','请选择关联项目。');return service.attach(body.instanceId,body.projectId,body.revision);
          case 'view':return service.createView(body.instanceId,body.viewType??'page');
          case 'resume':return service.resume(body.instanceId);
          case 'resolve':return service.resolveView(body.viewId);
          default:throw new ApplicationError('unknown-action','应用操作不受支持。');
        }
      });send(200,value);
    }catch(error){send(error.status??500,{code:error.code??'application-failed',error:error.status?error.message:'应用操作失败；原记录保留，请重试。'})}
  }});
  ctx.effect(()=>()=>{closing=true;dispose()},'worktable: authenticated applications API');return owner?.service??null;
}
