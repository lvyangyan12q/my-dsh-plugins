import {matchesMaterialPoint} from './material-points.ts'
import {canonicalKnowledgePoint} from './knowledge-point-identity.ts'
import {learningOutline} from './learning-outline.ts'
import type {BusinessRegistry} from './business.ts'
import type {KaogongInstanceState} from './instance-state.ts'
/** Read projection over the owned archive and currently authorized material overlay. */
export function registerLearningRoute(registry:BusinessRegistry,state:KaogongInstanceState){
 return registry.webServer.register({kind:'exact',path:'/api/kaogong/route',handler:async(req,res)=>{
  const send=(code:number,value:unknown)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}
  if(req.method!=='GET'){send(405,{error:'GET required'});return}
  const recalls=state.recalls.list()
  const errors=state.errors.list().occurrences
  const points=learningOutline.map(point=>{
   const recall=recalls.find(row=>row.pointId===point.id)
   const wrongs=errors.filter(row=>row.subject===point.subject&&canonicalKnowledgePoint(row.subject,row.knowledgePoint)===point.knowledgePoint&&row.review&&row.review.status!=='consolidated')
   const dueDates=[...(recall?[recall.dueAt]:[]),...wrongs.map(row=>row.review!.dueAt)].sort()
   const review={reviewDueAt:dueDates[0]??null,recallPointId:recall?point.id:null,reviewOccurrenceIds:wrongs.map(row=>row.id)}
   const materials=[...state.knowledgeEntries.entries()].filter(([id,row])=>matchesMaterialPoint(state,id,row,point)).map(([id,row])=>({id,title:row.title}))
   const tasks=state.plan.read().tasks.filter(task=>task.knowledgePointId===point.id&&task.kind==='learn');const learned=tasks.some(task=>task.status==='completed')||[...state.lessonRecords.entries()].some(([,lesson])=>!!lesson.completion&&lesson.request.knowledgePointId===point.id&&lesson.request.subject===point.subject);return {...point,...review,materials,status:learned?'learned':tasks.some(task=>task.status==='in-progress')?'learning':'unlearned',taskId:(tasks.find(task=>task.status==='in-progress')??tasks.find(task=>task.status==='pending'))?.id}
  })
  send(200,{points,coverage:{learned:points.filter(point=>point.status==='learned').length,total:points.length}})
 }})
}
