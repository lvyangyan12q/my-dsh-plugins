import type {Context} from '@deepseek-ai/cordis'
import type {IncomingMessage,ServerResponse} from 'node:http'
import {defineDomain,domainTable} from '@deepseek-ai/dsh-storage-domain'
import {z} from 'zod'
import type {} from './recipe-api.ts'
import type {} from './app-lifecycle-api.ts'
const id=z.string().min(1).max(200),number=z.number().finite().min(0).max(100000)
const scope={appId:id,instanceId:id,pageId:id}
const annotation=z.object({id,moduleId:id.nullable(),moduleTitle:z.string().max(500),box:z.object({x:number,y:number,width:number,height:number}).strict(),canvas:z.object({width:number.positive(),height:number.positive(),scrollX:number,scrollY:number}).strict(),text:z.string().max(2000),limited:z.boolean(),moduleBounds:z.object({x:z.number().finite().min(-100000).max(100000),y:z.number().finite().min(-100000).max(100000),width:number,height:number,focused:z.boolean()}).strict().optional()}).strict()
const fields={recipeVersion:z.number().int().positive(),annotation,requirement:z.string().trim().min(1).max(2000),roleId:id}
const requestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('list'),...scope}).strict(),
 z.object({action:z.literal('save'),...scope,...fields}).strict(),
 z.object({action:z.literal('archive'),...scope,id,archived:z.boolean()}).strict(),
])
const recordSchema=z.object({...scope,...fields,createdAt:z.string(),archived:z.boolean()}).strict()
const definition=defineDomain({name:'personal_workbench_annotations',version:1,tables:{records:domainTable<string,z.infer<typeof recordSchema>>(recordSchema)}})
/** Durable notes are independent from native drafts; this service never creates or sends a Session. */
export async function installAnnotationRecords(ctx:Context){
 const domain=await ctx.storageDomain.open(definition),table=domain.table('records');let closed=false,tail=Promise.resolve();const pending=new Set<Promise<void>>()
 const serial=<T>(fn:()=>Promise<T>)=>{const task=tail.catch(()=>{}).then(fn);tail=task.then(()=>{},()=>{});return task}
 const dispatch=async(req:IncomingMessage,res:ServerResponse)=>{
  const respond=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
  try{
   const denied=ctx.connection.requestRejection(req);if(denied!==undefined){respond(denied,{error:'Authenticated same-origin request required'});return}
   if(req.method!=='POST'){res.setHeader('allow','POST');respond(405,{error:'POST required'});return}
   if(!req.headers['content-type']?.startsWith('application/json')){respond(415,{error:'JSON required'});return}
   const chunks:Buffer[]=[];let length=0;for await(const part of req){const bytes=Buffer.from(part);length+=bytes.length;if(length>32768){respond(413,{error:'Request too large'});return}chunks.push(bytes)}
   const parsed=requestSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));if(!parsed.success){respond(400,{error:'Invalid annotation request'});return}
   const data=parsed.data
   const records=await serial(async()=>{
    const recipe=ctx.personalWorkbenchRecipes.list().find(row=>row.appId===data.appId)?.running
    if(!recipe||ctx.personalWorkbenchApps.read(data.appId).enabled===false)throw Error('Running application unavailable')
    const matches=(row:z.infer<typeof recordSchema>)=>row.appId===data.appId&&row.instanceId===data.instanceId&&row.pageId===data.pageId
    const list=()=>[...table.entries()].map(([,row])=>row).filter(matches).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.annotation.id.localeCompare(b.annotation.id))
    if(data.action==='save'){
     const page=recipe.pages.find(page=>page.id===data.pageId),mark=data.annotation
     if(recipe.version!==data.recipeVersion||!page||!recipe.roles.some(role=>role.id===data.roleId)||mark.moduleId&&!page.modules.some(module=>module.id===mark.moduleId))throw Error('Annotation target changed; select the current page again')
     if(mark.box.x+mark.box.width>mark.canvas.width+1||mark.box.y+mark.box.height>mark.canvas.height+1)throw Error('Annotation is outside the captured canvas')
     const key=JSON.stringify([data.appId,data.instanceId,data.pageId,mark.id]),existing=table.get(key)
     if(existing&&existing.recipeVersion!==data.recipeVersion)throw Error('Annotation belongs to an earlier page version')
     if(!existing&&list().length>=200)throw Error('This page has reached its 200 annotation limit')
     const {action,...record}=data;await table.put(key,{...record,createdAt:existing?.createdAt??new Date().toISOString(),archived:false})
    }else if(data.action==='archive'){
     const key=JSON.stringify([data.appId,data.instanceId,data.pageId,data.id]),record=table.get(key);if(!record)throw Error('Annotation unavailable');await table.put(key,{...record,archived:data.archived})
    }
    return list()
   });respond(200,{records})
  }catch(error){respond(409,{error:error instanceof Error?error.message:'Annotation storage unavailable'})}
 }
 return {handle:(req:IncomingMessage,res:ServerResponse)=>{if(closed){res.writeHead(503);res.end();return Promise.resolve()}const task=dispatch(req,res);pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task},dispose:async()=>{closed=true;await Promise.allSettled([...pending,tail]);await domain.close()}}
}
