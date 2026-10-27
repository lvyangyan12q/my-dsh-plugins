import type {BusinessRegistry} from './business.ts'
import type {KaogongInstanceState} from './instance-state.ts'
import type {PlanPreview} from './study-plan.ts'
import {z} from 'zod'
/** Adds descriptors only to the private business registry. production-host wraps
 * every descriptor in KaogongHost.http: admit -> owned view -> readiness -> lease.
 * This function never registers directly against the actual Host webServer. */
export function registerStudyPlanRoutes(registry:BusinessRegistry,state:KaogongInstanceState){
 return registry.webServer.register({kind:'exact',path:'/api/kaogong/plan',handler:async(req,res)=>{
  const send=(code:number,value:unknown)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}
  try{
   if(req.method==='GET'){send(200,state.plan.read());return}
   if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){send(405,{error:'POST JSON required'});return}
   let text='';for await(const part of req){text+=part;if(text.length>100000)throw Error('请求过大')}
   const body=JSON.parse(text),revision=z.number().int().nonnegative().parse(body.revision??body.baseRevision)
   const allowed:Record<string,string[]>={preview:['baseRevision','operation','goal','taskId','date','task'],confirm:['id','revision','confirmed'],summary:['id','revision','summary'],complete:['id','revision','confirmed','roundId'],external:['revision','confirmed','date','title','score','maximum']}
   if(!allowed[body.action]||Object.keys(body).some(key=>key!=='action'&&!allowed[body.action]!.includes(key)))throw Error('计划请求无效')
   let value:unknown
   if(body.action==='preview'){const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');value=await state.plan.preview({baseRevision:revision,action:body.operation,today,...(body.goal?{goal:body.goal}:{}),taskId:body.taskId,date:body.date,task:body.task} as PlanPreview)}
   else if(body.action==='confirm')value=await state.plan.confirm(body.id,revision,body.confirmed)
   else if(body.action==='summary')value=await state.plan.saveSummary(body.id,revision,body.summary)
   else if(body.action==='complete')value=await state.plan.complete(body.id,revision,body.confirmed,{roundId:body.roundId})
   else value=await state.plan.recordExternalMock({date:body.date,title:body.title,score:body.score,maximum:body.maximum},revision,body.confirmed)
   send(200,value)
  }catch(error){send(409,{error:error instanceof Error?error.message:'计划请求失败'})}
 }})
}
