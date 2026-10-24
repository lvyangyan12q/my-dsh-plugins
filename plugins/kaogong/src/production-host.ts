import type {Context} from '@deepseek-ai/cordis'
import type {} from 'dsh-worktable/sdk'
import {defineDomain,domainTable} from '@deepseek-ai/dsh-storage-domain'
import {z} from 'zod'
import {Mineru} from './mineru.ts'
import {businessRegistry} from './business-registry.ts'
import type {Config} from './business.ts'
import {KaogongInstancePool} from './instance-state.ts'
import type {KaogongInstanceState} from './instance-state.ts'
import {KaogongHost} from './instance-host.ts'
import {instanceView,overlay,readonlyRows,registerResources,sourceRows,type Rows} from './host-resources.ts'
import {installKaogongRoles,roleSubjects,subjectRoleIds} from './role-definitions.ts'
import {registerTaskOwners} from './task-owners.ts'
import {PracticeRounds} from './practice-rounds.ts'
import {Lessons} from './lessons.ts'
import type {BankQuestionRecord,KnowledgeEntryRecord} from './domain.ts'
import {adoptionDomain,adoptionPlansDomain,assertAdoptionReady,privateKnowledgeKey} from './legacy-adoption-state.ts'
import {createAdoptionOwner} from './legacy-adoption-owner.ts'
import {mountAdoptionHttp} from './adoption-http.ts'
import {legacyAssetRoutes,legacyAssetPaths} from './legacy-asset-http.ts'

const metadata=defineDomain({name:'kaogong_platform_rc3',version:1,tables:{
 receipts:domainTable(z.object({instanceId:z.string(),businessId:z.string(),kind:z.enum(['review','lesson']),requestId:z.string(),status:z.enum(['claimed','done'])})),
 jobs:domainTable(z.object({instanceId:z.string(),id:z.string()})),
}})
/** Public SDK registration only; legacy stores are not opened or adopted on activation. */
export async function mountKaogong(ctx:Context,config:Config){
 const protocol=ctx.worktableProtocol.describe()
 if(protocol.protocolVersion!==1||['application-task-owner-v1','host-resource-call-v1','native-role-context-v1','private-resource-v1','host-provision-intent-v1','legacy-role-source-inspection-v1'].some(feature=>!protocol.features.includes(feature)))throw Error('Install the rc.3 Worktable SDK with private resources, durable provisioning and public legacy identity inspection before enabling Kaogong')
 const disposers:(()=>void|Promise<void>)[]=[]
 let host:KaogongHost|undefined
 let adoption:ReturnType<typeof createAdoptionOwner>|undefined
 try{
  for(const [id,title,views] of [
   ['kaogong','考公学习',['page','classroom','practice','errors','materials','plan']],
   ['kaogong-library','考公资料库',['page','materials']],
  ] as const)disposers.push(await ctx.worktableApplications.contribute({id,title,version:'0.2.0-rc.3.1',protocolVersion:1,kind:'deep',views:views.map(id=>({id,title:id}))}))
  const meta=await ctx.storageDomain.open(metadata)
  disposers.push(()=>meta.close())
  const adoptionState=await ctx.storageDomain.open(adoptionDomain)
  disposers.push(()=>adoptionState.close())
  const adoptionPlans=await ctx.storageDomain.open(adoptionPlansDomain)
  disposers.push(()=>adoptionPlans.close())
  const readBinding=async(instanceId:string,key:{subject:string})=>{
   const roleId=subjectRoleIds[roleSubjects.indexOf(key.subject)]??'teacher'
   return (await ctx.worktableRoles.read(instanceId,roleId)).binding
  }
  const pool=new KaogongInstancePool(ctx.storageDomain,{readBinding})
  const mineru=new Mineru(()=>config.mineru.get()??{})
  const registry=async(state:KaogongInstanceState,command='')=>{
   const viewId=await instanceView(ctx.worktableApplications,state.instanceId)
   const {instance}=await ctx.worktableApplications.resolveView(viewId)
   const needsSource=!legacyAssetPaths.includes(command.replace(/^exact:/,'') as typeof legacyAssetPaths[number])&&/knowledge|document-image|dashboard|practice\/start|lesson\/create|kaogong_bank_|^kaogong_practice$/.test(command)
   const bankRows=needsSource?await sourceRows<BankQuestionRecord>(ctx.worktableResources,viewId,'question-bank'):[]
   const materialSource=needsSource?(await ctx.worktableResources.call<Rows<KnowledgeEntryRecord>>({viewId,resourceId:'materials',action:'read'})).value:null
   const materialRows=materialSource?.rows??[]
   const bankQuestions=instance.appId==='kaogong-library'?readonlyRows(bankRows):overlay(state.bankQuestions,bankRows)
   const knowledgeEntries=instance.appId==='kaogong-library'?readonlyRows(materialRows):overlay(state.knowledgeEntries,materialRows)
   const practice=new PracticeRounds(state.rounds,bankQuestions,state.questions)
   const lessons=new Lessons(state.lessonRecords,knowledgeEntries,practice,key=>readBinding(state.instanceId,key),state.lessonSelection)
   const scopedMineru={root:()=>mineru.root(),
    start:async(...args:Parameters<Mineru['start']>)=>{const job=await mineru.start(...args);await meta.table('jobs').put(job.id,{instanceId:state.instanceId,id:job.id});return job},
    collect:async(id:string)=>{if(meta.table('jobs').get(id)?.instanceId!==state.instanceId)throw Error('Document job does not belong to this instance');return mineru.collect(id)},
    image:async(id:string,asset:string)=>{const owner=meta.table('jobs').get(id)?.instanceId;if(owner!==state.instanceId&&(!owner||materialSource?.ownerInstanceId!==owner||!materialRows.some(([key])=>key==='mineru_'+id)))throw Error('Document source is not authorized');return mineru.image(id,asset)},
   }
   // Legacy absolute image roots remain unread until an explicit migration establishes ownership.
   const registry=businessRegistry({...config,questionImageRoot:{get:()=>undefined}},{...state,bankQuestions,knowledgeEntries,practice,lessons},scopedMineru)
      for(const route of legacyAssetRoutes({instanceId:state.instanceId,viewId,state,resources:ctx.worktableResources,plans:()=>[...adoptionState.table('journals').entries()].filter(([,row])=>row.status==='applied').flatMap(([,row])=>{const stored=adoptionPlans.table('plans').get(row.planId);return stored&&stored.fingerprint===row.planFingerprint?[stored.plan]:[]}),newImage:async(id,reference)=>{
    const record=state.knowledgeEntries.get(id);if(!record||![...record.content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].some(row=>row[1]===reference))return undefined
    const url=new URL(reference,'http://localhost'),job=url.searchParams.get('id'),asset=url.searchParams.get('asset')
    if(url.pathname!=='/api/kaogong/document-image'||!job||!asset||meta.table('jobs').get(job)?.instanceId!==state.instanceId)return undefined
    return scopedMineru.image(job,asset)
   }}))registry.routes.set(route.kind+':'+route.path,route)
   return {...registry,dispose:async()=>{await lessons.close();await practice.close()}}
  }
  host=new KaogongHost({applications:ctx.worktableApplications,roles:ctx.worktableRoles,pool,connection:ctx.connection,registry,assertReady:instanceId=>assertAdoptionReady(adoptionState.table('journals'),instanceId)})
  const runtime=host
  disposers.push(()=>runtime.close())
  disposers.push(registerResources(runtime,ctx.worktableApplications,ctx.worktableResources,(instanceId,id)=>!!adoptionState.table('private_knowledge').get(privateKnowledgeKey(instanceId,id))))
  disposers.push(await installKaogongRoles(ctx,config.roleCwd))
  adoption=createAdoptionOwner(ctx,runtime,adoptionState,adoptionPlans,config)
  disposers.push(()=>adoption!.close())
  disposers.push(mountAdoptionHttp(ctx,adoption))
  disposers.push(registerTaskOwners(runtime,ctx.worktableTaskOwners,meta.table('receipts'),ctx.worktableResources))
  // Registration descriptors do not read tables or create a Session.
  const templates=businessRegistry(config,{} as KaogongInstanceState,mineru)
  for(const [key,route] of templates.routes)disposers.push(ctx.webServer.register({...route,handler:(req,res)=>runtime.http(key,req,res)}))
  for(const path of legacyAssetPaths)disposers.push(ctx.webServer.register({kind:'exact',path,handler:(req,res)=>runtime.http('exact:'+path,req,res)}))
  for(const [name,tool] of templates.tools)disposers.push(ctx.tools.register({...tool,execute:(args,execution)=>runtime.tool(name,args,execution)}, {when:context=>runtime.active(name,context)}))
 }catch(error){
  // Stop admission before withdrawing sources and releasing metadata.
  await adoption?.close();await host?.close()
  await Promise.allSettled(disposers.reverse().map(remove=>Promise.resolve().then(remove)))
  throw error
 }
 return async()=>{
  await adoption?.close();await host?.close()
  for(const remove of disposers.reverse())await remove()
 }
}
