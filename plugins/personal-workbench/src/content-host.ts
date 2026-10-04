import {contentIdentity,matchesContentIdentity} from './content-identity.ts'
import type {Context} from '@deepseek-ai/cordis'
import type {IncomingMessage,ServerResponse} from 'node:http'
import {createHash,randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {defineDomain,domainTable} from '@deepseek-ai/dsh-storage-domain'
import {z} from 'zod'
import type {} from './recipe-role-host.ts'
import {contentPath,listContentDirectory,readContentFile,readContentSource} from './content-files.ts'
const id=z.string().min(1).max(200)
const requestSchema=z.object({action:z.enum(['list','file','reserve','artifact','begin','discard']),appId:id,instanceId:id,moduleId:id,requestId:id.optional(),path:z.string().max(2000).optional()}).strict()
const artifactPointer=z.object({path:z.string(),requestId:z.string()}).strict()
const artifactSchema=artifactPointer.extend({key:z.string(),signature:z.string(),root:z.string(),previous:artifactPointer.optional(),phase:z.enum(['prepared','started']).optional()}).strict()
export const contentDomain=defineDomain({name:'personal_workbench_content',version:1,tables:{artifacts:domainTable<string,z.infer<typeof artifactSchema>>(artifactSchema)}})
export async function installContent(ctx:Context){
 const domain=await ctx.storageDomain.open(contentDomain),artifacts=domain.table('artifacts');let closed=false,tail=Promise.resolve();const pending=new Set<Promise<void>>()
 const serial=<T>(fn:()=>Promise<T>)=>{const task=tail.catch(()=>{}).then(fn);tail=task.then(()=>{},()=>{});return task}
 const dispatch=async(req:IncomingMessage,res:ServerResponse)=>{
  const respond=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
  try{
   const denied=ctx.connection.requestRejection(req);if(denied!==undefined){respond(denied,{error:'Authenticated same-origin request required'});return}
   if(req.method!=='POST'){res.setHeader('allow','POST');respond(405,{error:'POST required'});return}
   if(!req.headers['content-type']?.startsWith('application/json')){respond(415,{error:'JSON required'});return}
   let size=0;const chunks:Buffer[]=[];for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>16384){respond(413,{error:'Request too large'});return}chunks.push(bytes)}
   const parsed=requestSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));if(!parsed.success){respond(400,{error:'Invalid content request'});return}const data=parsed.data
   if(ctx.personalWorkbenchApps.read(data.appId).enabled===false)throw new Error('Application disabled')
   const recipe=ctx.personalWorkbenchRecipes.list().find(r=>r.appId===data.appId)?.running,module=recipe?.pages.flatMap(p=>p.modules).find(m=>m.id===data.moduleId)
   if(!recipe||!module||!['resources','custom'].includes(module.type))throw new Error('Running content module unavailable')
   const root=await ctx.personalWorkbenchRecipeRoles.workspace(data.appId,data.instanceId),key=JSON.stringify([data.appId,data.instanceId,data.moduleId]),signature=contentIdentity(module)
   if(module.type==='resources'){
    const base=await contentPath(root,String(module.config.basePath??''))
    if(data.action==='list')respond(200,await listContentDirectory(base,data.path??''))
    else if(data.action==='file')respond(200,await readContentFile(base,data.path??''))
    else throw new Error('Resource action unavailable');return
   }
   if(module.config.mode==='file'&&data.action==='file'){respond(200,await readContentFile(root,String(module.config.path??'')));return}
   if(module.config.mode!=='generate'||!module.roleId)throw new Error('Generated content unavailable')
   if(data.action==='reserve'){
    const row=await serial(async()=>{
     const folder='.my-dsh/widgets/'+createHash('sha256').update(key).digest('hex'),parent=folder.slice(0,folder.lastIndexOf('/'))
     // Verify each existing parent before writing; never follow a junction outside the workspace.
     await contentPath(root,'');await mkdir(resolve(root,'.my-dsh'),{recursive:true});await contentPath(root,'.my-dsh');await mkdir(resolve(root,parent),{recursive:true});await contentPath(root,parent);await mkdir(resolve(root,folder),{recursive:true});await contentPath(root,folder)
     const stored=artifacts.get(key),prior=stored&&matchesContentIdentity(stored.signature,module)&&stored.root===root?stored:undefined
     let previous=prior?.previous
     if(prior&&prior.phase!=='prepared')try{
      // A displayed output may still be written by its old native task. Give the
      // next task a private snapshot, never a mutable pointer to that old output.
      const {bytes}=await readContentSource(root,prior.path)
      const snapshot=folder+'/previous-'+randomUUID()+'.html';await writeFile(resolve(root,snapshot),bytes,{flag:'wx'});await readContentFile(root,snapshot)
      previous={path:snapshot,requestId:prior.requestId}
     }catch(error){if(!previous&&(error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
     const requestId=randomUUID(),path=folder+'/'+requestId+'.html',row={key,signature,root,path,requestId,phase:'prepared' as const,...(previous?{previous}:{})};await artifacts.put(key,row);return {...row,...(previous?{previousPath:resolve(root,previous.path)}:{})}
    })
    respond(200,{requestId:row.requestId,path:resolve(row.root,row.path),relativePath:row.path,...(row.previousPath?{previousPath:row.previousPath}:{})});return
   }
   if(data.action==='begin'||data.action==='discard'){
    const value=await serial(async()=>{
     const row=artifacts.get(key)
     if(!data.requestId||!row||row.requestId!==data.requestId||!matchesContentIdentity(row.signature,module)||row.root!==root)throw new Error('Generation target changed; prepare the task again')
     if(data.action==='begin'){await artifacts.put(key,{...row,phase:'started'});return {requestId:row.requestId}}
     if(row.previous)await artifacts.put(key,{key,signature,root,...row.previous});else await artifacts.delete(key)
     return {discarded:true}
    });respond(200,value);return
   }
   if(data.action!=='artifact')throw new Error('Content action unavailable')
   const value=await serial(async()=>{
    const row=artifacts.get(key);if(!row||!matchesContentIdentity(row.signature,module)||row.root!==root)return {ready:false}
    let failure:string|undefined
    if(row.phase!=='prepared')try{const file=await readContentFile(root,row.path);return {ready:true,requestId:row.requestId,...file}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'){if(!row.previous)throw error;failure=error instanceof Error?error.message:'Generated content unavailable'}}
    if(row.previous){const file=await readContentFile(root,row.previous.path);return {ready:true,pending:row.phase!=='prepared'&&!failure,requestId:row.requestId,artifactRequestId:row.previous.requestId,...file,...(failure?{error:failure}:{})}}
    return {ready:false,pending:row.phase!=='prepared',requestId:row.requestId}
   });respond(200,value)
  }catch(error){respond(409,{error:error instanceof Error?error.message:'Content request failed'})}
 }
 return {handle:(req:IncomingMessage,res:ServerResponse)=>{if(closed){res.writeHead(503);res.end();return Promise.resolve()}const task=dispatch(req,res);pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task},dispose:async()=>{closed=true;await Promise.allSettled([...pending,tail]);await domain.close()}}
}
