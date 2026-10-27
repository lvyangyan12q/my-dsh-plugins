import {z} from 'zod'
import {randomUUID} from 'node:crypto'
import type {KvTable} from '@deepseek-ai/dsh-storage-domain'
import type {PracticeRound} from './schemas.ts'
import {PracticeError} from './practice-rounds.ts'

const attempt=z.object({id:z.string(),requestId:z.string(),answer:z.string(),correct:z.boolean(),answeredAt:z.string(),reflection:z.string().optional(),confirmedAt:z.string().optional()})
export const reviewRecord=z.object({version:z.literal(1),stage:z.number().int().min(0).max(3),status:z.enum(['scheduled','pending-correction','consolidated']),dueAt:z.string(),enrolledAt:z.string(),history:z.array(attempt)})
export type ReviewRecord=z.infer<typeof reviewRecord>
export const occurrenceId=(roundId:string,questionId:string)=>JSON.stringify([roundId,questionId])
const dayAfter=(now:Date,days:number)=>new Date(now.getTime()+days*86400000).toISOString()
function optionKey(option:string){return /^\s*([A-Za-z])(?:[.、)\s]|$)/.exec(option)?.[1]?.toUpperCase()??option}
/** Historical errors come from immutable scored round snapshots, never the latest notebook row. */
export class ErrorReviews{
 constructor(private rounds:KvTable<string,PracticeRound>,private reviews:KvTable<string,ReviewRecord>){}
 list(filters:Record<string,string>={}){
  const occurrences=[...this.rounds.entries()].flatMap(([roundId,round])=>!round.score?[]:round.questions.flatMap((question,index)=>{
   const userAnswer=round.score!.answers[index]!.answer
   if(userAnswer!==''&&userAnswer.trim()===question.correctAnswer.trim())return []
   const reflection=round.reflections.find(row=>row.id===question.id),id=occurrenceId(roundId,question.id)
   return [{...question,id,questionId:question.id,roundId,userAnswer,submittedAt:round.score!.submittedAt,errorReason:reflection?.errorReason??'',notes:reflection?.notes??'',review:this.reviews.get(id)??null}]
  })).filter(row=>(!filters.subject||row.subject===filters.subject)&&(!filters.knowledgePoint||row.knowledgePoint.includes(filters.knowledgePoint))&&(!filters.errorReason||row.errorReason===filters.errorReason)&&(!filters.from||row.submittedAt.slice(0,10)>=filters.from)&&(!filters.to||row.submittedAt.slice(0,10)<=filters.to)&&(!filters.status||(row.review?.status??'not-enrolled')===filters.status)).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)||a.id.localeCompare(b.id))
  return {occurrences}
 }
 readForPlan(id:string){const row=this.occurrence(id),review=this.reviews.get(id);if(!review||review.status==='consolidated')throw new PracticeError('请先确认加入待复习队列',409);return {row,review}}
 readConfirmed(id:string,after?:string,minimumIndex=0){
  const row=this.occurrence(id),review=this.reviews.get(id)
  const attempt=review?.history.slice(minimumIndex).filter(entry=>entry.correct&&entry.confirmedAt&&(!after||entry.confirmedAt>=after)).at(-1)
  if(!attempt)throw new PracticeError('尚无匹配的重新作答、反思及学习者确认',409)
  return {occurrenceId:id,roundId:row.roundId,questionId:row.questionId,subject:row.subject,knowledgePoint:row.knowledgePoint,attemptId:attempt.id,confirmedAt:attempt.confirmedAt!,reflection:attempt.reflection!}
 }
 queue(){const rows=this.list().occurrences.filter(row=>row.review&&row.review.status!=='consolidated');return {total:rows.length,due:rows.filter(row=>row.review!.dueAt<=new Date().toISOString()).length}}
 private occurrence(id:string){const row=this.list().occurrences.find(row=>row.id===id);if(!row)throw new PracticeError('错题记录不存在于当前档案',404);return row}
 async command(body:Record<string,unknown>){
  const id=z.string().max(500).parse(body.id),row=this.occurrence(id),now=new Date()
  if(body.action==='enroll'){
   if(body.confirmed!==true)throw new PracticeError('请确认加入1/3/7天复习队列',409)
   const existing=this.reviews.get(id);if(existing)return existing
   const value:ReviewRecord={version:1,stage:0,status:'scheduled',dueAt:dayAfter(now,1),enrolledAt:now.toISOString(),history:[]};await this.reviews.put(id,value);return value
  }
  const current=this.reviews.get(id);if(!current)throw new PracticeError('请先确认加入复习队列',409)
  if(body.action==='answer'){
   const requestId=z.string().min(1).max(200).parse(body.requestId),answer=z.string().min(1).max(100).parse(body.answer).trim()
   const previous=current.history.find(item=>item.requestId===requestId)
   if(previous){if(previous.answer!==answer)throw new PracticeError('同次复习作答冲突',409);return previous}
   if(current.dueAt>now.toISOString()&&body.earlyConfirmed!==true)throw new PracticeError('尚未到期，请明确选择提前复习',409)
   if(current.status==='consolidated')throw new PracticeError('该记录已巩固',409)
   if(current.history.some(item=>!item.confirmedAt))throw new PracticeError('请先反思并确认上次作答',409)
   if(!row.options.some(option=>optionKey(option)===answer))throw new PracticeError('请选择原题选项')
   const result={id:randomUUID(),requestId,answer,correct:answer===row.correctAnswer.trim(),answeredAt:now.toISOString()}
   await this.reviews.put(id,{...current,history:[...current.history,result]});return result
  }
  if(body.action==='confirm'){
   if(body.confirmed!==true)throw new PracticeError('请由学习者确认本次复习',409)
   const reflection=z.string().trim().min(1).max(10000).parse(body.reflection),attemptId=z.string().parse(body.attemptId),item=current.history.find(item=>item.id===attemptId)
   if(!item)throw new PracticeError('本次复习作答不存在',404)
   if(item.confirmedAt){if(item.reflection!==reflection)throw new PracticeError('已确认反思冲突',409);return current}
   const stage=item.correct?Math.min(3,current.stage+1):0,status=item.correct?(stage===3?'consolidated':'scheduled'):'pending-correction'
   const value:ReviewRecord={...current,stage,status,dueAt:dayAfter(now,item.correct?(stage===1?3:7):1),history:current.history.map(entry=>entry.id===item.id?{...entry,reflection,confirmedAt:now.toISOString()}:entry)}
   await this.reviews.put(id,value);return value
  }
  throw new PracticeError('未知复习操作')
 }
}



