import {createHash} from 'node:crypto'
import {z} from 'zod'
import {learningOutline} from './learning-outline.ts'
import {canonicalKnowledgePoint} from './knowledge-point-identity.ts'
import type {KaogongInstanceState} from './instance-state.ts'
import type {KnowledgeEntryRecord} from './domain.ts'
import type {BusinessRegistry} from './business.ts'
export const materialPointRecord=z.object({materialId:z.string(),sourceOwnerId:z.string(),pointId:z.string()})
export const materialPointKey=(materialId:string,pointId:string)=>JSON.stringify([materialId,pointId])
const owner=(state:KaogongInstanceState,id:string)=>state.materialOwners?.get(id)??state.instanceId
export function matchesMaterialPoint(state:KaogongInstanceState,id:string,row:KnowledgeEntryRecord,point:{id:string;subject:string;knowledgePoint:string}){
 const mapped=state.materialPoints.get(materialPointKey(id,point.id))
 return row.kind!=='笔记'&&((row.subject===point.subject&&canonicalKnowledgePoint(row.subject,row.knowledgePoint)===point.knowledgePoint)||!!mapped&&mapped.sourceOwnerId===owner(state,id))
}
export function registerMaterialPoints(registry:BusinessRegistry,state:KaogongInstanceState){
 return registry.webServer.register({kind:'exact',path:'/api/kaogong/material-points',handler:async(req,res)=>{
  const send=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}
  const candidates=()=>[...state.knowledgeEntries.entries()].filter(([,row])=>row.kind!=='笔记'&&row.content.trim()).map(([id,row])=>({id,title:row.title,subject:row.subject,source:row.source,preview:row.content.slice(0,12000),fingerprint:createHash('sha256').update(JSON.stringify([owner(state,id),id,row])).digest('hex')}))
  try{
   if(req.method==='GET'){send(200,{materials:candidates(),points:learningOutline,mappings:[...state.materialPoints.entries()].map(([,row])=>({...row,available:!!state.knowledgeEntries.get(row.materialId)&&row.sourceOwnerId===owner(state,row.materialId)}))});return}
   if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){send(405,{error:'POST JSON required'});return}
   let text='';for await(const part of req){text+=part;if(text.length>20000)throw Error('请求过大')}
   const body=z.object({action:z.enum(['confirm','remove']),materialId:z.string().min(1).max(500),pointId:z.string().max(200),fingerprint:z.string().optional(),confirmed:z.literal(true)}).strict().parse(JSON.parse(text))
   if(!learningOutline.some(point=>point.id===body.pointId))throw Error('知识点不可用')
   const key=materialPointKey(body.materialId,body.pointId)
   if(body.action==='remove')await state.materialPoints.delete(key)
   else{const persist=async()=>{const material=candidates().find(row=>row.id===body.materialId);if(material&&material.subject!==learningOutline.find(point=>point.id===body.pointId)!.subject)throw Error('请选择与原讲义科目一致的知识点');if(!material||material.fingerprint!==body.fingerprint)throw Error('资料授权或内容已变化，请重新预览');await state.materialPoints.put(key,{materialId:body.materialId,pointId:body.pointId,sourceOwnerId:owner(state,body.materialId)})};if(state.withMaterialMappingLease)await state.withMaterialMappingLease(persist);else await persist()}
   send(200,{saved:true})
  }catch(error){send(409,{error:error instanceof Error?error.message:'关联未保存'})}
 }})
}
