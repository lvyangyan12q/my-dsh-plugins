import type {Context} from '@deepseek-ai/cordis'
import type {createMaterialImportOwner} from './materials-owner.ts'
/** Browser chooses a registered owned view, never a source path, record value or Native identity. */
export function mountMaterialImportHttp(ctx:Context,owner:ReturnType<typeof createMaterialImportOwner>){return ctx.webServer.register({kind:'exact',path:'/api/kaogong/material-import',handler:async(req,res)=>{
 const send=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
 const admission=ctx.connection.admit(req);if('rejection'in admission){send(admission.rejection,{error:'请登录当前DSH。'});return}
 if(req.method!=='POST'){send(405,{error:'POST required'});return}if(!req.headers['content-type']?.startsWith('application/json')){send(415,{error:'JSON required'});return}
 try{
  let text='';for await(const chunk of req){text+=chunk.toString();if(text.length>8192)throw Error('MATERIAL_REQUEST_TOO_LARGE')}
  const body=JSON.parse(text||'{}') as Record<string,unknown>;if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.viewId!=='string')throw Error('MATERIAL_REQUEST_INVALID')
  const allowed=body.action==='prepare'||body.action==='list'?['action','viewId']:body.action==='apply'?['action','viewId','id','fingerprint','confirmed']:['action','viewId','id']
  if(Object.keys(body).some(key=>!allowed.includes(key)))throw Error('MATERIAL_REQUEST_INVALID')
  if(body.action==='prepare'){send(200,await owner.prepare(body.viewId));return}if(body.action==='list'){send(200,{plans:await owner.list(body.viewId)});return}
  if(typeof body.id!=='string')throw Error('MATERIAL_REQUEST_INVALID')
  if(body.action==='inspect'){send(200,await owner.inspect(body.viewId,body.id));return}
  if(body.action==='export'){send(200,await owner.exportPlan(body.viewId,body.id));return}
  if(body.action==='apply'){if(typeof body.fingerprint!=='string'||body.confirmed!==true)throw Error('MATERIAL_CONCRETE_CONFIRMATION_REQUIRED');send(200,await owner.apply(body.viewId,{id:body.id,fingerprint:body.fingerprint,confirmed:true}));return}
  throw Error('MATERIAL_REQUEST_INVALID')
 }catch(error){const code=error&&typeof error==='object'&&'code'in error&&typeof error.code==='string'?error.code:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'MATERIAL_IMPORT_FAILED';send(409,{code,error:code,notice:'原资料保留；不自动重试。请检查同一资料计划及目标状态。'})}
}})}
