import {createRequests} from './requests.mjs'
import {readFile} from 'node:fs/promises'
import {createTeaching,teachingSkill,createLearningDispatcher} from './teaching.mjs'
import {defineDomain} from '@deepseek-ai/dsh-storage-domain'
import {z} from 'zod'
import {createApplication} from './application.mjs'

export const name='personal-learning'
export const inject=['storageDomain','webServer','connection','skills','workspaceRegistry','sessionController','sessionPersistence']
export const learningDomain=defineDomain({name:'personal_learning',version:1,global:{schema:z.object({instances:z.array(z.object({id:z.string(),title:z.string(),goal:z.string(),priorKnowledge:z.string(),createdAt:z.string()})),bindings:z.array(z.object({instanceId:z.string(),workspaceId:z.string(),sessionId:z.string(),phase:z.enum(['intent','ready'])})).default([]),requests:z.array(z.any()).default([]),lastInstanceId:z.string().nullable()}),initial:{instances:[],lastInstanceId:null}}})
export function apply(ctx){ctx.effect(async function*(){
 const domain=await ctx.storageDomain.open(learningDomain)
 yield ctx.skills.register({name:teachingSkill,description:'个人学习 /teach：有来源的交互教学与理解检查',source:'bundled',provider:'personal-learning',content:(await readFile(new URL('../roles/skills/teach/SKILL.md',import.meta.url),'utf8')).replace(/^---[\s\S]*?---\s*/,''),invocation:{userInvocable:true,modelInvocable:true}})
 const teacher=createTeaching(ctx,{read:async()=>structuredClone(domain.global.get()),write:async state=>{await domain.global.set(state)}})
 const app=createApplication({read:async()=>structuredClone(domain.global.get()),write:async state=>{await domain.global.set(state)}})
 const dispatch=createLearningDispatcher(app,teacher,createRequests(ctx,{read:async()=>structuredClone(domain.global.get()),write:async state=>{await domain.global.set(state)}}))
 yield ()=>domain.close()
 yield ctx.webServer.register({kind:'exact',path:'/api/personal-learning',handler:async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
  const admission=ctx.connection.admit(req)
  if('rejection'in admission){send(admission.rejection,{error:'请登录当前 DSH'});return}
  try{
   if(req.method==='GET'){send(200,await dispatch(undefined));return}
   if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){send(405,{error:'需要 POST JSON'});return}
   let raw='';for await(const chunk of req){raw+=chunk.toString();if(raw.length>40000)throw Error('学习请求过大')}
   const body=JSON.parse(raw)
   send(200,await dispatch(body))
  }catch(error){send(400,{error:error instanceof Error?error.message:'学习操作失败'})}
 }})
},'personal learning application')}
