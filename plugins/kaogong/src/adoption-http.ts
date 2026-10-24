import type {Context} from '@deepseek-ai/cordis'
import type {createAdoptionOwner} from './legacy-adoption-owner.ts'
/** No arbitrary filesystem path, native identity, target ID, or business record is accepted from a browser. */
export function mountAdoptionHttp(ctx:Context,owner:ReturnType<typeof createAdoptionOwner>){
 return ctx.webServer.register({kind:'exact',path:'/api/kaogong/adoption',handler:async(req,res)=>{
  const send=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
  const admission=ctx.connection.admit(req);if('rejection'in admission){send(admission.rejection,{error:'请登录当前 DSH。'});return}
  if(req.method!=='POST'){send(405,{error:'POST required'});return}
  if(!req.headers['content-type']?.startsWith('application/json')){send(415,{error:'JSON required'});return}
  try{
   let text='';for await(const chunk of req){text+=chunk.toString();if(text.length>8192)throw Error('ADOPTION_REQUEST_TOO_LARGE')}
   const body=JSON.parse(text||'{}') as Record<string,unknown>
   if(!body||typeof body!=='object'||Array.isArray(body))throw Error('ADOPTION_REQUEST_INVALID')
   const allowed=body.action==='prepare'?['action','sourceKey']:body.action==='apply'?['action','id','fingerprint','confirmed']:['action','id']
   if(Object.keys(body).some(key=>!allowed.includes(key)))throw Error('ADOPTION_REQUEST_INVALID')
   if(body.action==='prepare'){if(body.sourceKey!=='legacy-default')throw Error('ADOPTION_SOURCE_UNREGISTERED');send(200,await owner.prepare());return}
   if(typeof body.id!=='string')throw Error('ADOPTION_REQUEST_INVALID')
   if(body.action==='inspect'){send(200,await owner.inspect(body.id));return}
   if(body.action==='export'){send(200,await owner.exportPlan(body.id));return}
   if(body.action==='apply'){if(typeof body.fingerprint!=='string'||body.confirmed!==true)throw Error('ADOPTION_CONCRETE_CONFIRMATION_REQUIRED');send(200,await owner.apply({id:body.id,fingerprint:body.fingerprint,confirmed:true}));return}
   throw Error('ADOPTION_REQUEST_INVALID')
  }catch(error){const code=error&&typeof error==='object'&&'code'in error&&typeof error.code==='string'?error.code:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'ADOPTION_PHASE_FAILED';send(409,{code,error:code,notice:'原始资料保留；未知或失败不会自动重试，需检查同一计划后显式恢复。'})}
 }})
}
