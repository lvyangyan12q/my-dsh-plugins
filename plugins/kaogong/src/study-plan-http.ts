import {studyDate} from './study-date.ts'
import type {BusinessRegistry} from './business.ts'
import type {KaogongInstanceState} from './instance-state.ts'
import {reviewOccurrence,type PlanPreview} from './study-plan.ts'
import {z} from 'zod'
/** Adds descriptors only to the private business registry. production-host wraps
 * every descriptor in KaogongHost.http: admit -> owned view -> readiness -> lease.
 * This function never registers directly against the actual Host webServer. */
export function registerStudyPlanRoutes(registry:BusinessRegistry,state:KaogongInstanceState){
 const stopStart=registry.webServer.register({kind:'exact',path:'/api/kaogong/plan/start',handler:async(req,res)=>{
  const send=(code:number,value:unknown)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}
  try{if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json'))throw Error('POST JSON required');let text='';for await(const part of req){text+=part;if(text.length>10000)throw Error('请求过大')}const args=z.object({id:z.string().uuid(),revision:z.number().int().nonnegative()}).strict().parse(JSON.parse(text));const current=await state.plan.start(args.id,args.revision),task=current.tasks.find(t=>t.id===args.id)!;
   if(task.reviewOccurrence){send(200,{state:current,reviewOccurrence:JSON.stringify([task.reviewOccurrence.roundId,task.reviewOccurrence.questionId])})}
   else if(task.kind==='learn'){const lesson=await state.lessons.create({lessonId:task.lessonId!,subject:task.subject,objective:task.title,materialIds:[],requirePractice:task.requirePractice,requireReflections:task.requireReflections,taskId:task.id,planRevision:task.startedFromRevision});send(200,{state:current,lesson})}
   else {const round=await state.practice.startForTask({subject:task.subject,title:task.title,limit:10,planRevision:task.startedFromRevision},task.id);send(200,{state:current,round})}
  }catch(error){send(409,{error:error instanceof Error?error.message:'任务开始失败'})}
 }})
 const stopPlan=registry.webServer.register({kind:'exact',path:'/api/kaogong/plan',handler:async(req,res)=>{
  const send=(code:number,value:unknown)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}
  try{
   if(req.method==='GET'){send(200,state.plan.read());return}
   if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){send(405,{error:'POST JSON required'});return}
   let text='';for await(const part of req){text+=part;if(text.length>100000)throw Error('请求过大')}
   const body=JSON.parse(text),revision=z.number().int().nonnegative().parse(body.revision??body.baseRevision)
   const allowed:Record<string,string[]>={preview:['baseRevision','operation','goal','taskId','date','task'],confirm:['id','revision','confirmed'],summary:['id','revision','summary'],complete:['id','revision','confirmed','roundId'],'completion-preview':['id','revision'],'completion-confirm':['id','revision','confirmed'],external:['revision','confirmed','date','title','score','maximum']}
   if(!allowed[body.action]||Object.keys(body).some(key=>key!=='action'&&!allowed[body.action]!.includes(key)))throw Error('计划请求无效')
   let value:unknown
   if(body.action==='preview'){if(body.task?.reviewOccurrence){const ref=reviewOccurrence.parse(body.task.reviewOccurrence),{row}=state.errors.readForPlan(JSON.stringify([ref.roundId,ref.questionId]));if(row.subject!==body.task.subject)throw Error('复习科目与任务不一致')}const today=studyDate();value=await state.plan.preview({baseRevision:revision,action:body.operation,today,...(body.goal?{goal:body.goal}:{}),taskId:body.taskId,date:body.date,task:body.task} as PlanPreview)}
   else if(body.action==='confirm')value=await state.plan.confirm(body.id,revision,body.confirmed)
   else if(body.action==='summary')value=await state.plan.saveSummary(body.id,revision,body.summary)
   else if(body.action==='completion-preview')value=await state.plan.previewCompletion(body.id,revision)
   else if(body.action==='completion-confirm'){const proposal=state.plan.read().completionProposals.find(p=>p.id===body.id);if(!proposal)throw Error('完成建议不存在');value=await state.plan.complete(proposal.taskId,revision,body.confirmed,{roundId:proposal.roundId},proposal.id)}
   else if(body.action==='complete')value=await state.plan.complete(body.id,revision,body.confirmed,{roundId:body.roundId})
   else value=await state.plan.recordExternalMock({date:body.date,title:body.title,score:body.score,maximum:body.maximum},revision,body.confirmed)
   send(200,value)
  }catch(error){send(409,{error:error instanceof Error?error.message:'计划请求失败'})}
 }})
 return ()=>{stopStart();stopPlan()}
}
