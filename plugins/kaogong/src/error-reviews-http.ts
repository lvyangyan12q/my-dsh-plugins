import type {BusinessRegistry} from './business.ts'
import type {KaogongInstanceState} from './instance-state.ts'
import {PracticeError} from './practice-rounds.ts'
import type {IncomingMessage,ServerResponse} from 'node:http'
const send=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))}
export function registerErrorReviews(ctx:BusinessRegistry,state:KaogongInstanceState){
 // All descriptors run behind KaogongHost admission, trusted view ownership and command gate.
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/api/kaogong/errors',handler:async(req:IncomingMessage,res:ServerResponse)=>{
  try{
   if(req.method==='GET'){const filters=Object.fromEntries(new URL(req.url??'','http://localhost').searchParams);const result=state.errors.list(filters);send(res,200,{occurrences:filters.mode==='review'?result.occurrences.map(row=>{const pending=row.review?.history.find(attempt=>!attempt.confirmedAt);return {id:row.id,questionId:row.questionId,roundId:row.roundId,subject:row.subject,knowledgePoint:row.knowledgePoint,stem:row.stem,options:row.options,source:row.source,submittedAt:row.submittedAt,review:row.review?{version:row.review.version,stage:row.review.stage,status:row.review.status,dueAt:row.review.dueAt,enrolledAt:row.review.enrolledAt,history:pending?[pending]:[]}:null,...(pending?{userAnswer:row.userAnswer,correctAnswer:row.correctAnswer,explanation:row.explanation,errorReason:row.errorReason,notes:row.notes}:{})}}):result.occurrences,queue:state.errors.queue()});return}
   if(req.method!=='POST'){send(res,405,{error:'method not allowed'});return}
   if(!req.headers['content-type']?.startsWith('application/json')){send(res,415,{error:'JSON required'});return}
   let text='';for await(const part of req){text+=part;if(text.length>20000)throw new PracticeError('请求过大')}
   const result=await state.errors.command(JSON.parse(text))
   const reviewMode=new URL(req.url??'','http://localhost').searchParams.get('mode')==='review'
   send(res,200,reviewMode&&'history' in result?{version:result.version,stage:result.stage,status:result.status,dueAt:result.dueAt,enrolledAt:result.enrolledAt}:result)
  }catch(error){send(res,error instanceof PracticeError?error.status:400,{error:error instanceof Error?error.message:String(error)})}
 }}),'kaogong.errors')
}
