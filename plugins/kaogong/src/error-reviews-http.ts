import type {BusinessRegistry} from './business.ts'
import type {KaogongInstanceState} from './instance-state.ts'
import {PracticeError} from './practice-rounds.ts'
import type {IncomingMessage,ServerResponse} from 'node:http'
const send=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))}
export function registerErrorReviews(ctx:BusinessRegistry,state:KaogongInstanceState){
 const association=(row:ReturnType<typeof state.errors.list>['occurrences'][number])=>{
  const all=state.plan.read().tasks.filter(t=>t.reviewOccurrence&&JSON.stringify([t.reviewOccurrence.roundId,t.reviewOccurrence.questionId])===row.id);
  const cycle=row.review?row.review.enrolledAt+':'+row.review.history.filter(h=>h.confirmedAt).length:null;
  const planTask=all.find(t=>t.status==='in-progress')??all.find(t=>t.reviewCycle===cycle)??null;
  const attempt=row.review?.history.slice(planTask?.reviewHistoryCount??0).find(h=>!!planTask&&h.planTaskId===planTask.id&&h.correct&&h.confirmedAt);
  return {planTask,...(planTask?.status==='in-progress'&&!attempt?{planIncompleteReason:'尚需本次正确订正与反思确认，任务保持未完成'}:{}),planPending:!!planTask&&planTask.status==='in-progress'&&!!attempt,...(attempt?{retryConfirmation:{action:'retry-plan',id:row.id,taskId:planTask!.id,confirmed:true}}:{})};
 };
 // All descriptors run behind KaogongHost admission, trusted view ownership and command gate.
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/api/kaogong/errors',handler:async(req:IncomingMessage,res:ServerResponse)=>{
  try{
   if(req.method==='GET'){const filters=Object.fromEntries(new URL(req.url??'','http://localhost').searchParams);const result=state.errors.list(filters);send(res,200,{occurrences:filters.mode==='review'?result.occurrences.map(row=>{const pending=row.review?.history.find(attempt=>!attempt.confirmedAt);return {...association(row),id:row.id,questionId:row.questionId,roundId:row.roundId,subject:row.subject,knowledgePoint:row.knowledgePoint,stem:row.stem,options:row.options,source:row.source,submittedAt:row.submittedAt,review:row.review?{version:row.review.version,stage:row.review.stage,status:row.review.status,dueAt:row.review.dueAt,enrolledAt:row.review.enrolledAt,history:pending?[pending]:[]}:null,...(pending?{userAnswer:row.userAnswer,correctAnswer:row.correctAnswer,explanation:row.explanation,errorReason:row.errorReason,notes:row.notes}:{})}}):result.occurrences,queue:state.errors.queue()});return}
   if(req.method!=='POST'){send(res,405,{error:'method not allowed'});return}
   if(!req.headers['content-type']?.startsWith('application/json')){send(res,415,{error:'JSON required'});return}
   let text='';for await(const part of req){text+=part;if(text.length>20000)throw new PracticeError('请求过大')}
   const body=JSON.parse(text),id=body.id;
   const occurrence=state.errors.list().occurrences.find(r=>r.id===id);
   const cycle=occurrence?.review?occurrence.review.enrolledAt+':'+occurrence.review.history.filter(h=>h.confirmedAt).length:null;
   const candidates=state.plan.read().tasks.filter(t=>t.reviewOccurrence&&JSON.stringify([t.reviewOccurrence.roundId,t.reviewOccurrence.questionId])===id);
   let linked=body.action==='confirm'?candidates.find(t=>t.id===occurrence?.review?.history.find(h=>h.id===body.attemptId)?.planTaskId):candidates.find(t=>body.taskId?t.id===body.taskId:t.reviewCycle===cycle&&t.status!=='completed');
   if(body.taskId&&!linked)throw new PracticeError('关联计划不属于此错题',409);
   if(body.action==='answer'&&linked?.status==='pending')await state.plan.start(linked.id,state.plan.read().revision);
   if(body.action==='retry-plan'){if(body.confirmed!==true||!linked)throw new PracticeError('需要确认恢复原计划',409);if(linked.status!=='completed')await state.plan.complete(linked.id,state.plan.read().revision,true,{});send(res,200,{planTask:state.plan.read().tasks.find(t=>t.id===linked!.id),planPending:false});return}
   delete body.planTaskId;if(body.action==='answer'&&linked)body.planTaskId=linked.id;
   const result=await state.errors.command(body);
   let planError:string|undefined,planIncompleteReason:string|undefined;
   if(body.action==='confirm'&&linked&&linked.status!=='completed'){
    const current=state.errors.list().occurrences.find(row=>row.id===id);
    const proof=current?.review?.history.slice(linked.reviewHistoryCount??0).find(attempt=>attempt.id===body.attemptId&&attempt.planTaskId===linked!.id&&attempt.correct&&attempt.confirmedAt);
    if(linked.status!=='in-progress'||!proof)planIncompleteReason='尚需本次正确订正与反思确认，任务保持未完成';
    else try{await state.plan.complete(linked.id,state.plan.read().revision,true,{})}catch(error){if(state.plan.read().tasks.find(t=>t.id===linked!.id)?.status!=='completed')planError=error instanceof Error?error.message:'复习已保存，计划待恢复'}
   }
   const planTask=linked?state.plan.read().tasks.find(t=>t.id===linked!.id):null;
   const receipt={planTask,planPending:!!planError,planError,planIncompleteReason};
   const reviewMode=new URL(req.url??'','http://localhost').searchParams.get('mode')==='review'
   send(res,200,{...receipt,...(reviewMode&&'history' in result?{version:result.version,stage:result.stage,status:result.status,dueAt:result.dueAt,enrolledAt:result.enrolledAt}:result)})
  }catch(error){send(res,error instanceof PracticeError?error.status:400,{error:error instanceof Error?error.message:String(error)})}
 }}),'kaogong.errors')
}
