import type {Context} from '@deepseek-ai/cordis'
import {assembleContextFor,type Agent} from '@deepseek-ai/dsh-agent'
import type {IncomingMessage,ServerResponse} from 'node:http'
import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {finalAssistantOutput} from '@deepseek-ai/dsh-subagent'
import {recipeSchema} from './recipe-schema.ts'
import type {GenerationJob} from './generation-api.ts'
const presetId='my-dsh.platform-generator'
const identity=z.string().min(1).max(200)
const requestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('start'),requirement:z.string().trim().min(1).max(16000),appId:identity,version:z.number().int().positive(),expectedRevision:z.number().int().nonnegative()}).strict(),
 z.object({action:z.enum(['status','cancel']),id:z.string().uuid()}).strict(),
])
/** No ambient conversation, external model client, executable output or policy overrides. */
export async function installGeneration(ctx:Context){
 const builtin='personal-workbench-generator-guard'
 if(ctx.loader.builtins[builtin])throw new Error('Generator guard identity already registered')
 const guardPlugin={inject:['tools','systemPrompt'],apply:(scope:Context)=>{
  scope.tools.presentAs('native');scope.tools.restrict({allow:[]});scope.tools.guard(()=> 'Application generation does not permit tool execution')
  // Team and Schedule hydrate Agent-own tools, which inherited restrictions deliberately exempt.
  // Narrow only the model-facing assembly; keep native execution guards and policy unchanged.
  scope.on('system-prompt/assemble',async(_assembly,_context,next)=>({...await next(),tools:[]}))
 }}
 ctx.loader.builtins[builtin]=guardPlugin
 let removePreset:()=>Promise<void>
 try{removePreset=await ctx.agentPresets.register({id:presetId,name:'Application recipe generator',description:'Generate data-only recipe drafts',plugins:[{name:'cordis:'+builtin}]});const preset=await ctx.agentPresets.resolve(presetId);if(preset.broken){await removePreset();throw new Error('Generator preset unavailable: '+preset.broken)}}catch(error){delete ctx.loader.builtins[builtin];throw error}
 const jobs=new Map<string,{view:GenerationJob;controller:AbortController;task:Promise<void>}>()
 let closing=false
 const execute=async(input:Extract<z.infer<typeof requestSchema>,{action:'start'}>,job:{view:GenerationJob;controller:AbortController})=>{
  const {view,controller}=job;let agent:Agent|undefined
  const cancel=()=>agent?.cancel({kind:'user'})
  controller.signal.addEventListener('abort',cancel,{once:true})
  try{
   const catalog=await ctx.personalWorkbenchRecipes.generationCatalog();controller.signal.throwIfAborted()
   const created=await ctx.sessionController.create({cwd:process.cwd(),agentPreset:presetId});view.sessionId=created.sessionId
   const resolved=await ctx.sessionController.resolveAgent(created.sessionId);if('error' in resolved)throw resolved.error;agent=resolved.agent
   controller.signal.throwIfAborted()
   // Check the native model-facing surface after all hydrated scoped contributions.
   const assembled=await agent.ctx.systemPrompt.assemble(assembleContextFor(agent,controller.signal))
   const toolNames=assembled.tools.map(tool=>tool.name)
   if(toolNames.length)throw new Error('Generator tool inventory is not empty: '+toolNames.join(', '))
   const safeCatalog={...catalog,connections:catalog.connections.filter(source=>source.appId===input.appId)}
   const prompt=JSON.stringify({task:'Return exactly one JSON application recipe. Use only the supplied schema and registered catalog. No markdown, code, extra keys or tool calls. The identity and version must match target. Connections must belong to target.appId. If no data source exists, use no connections. Roles are optional.',target:{appId:input.appId,version:input.version},requirement:input.requirement,schema:z.toJSONSchema(recipeSchema),catalog:safeCatalog})
   const offset=agent.session.snapshotEvents().length
   controller.signal.throwIfAborted()
   agent.followup(createUserMessage({content:[{type:'text',text:prompt}],source:{kind:'user'}}))
   await agent.whenIdle();controller.signal.throwIfAborted()
   const events=agent.session.snapshotEvents().slice(offset),end=[...events].reverse().find(event=>event.type==='turn/end')
   if(end?.type!=='turn/end'||end.data.reason.kind!=='completed')throw new Error('Native generation did not complete: '+(end?.type==='turn/end'?end.data.reason.kind:'missing outcome'))
   const output=finalAssistantOutput(events)??[]
   if(!output.length||output.some(block=>block.type!=='text'))throw new Error('Generator must return text JSON only')
   const text=output.map(block=>block.type==='text'?block.text:'').join('')
   if(Buffer.byteLength(text,'utf8')>262144)throw new Error('Generated recipe is too large')
   const recipe=recipeSchema.parse(JSON.parse(text))
   if(recipe.appId!==input.appId||recipe.version!==input.version)throw new Error('Generated recipe identity or version changed')
   controller.signal.throwIfAborted()
   // Once commit starts cancel is refused; saveGenerated revalidates and commits under recipe CAS.
   view.status='saving'
   view.record=await ctx.personalWorkbenchRecipes.saveGenerated(recipe,input.expectedRevision,controller.signal)
   view.status='completed'
  }catch(error){view.status=controller.signal.aborted?'cancelled':'failed';view.error=controller.signal.aborted?'Generation cancelled':(error instanceof Error?error.message:'Generation failed').slice(0,2000)}
  finally{controller.signal.removeEventListener('abort',cancel);if(agent){if(controller.signal.aborted)agent.cancel({kind:'user'});await agent.whenIdle()}}
 }
 const dispatch=(raw:unknown):GenerationJob=>{
  const input=requestSchema.parse(raw)
  if(closing)throw new Error('Generation unavailable')
  if(input.action!=='start'){const job=jobs.get(input.id);if(!job)throw new Error('Generation job not found');if(input.action==='cancel'&&job.view.status==='running')job.controller.abort(new Error('User cancelled'));return structuredClone(job.view)}
  if([...jobs.values()].filter(job=>job.view.status==='running'||job.view.status==='saving').length>=4)throw new Error('Too many active generations')
  const existing=ctx.personalWorkbenchRecipes.list().find(row=>row.appId===input.appId)
  if((existing?.revision??0)!==input.expectedRevision)throw new Error('Recipe changed; refresh and retry')
  if(existing?.running&&input.version<=existing.running.version)throw new Error('Draft version must exceed running version')
  for(const[id,job]of jobs){if(jobs.size<100)break;if(job.view.status!=='running'&&job.view.status!=='saving')jobs.delete(id)}
  const view:GenerationJob={id:randomUUID(),appId:input.appId,status:'running'},job={view,controller:new AbortController(),task:Promise.resolve()}
  jobs.set(view.id,job);job.task=execute(input,job);void job.task.catch(()=>{})
  return structuredClone(view)
 }
 const requests=new Set<Promise<void>>()
 const handle=async(req:IncomingMessage,res:ServerResponse)=>{
  const respond=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))}
  try{const rejection=ctx.connection.requestRejection(req);if(rejection!==undefined){respond(rejection,{error:'Authenticated same-origin request required'});return}if(closing){respond(503,{error:'Generation unavailable'});return}if(req.method!=='POST'){res.setHeader('allow','POST');respond(405,{error:'POST required'});return}if(!req.headers['content-type']?.startsWith('application/json')){respond(415,{error:'JSON required'});return}let size=0;const chunks:Buffer[]=[];for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>32768){respond(413,{error:'Request too large'});return}chunks.push(bytes)}const job=dispatch(JSON.parse(Buffer.concat(chunks).toString('utf8')));respond(200,{job})}catch(error){respond(409,{error:error instanceof Error?error.message:'Generation request failed'})}
 }
 return {dispatch,handle:(req:IncomingMessage,res:ServerResponse)=>{const task=handle(req,res);requests.add(task);void task.finally(()=>requests.delete(task)).catch(()=>{});return task},settled:async(id:string)=>{const job=jobs.get(id);if(!job)throw new Error('Generation job not found');await job.task;return structuredClone(job.view)},dispose:async()=>{closing=true;for(const job of jobs.values())if(job.view.status==='running')job.controller.abort(new Error('Generation service closing'));await Promise.allSettled([...requests,...[...jobs.values()].map(job=>job.task)]);await removePreset();if(ctx.loader.builtins[builtin]===guardPlugin)delete ctx.loader.builtins[builtin]}}
}
