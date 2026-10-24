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

const metadata=defineDomain({name:'kaogong_platform_rc3',version:1,tables:{
 receipts:domainTable(z.object({instanceId:z.string(),businessId:z.string(),kind:z.enum(['review','lesson']),requestId:z.string(),status:z.enum(['claimed','done'])})),
 jobs:domainTable(z.object({instanceId:z.string(),id:z.string()})),
}})
/** Public SDK registration only; legacy stores are not opened or adopted on activation. */
export async function mountKaogong(ctx:Context,config:Config){
 const protocol=ctx.worktableProtocol.describe()
 if(protocol.protocolVersion!==1||['application-task-owner-v1','host-resource-call-v1','native-role-context-v1','private-resource-v1'].some(feature=>!protocol.features.includes(feature)))throw Error('Install the rc.3 Worktable SDK with private resources and application task receipts before enabling Kaogong')
 const disposers:(()=>void|Promise<void>)[]=[]
 let host:KaogongHost|undefined
 try{
  for(const [id,title,views] of [
   ['kaogong','考公学习',['page','classroom','practice','errors','materials','plan']],
   ['kaogong-library','考公资料库',['page','materials']],
  ] as const)disposers.push(await ctx.worktableApplications.contribute({id,title,version:'0.2.0-rc.3.1',protocolVersion:1,kind:'deep',views:views.map(id=>({id,title:id}))}))
  const meta=await ctx.storageDomain.open(metadata)
  disposers.push(()=>meta.close())
  const readBinding=async(instanceId:string,key:{subject:string})=>{
   const roleId=subjectRoleIds[roleSubjects.indexOf(key.subject)]??'teacher'
   return (await ctx.worktableRoles.read(instanceId,roleId)).binding
  }
  const pool=new KaogongInstancePool(ctx.storageDomain,{readBinding})
  const mineru=new Mineru(()=>config.mineru.get()??{})
  const registry=async(state:KaogongInstanceState,command='')=>{
   const viewId=await instanceView(ctx.worktableApplications,state.instanceId)
   const {instance}=await ctx.worktableApplications.resolveView(viewId)
   const needsSource=/knowledge|document-image|dashboard|practice\/start|lesson\/create|kaogong_bank_list|^kaogong_practice$/.test(command)
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
   return {...registry,dispose:async()=>{await lessons.close();await practice.close()}}
  }
  host=new KaogongHost({applications:ctx.worktableApplications,roles:ctx.worktableRoles,pool,connection:ctx.connection,registry})
  const runtime=host
  disposers.push(()=>runtime.close())
  disposers.push(registerResources(runtime,ctx.worktableApplications,ctx.worktableResources))
  disposers.push(await installKaogongRoles(ctx,config.roleCwd))
  disposers.push(registerTaskOwners(runtime,ctx.worktableTaskOwners,meta.table('receipts'),ctx.worktableResources))
  // Registration descriptors do not read tables or create a Session.
  const templates=businessRegistry(config,{} as KaogongInstanceState,mineru)
  for(const [key,route] of templates.routes)disposers.push(ctx.webServer.register({...route,handler:(req,res)=>runtime.http(key,req,res)}))
  for(const [name,tool] of templates.tools)disposers.push(ctx.tools.register({...tool,execute:(args,execution)=>runtime.tool(name,args,execution)}, {when:context=>runtime.active(name,context)}))
 }catch(error){
  // Stop admission before withdrawing sources and releasing metadata.
  await host?.close()
  await Promise.allSettled(disposers.reverse().map(remove=>Promise.resolve().then(remove)))
  throw error
 }
 return async()=>{
  await host?.close()
  for(const remove of disposers.reverse())await remove()
 }
}
