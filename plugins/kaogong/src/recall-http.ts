import {recallReferenceEvidence} from './recalls.ts'
import {learningOutline} from './learning-outline.ts'
import {canonicalKnowledgePoint} from './knowledge-point-identity.ts'
import type {BusinessRegistry} from './business.ts'
import type {KaogongInstanceState} from './instance-state.ts'
import {PracticeError} from './practice-rounds.ts'
import {z} from 'zod'
export function registerRecalls(registry:BusinessRegistry,state:KaogongInstanceState){return registry.webServer.register({kind:'exact',path:'/api/kaogong/recall',handler:async(req,res)=>{
 const send=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}
 const references=(pointId:string)=>{const point=learningOutline.find(p=>p.id===pointId);return point?[...state.knowledgeEntries.entries()].filter(([,row])=>row.kind!=='笔记'&&row.content.trim().length>0&&row.subject===point.subject&&canonicalKnowledgePoint(row.subject,row.knowledgePoint)===point.knowledgePoint).map(([id,row])=>({id,title:row.title,source:row.source,content:row.content.slice(0,12000)})):[]}
 const present=(row:ReturnType<typeof state.recalls.list>[number])=>{if(!row.revealedAt)return row;const current=references(row.pointId),changed=JSON.stringify(row.referenceEvidence)!==JSON.stringify(recallReferenceEvidence(current));return {...row,references:changed?[]:current,referenceChanged:changed}}
 try{if(req.method==='GET'){send(200,{items:state.recalls.list().map(present)});return}
 if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){send(405,{error:'POST JSON required'});return}
 let text='';for await(const part of req){text+=part;if(text.length>20000)throw new PracticeError('请求过大')}
 const raw=JSON.parse(text)
 if(raw.action==='enroll'){const body=z.object({action:z.literal('enroll'),pointId:z.string().max(200),confirmed:z.boolean()}).strict().parse(raw);send(200,present(await state.recalls.enroll(body.pointId,body.confirmed)));return}
 const body=z.object({action:z.enum(['answer','reveal','confirm']),pointId:z.string().max(200),cycleId:z.string().uuid(),recall:z.string().max(10000).optional(),earlyConfirmed:z.boolean().optional(),confirmed:z.boolean().optional(),rating:z.enum(['forgotten','fuzzy','remembered']).optional()}).strict().parse(raw)
 send(200,present(await state.recalls.command(body,()=>references(body.pointId))))
 }catch(error){send(error instanceof PracticeError?error.status:400,{error:error instanceof Error?error.message:'回忆操作失败'})}
}})}
