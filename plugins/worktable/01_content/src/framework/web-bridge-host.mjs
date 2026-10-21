import {WebBridgeDirectory} from './web-bridge.mjs'
import {renderBridgeFrame,renderCspProbe} from './web-bridge-frame.mjs'
import {RequestLifetime} from './request-lifetime.mjs'
import {readRequestText} from './request-body.mjs'
import {ApplicationError} from './applications.mjs'
export function mountWebBridge(ctx){
 let runtime=null
 ctx.inject(['worktableApplications','worktableCompositions','worktableResources','worktableRoles','worktableTasks','worktableAdmission','connection'],child=>{
  const service=new WebBridgeDirectory({applications:child.worktableApplications,compositions:child.worktableCompositions,resources:child.worktableResources,roles:child.worktableRoles,tasks:child.worktableTasks,gate:child.worktableAdmission}),owned={service,connection:child.connection,lifetime:new RequestLifetime()};runtime=owned;child.provide('worktableWebBridge',service)
  child.effect(()=>async()=>{if(runtime===owned)runtime=null;await service.close();await owned.lifetime.close(async()=>{})},'worktable opt-in web bridge owner')
 })
 for(const mode of ['api','frame','probe'])ctx.effect(()=>ctx.webServer.register({kind:'exact',path:mode==='api'?'/api/worktable/bridge':'/api/worktable/bridge/'+mode,handler:async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))},owned=runtime
  try{
   if(!owned)return send(503,{code:'bridge-unavailable',error:'网页桥接服务暂不可用。'})
   const admission=owned.connection.admit(req);if('rejection' in admission)return send(admission.rejection,{code:'unauthorized',error:'请登录当前DSH。'})
   await owned.lifetime.run(async()=>{
    const origin=new URL((req.socket?.encrypted?'https:':'http:')+'//'+req.headers.host).origin
    if(mode==='probe'){if(req.method!=='GET')return send(405,{error:'GET required'});const document=renderCspProbe(origin);res.writeHead(200,document.headers);return res.end(document.body)}
    if(mode==='frame'){if(req.method!=='GET')return send(405,{error:'GET required'});const cap=await owned.service.frame(new URL(req.url,origin).searchParams.get('id'));if(cap.hostOrigin!==undefined&&cap.hostOrigin!==origin)throw new ApplicationError('bridge-origin','宿主来源已改变。',403);const document=renderBridgeFrame(cap,origin);res.writeHead(200,document.headers);return res.end(document.body)}
    if(req.method!=='POST')return send(405,{error:'POST required'});if(!String(req.headers['content-type']??'').startsWith('application/json'))return send(415,{error:'JSON required'})
    const text=await readRequestText(req,16384,()=>new ApplicationError('request-too-large','网页桥接请求过大。',413),owned.lifetime.controller.signal)
    let body;try{body=JSON.parse(text)}catch{throw new ApplicationError('invalid-request','JSON无效。')}
    if(!body||typeof body!=='object'||Array.isArray(body))throw new ApplicationError('invalid-request','请求格式无效。')
    owned.lifetime.check();let result
    switch(body.action){
     case 'open':{if(Object.keys(body).some(key=>!['action','viewId','moduleId','allowRead','allowPrepare'].includes(key)))throw new ApplicationError('bridge-input','请勿在网页能力中指定其他来源或目标。',400);const {action,...input}=body;result=await owned.service.open({...input,hostOrigin:origin});break}
     case 'revoke':{if(Object.keys(body).some(key=>!['action','id','revision'].includes(key)))throw new ApplicationError('bridge-input','撤销请求无效。');result=await owned.service.revoke(body.id,body.revision);break}
     case 'request':{const {action,...input}=body;result=await owned.service.request(input);break}
     default:throw new ApplicationError('bridge-input','此入口不支持发送、模型或任意工具。',403)
    }send(200,result)
   })
  }catch(error){send(error.status??500,{code:error.code??'bridge-failed',error:error.status?error.message:'网页桥接失败，未自动重试。'})}
 }}),'worktable authenticated limited website bridge')
}
