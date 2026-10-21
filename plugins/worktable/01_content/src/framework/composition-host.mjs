import {CompositionDirectory} from './compositions.mjs'
import {CompositionError} from './composition-schema.mjs'
import {RequestLifetime} from './request-lifetime.mjs'
import {readRequestText} from './request-body.mjs'
/** Authenticated local authoring; no model submission, grants or Session creation. */
export function mountCompositions(ctx){
 let owner=null
 ctx.inject(['worktableApplications','connection'],child=>{
  const lifetime=new RequestLifetime()
  const service=new CompositionDirectory(child.worktableApplications,{validateDependencies:async(recipe,appId)=>{
   for(const ref of recipe.connections){const resources=child.get('worktableResources');if(!resources)throw new CompositionError('dependency-unavailable','资料授权服务暂不可用。',503);await resources.resolve({viewId:ref.viewId,resourceId:ref.resourceId,action:'read'})}
   for(const role of recipe.roles){const capabilities=child.get('worktableCapabilities');if(!capabilities)throw new CompositionError('dependency-unavailable','角色能力服务暂不可用。',503);await capabilities.validateRole(role,appId)}
  }})
  const runtime={service,lifetime,connection:child.connection};owner=runtime;child.provide('worktableCompositions',service)
  child.effect(()=>async()=>{if(owner===runtime)owner=null;await lifetime.close(async()=>{})},'worktable authoring lifetime')
 })
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/api/worktable/compositions',handler:async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))};const runtime=owner
  try{
   if(!runtime?.connection?.admit)return send(503,{code:'unavailable',error:'应用搭建服务暂不可用。'})
   const admission=runtime.connection.admit(req);if('rejection' in admission)return send(admission.rejection,{code:'unauthorized',error:'请登录当前DSH。'})
   const value=await runtime.lifetime.run(async()=>{
    if(req.method==='GET')return runtime.service.list()
    if(req.method!=='POST')throw new CompositionError('method-not-allowed','此入口仅支持GET和POST。',405)
    if(!String(req.headers['content-type']??'').startsWith('application/json'))throw new CompositionError('json-required','需要JSON请求。',415)
    const text=await readRequestText(req,262144,()=>new CompositionError('request-too-large','应用配置过大。',413),runtime.lifetime.controller.signal)
    let input;try{input=JSON.parse(text)}catch{throw new CompositionError('invalid-request','JSON格式无效。')}
    if(!input||typeof input!=='object'||Array.isArray(input))throw new CompositionError('invalid-request','请求无效。')
    runtime.lifetime.check()
    switch(input.action){case 'get':return runtime.service.get(input.appId);case 'save':return runtime.service.save(input);case 'preview':return runtime.service.preview(input);case 'activate':return runtime.service.activate(input);default:throw new CompositionError('unknown-action','不支持此操作。')}
   });send(200,value)
  }catch(error){send(error.status??500,{code:error.code??'composition-failed',error:error.status?error.message:'组合应用操作失败；原记录保留。'})}
 }}),'worktable authenticated authoring API')
}
