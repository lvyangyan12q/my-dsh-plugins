import {canonicalKnowledgePoint} from './knowledge-point-identity.ts'
import {learningOutline} from './learning-outline.ts'
import type {BusinessRegistry} from './business.ts'
import type {KaogongInstanceState} from './instance-state.ts'
/** Read projection over the owned archive and currently authorized material overlay. */
export function registerLearningRoute(registry:BusinessRegistry,state:KaogongInstanceState){
 return registry.webServer.register({kind:'exact',path:'/api/kaogong/route',handler:async(req,res)=>{
  const send=(code:number,value:unknown)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}
  if(req.method!=='GET'){send(405,{error:'GET required'});return}
  const points=learningOutline.map(point=>{
   const materials=[...state.knowledgeEntries.entries()].filter(([,row])=>row.subject===point.subject&&canonicalKnowledgePoint(row.subject,row.knowledgePoint)===point.knowledgePoint&&row.kind!=='笔记').map(([id,row])=>({id,title:row.title}))
   const tasks=state.plan.read().tasks.filter(task=>task.knowledgePointId===point.id&&task.kind==='learn');const learned=tasks.some(task=>task.status==='completed')||[...state.lessonRecords.entries()].some(([,lesson])=>!!lesson.completion&&lesson.request.knowledgePointId===point.id&&lesson.request.subject===point.subject);return {...point,materials,status:learned?'learned':tasks.some(task=>task.status==='in-progress')?'learning':'unlearned',taskId:tasks.find(task=>task.status!=='completed')?.id}
  })
  send(200,{points,coverage:{learned:points.filter(point=>point.status==='learned').length,total:points.length}})
 }})
}
