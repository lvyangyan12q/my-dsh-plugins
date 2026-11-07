import {createContinuation} from './continuation.mjs'
import {createEvidence} from './evidence.mjs'
import {createMaps} from './maps.mjs'
import {defineTool} from '@deepseek-ai/dsh-tools'
import {createCourses} from './courses.mjs'
import {createRequests} from './requests.mjs'
import {readFile} from 'node:fs/promises'
import {createTeaching,teachingSkill,createLearningDispatcher} from './teaching.mjs'
import {learningDomain} from './domain.ts'
export {learningDomain} from './domain.ts'

import {createApplication} from './application.mjs'

export const name='personal-learning'
export const inject=['storageDomain','webServer','connection','skills','workspaceRegistry','sessionController','sessionPersistence','tools']

export function apply(ctx){ctx.effect(async function*(){
 const domain=await ctx.storageDomain.open(learningDomain)
 yield ctx.skills.register({name:teachingSkill,description:'个人学习 /teach：有来源的交互教学与理解检查',source:'bundled',provider:'personal-learning',content:(await readFile(new URL('../roles/skills/teach/SKILL.md',import.meta.url),'utf8')).replace(/^---[\s\S]*?---\s*/,''),invocation:{userInvocable:true,modelInvocable:true}})
 const teacher=createTeaching(ctx,{read:async()=>structuredClone(domain.global.get()),write:async state=>{await domain.global.set(state)}})
 const app=createApplication({read:async()=>structuredClone(domain.global.get()),write:async state=>{await domain.global.set(state)}})
 const storage={read:async()=>structuredClone(domain.global.get()),write:async state=>{await domain.global.set(state)}}
 const requests=createRequests(ctx,storage)
 const dispatch=createLearningDispatcher({app,teacher,requests,courses:createCourses(storage),maps:createMaps(storage),evidence:createEvidence(storage,requests),continuation:createContinuation(storage)})
 yield ctx.tools.register(defineTool({name:'personal_learning_submit_course',description:'Submit the requested standalone interactive HTML lesson. Only bound native teaching sessions can submit.',parameters:{requestId:{type:'string',description:'Prepared request ID'},title:{type:'string',description:'Course title'},html:{type:'string',description:'Self contained HTML with inline scripts and styles'},concepts:{type:'array',items:{type:'string'},description:'Concept names'},lab:{type:'object',additionalProperties:true,description:'Lab protocol v1: parameters, readouts, prediction, restate. The host validates it and rejects a lesson whose protocol is incomplete or inconsistent.'}},output:{schema:{type:'object',additionalProperties:false,properties:{summary:{type:'string',required:true}}},render:(_args,value)=>[{type:'text',text:value.summary}]},execute:async(args,execution)=>({summary:JSON.stringify(await dispatch(args,execution))}),presentCall:args=>({card:'generic',title:'提交交互课程',kind:'other',rawInput:{requestId:args.requestId,title:args.title}})}))
 yield ctx.tools.register(defineTool({name:'personal_learning_submit_feedback',description:'Submit feedback evaluating the answer to the specified evidence task. Requires its accepted feedback request and bound Session.',parameters:{requestId:{type:'string'},evidenceId:{type:'string'},feedback:{type:'string'}},output:{schema:{type:'object',additionalProperties:false,properties:{summary:{type:'string',required:true}}},render:(_args,value)=>[{type:'text',text:value.summary}]},execute:async(args,execution)=>({summary:JSON.stringify(await dispatch({...args,kind:'feedback'},execution))}),presentCall:args=>({card:'generic',title:'提交学习反馈',kind:'other',rawInput:{requestId:args.requestId,evidenceId:args.evidenceId}})}))
 yield ctx.tools.register(defineTool({name:'personal_learning_submit_map',description:'Submit typed concept nodes and relationships as a reviewable knowledge-map draft for the accepted request and bound Session.',parameters:{requestId:{type:'string',description:'Prepared request ID'},nodes:{type:'array',items:{type:'object',additionalProperties:false,properties:{id:{type:'string',required:true},title:{type:'string',required:true}}}},edges:{type:'array',items:{type:'object',additionalProperties:false,properties:{from:{type:'string',required:true},to:{type:'string',required:true},type:{type:'string',required:true}}}}},output:{schema:{type:'object',additionalProperties:false,properties:{summary:{type:'string',required:true}}},render:(_args,value)=>[{type:'text',text:value.summary}]},execute:async(args,execution)=>({summary:JSON.stringify(await dispatch({...args,kind:'map'},execution))}),presentCall:args=>({card:'generic',title:'提交知识地图草稿',kind:'other',rawInput:{requestId:args.requestId,}})}))
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
