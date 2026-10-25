import type {Context} from '@deepseek-ai/cordis'
import {requireProtocol} from 'dsh-worktable/sdk'
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
import {legacyAssetRoutes,legacyAssetPaths} from './legacy-asset-http.ts'
import {materialImportDomain,materialPlansDomain,assertMaterialImportReady} from './materials-state.ts'
import {createMaterialImportOwner} from './materials-owner.ts'
import {mountMaterialImportHttp} from './materials-http.ts'
import type {ProvenAssetPlan} from './adopted-assets.ts'

const metadata=defineDomain({name:'kaogong_platform_rc3',version:1,tables:{
 receipts:domainTable(z.object({instanceId:z.string(),businessId:z.string(),kind:z.enum(['review','lesson']),requestId:z.string(),status:z.enum(['claimed','done','releasing','rejected'])})),
 jobs:domainTable(z.object({instanceId:z.string(),id:z.string()})),
}})
/** Public SDK registration only; legacy stores are not opened or adopted on activation. */
export async function mountKaogong(ctx:Context,config:Config){
 requireProtocol(ctx.worktableProtocol.describe(),['application-task-owner-v1','host-resource-call-v1','native-role-context-v1','private-resource-v1','instance-admission-v1','task-owner-no-admission-v1','host-provision-intent-v1'])
 const disposers:(()=>void|Promise<void>)[]=[]
 let host:KaogongHost|undefined
 let materialImport:ReturnType<typeof createMaterialImportOwner>|undefined
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
  const materialState=await ctx.storageDomain.open(materialImportDomain)
  disposers.push(()=>materialState.close())
  const materialPlans=await ctx.storageDomain.open(materialPlansDomain)
  disposers.push(()=>materialPlans.close())
  // Old receipts are only read for quarantine and exact original asset references, never resumed on activation.
  const assetPlans=():ProvenAssetPlan[]=>[
   ...[...adoptionState.table('journals').entries()].filter(([,row])=>row.status==='applied').flatMap(([,row])=>{const stored=adoptionPlans.table('plans').get(row.planId);return stored&&stored.fingerprint===row.planFingerprint?[stored.plan]:[]}),
   ...[...materialState.table('journals').entries()].filter(([,row])=>row.status==='applied').flatMap(([,row])=>{const stored=materialPlans.table('plans').get(row.planId);return stored&&stored.fingerprint===row.planFingerprint?[stored.plan]:[]}),
  ]
  const readBinding=async(instanceId:string,key:{subject:string})=>{
   const roleId=subjectRoleIds[roleSubjects.indexOf(key.subject)]??'teacher'
   return (await ctx.worktableRoles.read(instanceId,roleId)).binding
  }
  const pool=new KaogongInstancePool(ctx.storageDomain,{readBinding})
  const mineru=new Mineru(()=>config.mineru.get()??{})
  const registry=async(state:KaogongInstanceState,command='')=>{
   const viewId=await instanceView(ctx.worktableApplications,state.instanceId)
   const {instance}=await ctx.worktableApplications.resolveView(viewId)
   const legacyAsset=legacyAssetPaths.includes(command.replace(/^exact:/,'') as typeof legacyAssetPaths[number])
   const combined=command==='exact:/api/kaogong/dashboard'||command==='exact:/api/kaogong/lesson/create'
   const needsBank=!legacyAsset&&(combined||command==='exact:/api/kaogong/practice/start'||command==='kaogong_practice'||command.startsWith('kaogong_bank_'))
   const needsMaterials=!legacyAsset&&(combined||['exact:/api/kaogong/knowledge','exact:/api/kaogong/document-image','kaogong_knowledge_read','kaogong_knowledge_search','kaogong_knowledge_list'].includes(command))
   const bankRows=needsBank?await sourceRows<BankQuestionRecord>(ctx.worktableResources,viewId,'question-bank'):[]
   const materialSource=needsMaterials?(await ctx.worktableResources.call<Rows<KnowledgeEntryRecord>>({viewId,resourceId:'materials',action:'read'})).value:null
   const materialRows=materialSource?.rows??[]
   const bankQuestions=instance.appId==='kaogong-library'?readonlyRows(bankRows):overlay(state.bankQuestions,bankRows)
   // The library's own view can inspect private lectures; sharing still passes through registerResources.
   const knowledgeEntries=instance.appId==='kaogong-library'?readonlyRows([...state.knowledgeEntries.entries()].filter(([,row])=>row.kind!=='笔记')):overlay(state.knowledgeEntries,materialRows)
   const practice=new PracticeRounds(state.rounds,bankQuestions,state.questions)
   const lessons=new Lessons(state.lessonRecords,knowledgeEntries,practice,key=>readBinding(state.instanceId,key),state.lessonSelection)
   const scopedMineru={root:()=>mineru.root(),
    start:async(...args:Parameters<Mineru['start']>)=>{const job=await mineru.start(...args);await meta.table('jobs').put(job.id,{instanceId:state.instanceId,id:job.id});return job},
    collect:async(id:string)=>{if(meta.table('jobs').get(id)?.instanceId!==state.instanceId)throw Error('Document job does not belong to this instance');return mineru.collect(id)},
    image:async(id:string,asset:string)=>{const owner=meta.table('jobs').get(id)?.instanceId;if(owner!==state.instanceId&&(!owner||materialSource?.ownerInstanceId!==owner||!materialRows.some(([key])=>key==='mineru_'+id)))throw Error('Document source is not authorized');return mineru.image(id,asset)},
   }
   // Legacy absolute image roots remain unread until an explicit migration establishes ownership.
   const registry=businessRegistry({...config,questionImageRoot:{get:()=>undefined}},{...state,bankQuestions,knowledgeEntries,practice,lessons},scopedMineru)
      for(const route of legacyAssetRoutes({instanceId:state.instanceId,viewId,state,resources:ctx.worktableResources,plans:assetPlans,newImage:async(id,reference)=>{
    const record=state.knowledgeEntries.get(id);if(!record||![...record.content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].some(row=>row[1]===reference))return undefined
    const url=new URL(reference,'http://localhost'),job=url.searchParams.get('id'),asset=url.searchParams.get('asset')
    if(url.pathname!=='/api/kaogong/document-image'||!job||!asset||meta.table('jobs').get(job)?.instanceId!==state.instanceId)return undefined
    return scopedMineru.image(job,asset)
   }}))registry.routes.set(route.kind+':'+route.path,route)
   const addKnowledge=registry.tools.get('kaogong_knowledge_add')
   if(addKnowledge)registry.tools.set('kaogong_knowledge_add',{...addKnowledge,execute:async(args,execution)=>{
    const id=args&&typeof args==='object'&&'id'in args&&typeof args.id==='string'?args.id.trim():''
    // Generated IDs and known own edits have no source dependency. An explicit new ID must not shadow a shared record.
    if(id&&!state.knowledgeEntries.get(id)){
     const rows=await sourceRows<KnowledgeEntryRecord>(ctx.worktableResources,viewId,'materials')
     if(rows.some(([key])=>key===id))throw Error('Shared source is read-only')
    }
    return addKnowledge.execute(args,execution)
   }})
   return {...registry,dispose:async()=>{await lessons.close();await practice.close()}}
  }
  host=new KaogongHost({applications:ctx.worktableApplications,roles:ctx.worktableRoles,pool,connection:ctx.connection,registry,assertReady:instanceId=>{assertAdoptionReady(adoptionState.table('journals'),instanceId);assertMaterialImportReady(materialState.table('journals'),instanceId)}})
  const runtime=host
  disposers.push(()=>runtime.close())
  disposers.push(registerResources(runtime,ctx.worktableApplications,ctx.worktableResources,(instanceId,id)=>!!adoptionState.table('private_knowledge').get(privateKnowledgeKey(instanceId,id))||!!materialState.table('private_knowledge').get(privateKnowledgeKey(instanceId,id))))
  materialImport=createMaterialImportOwner(ctx,runtime,materialState,materialPlans,config)
  disposers.push(()=>materialImport!.close())
  disposers.push(mountMaterialImportHttp(ctx,materialImport))
  disposers.push(await installKaogongRoles(ctx,config.roleCwd))
  disposers.push(registerTaskOwners(runtime,ctx.worktableTaskOwners,meta.table('receipts'),ctx.worktableResources))
  // Registration descriptors do not read tables or create a Session.
  const templates=businessRegistry(config,{} as KaogongInstanceState,mineru)
  for(const [key,route] of templates.routes)disposers.push(ctx.webServer.register({...route,handler:(req,res)=>runtime.http(key,req,res)}))
  for(const path of legacyAssetPaths)disposers.push(ctx.webServer.register({kind:'exact',path,handler:(req,res)=>runtime.http('exact:'+path,req,res)}))
  for(const [name,tool] of templates.tools)disposers.push(ctx.tools.register({...tool,execute:(args,execution)=>runtime.tool(name,args,execution)}, {when:context=>runtime.active(name,context)}))
 }catch(error){
  // Stop admission before withdrawing sources and releasing metadata.
  await materialImport?.close();await host?.close()
  await Promise.allSettled(disposers.reverse().map(remove=>Promise.resolve().then(remove)))
  throw error
 }
 return async()=>{
  await materialImport?.close();await host?.close()
  for(const remove of disposers.reverse())await remove()
 }
}
