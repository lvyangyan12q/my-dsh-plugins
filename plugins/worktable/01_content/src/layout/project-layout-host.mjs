import {protectWorktableRoutes} from '../framework/host.mjs'
import {readRequestText} from '../framework/request-body.mjs'
import {readProjectLayout,saveProjectLayout} from './project-layout.mjs'

/** Layout-specific storage; generic file APIs retain their existing semantics. */
export function mountProjectLayouts(ctx){
  const server=protectWorktableRoutes(ctx,ctx.webServer)
  const dispose=server.register({kind:'exact',path:'/api/worktable/project-layout',handler:async(req,res)=>{
    const send=(code,value)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
    if(req.method!=='POST')return send(405,{status:'invalid',message:'布局入口仅支持 POST。'})
    if(!String(req.headers?.['content-type']??'').startsWith('application/json'))return send(415,{status:'invalid',message:'布局操作需要 JSON 请求。'})
    try{
      const text=await readRequestText(req,1100000,()=>Object.assign(new Error('布局请求过大。'),{status:413}))
      let body;try{body=JSON.parse(text)}catch{return send(400,{status:'invalid',message:'布局请求格式无效。'})}
      if(!body||typeof body!=='object'||Array.isArray(body))return send(400,{status:'invalid',message:'布局请求格式无效。'})
      let result
      if(body.action==='read')result=await readProjectLayout(body.folder,{projectId:body.projectId,legacyFile:body.legacyFile})
      else if(body.action==='save')result=await saveProjectLayout(body.folder,body.layout,body.expectedRevision)
      else return send(400,{status:'invalid',message:'布局操作不受支持。'})
      const code=result.status==='conflict'?409:['invalid','unsupported'].includes(result.status)?400:result.status==='error'?500:200
      return send(code,result)
    }catch(error){return send(error.status??500,{status:'error',message:error.status?error.message:'布局操作失败；原文件保留，请重试。'})}
  }})
  ctx.effect(()=>dispose,'worktable: authenticated project layout API')
}
