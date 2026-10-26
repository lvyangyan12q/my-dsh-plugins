import { createHash, randomUUID } from 'node:crypto'
import { readFile, realpath, lstat } from 'node:fs/promises'
import { join, dirname, relative, isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import type { StudyWorkspace, StudyProfile, StudyView } from './study-workspace.ts'

const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex')
const same=(a:string,b:string)=>resolve(a).toLowerCase()===resolve(b).toLowerCase()
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const array=(v:unknown):any[]=>{if(!Array.isArray(v))throw Error('当前元数据格式不受支持');return v}
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=200&&v!=='default'
type Plan={id:string;digest:string;status:'prepared'|'applying'|'applied'|'unknown';home:string;sourceProfile:string;runtimeProfile:string;files:{path:string;sha256:string;bytes:number}[];profiles:StudyProfile[];views:StudyView[];bindings:any[];grants:any[];teaching:any[];conflicts:string[];createdAt:number;continueProfileId?:string}

/** Explicit current-study metadata transfer inside one Native home. Original
 * business domains, Native Sessions and immutable source receipts stay in place. */
export class CurrentStudyHandoff{
 private pending:Promise<unknown>=Promise.resolve()
 constructor(private ctx:Context,private workspace:StudyWorkspace,private sourceProfile?:string){}
 private table(){return this.workspace.domain.table('handoffs')}
 private present(plan:Plan){return{id:plan.id,digest:plan.digest,status:plan.status,sourceProfile:plan.sourceProfile,runtimeProfile:plan.runtimeProfile,home:plan.home,profiles:plan.profiles,views:plan.views,bindings:plan.bindings.map(({instanceId,roleId,sessionId,presetId,phase,revision,creation})=>({instanceId,roleId,sessionId,presetId,phase,revision,creation})),grants:plan.grants.map(({id,ownerInstanceId,consumerInstanceId,resourceId,status,revision})=>({id,ownerInstanceId,consumerInstanceId,resourceId,status,revision})),teaching:plan.teaching.map(({id,instanceId,status,requestId,ownerFinalization})=>({id,instanceId,status,requestId,ownerFinalization})),files:plan.files,conflicts:plan.conflicts,notice:'仅承接当前隔离档案元数据；原业务、Native会话和来源证明原位保留。已发送或未知任务不会重发。'}}
 private serial<T>(operation:()=>Promise<T>){const task=this.pending.then(operation);this.pending=task.catch(()=>{});return task}
 private async capture(){
  const runtime=this.ctx.profileContext
  if(!runtime||!this.sourceProfile||!isAbsolute(this.sourceProfile))throw Error('请由部署配置明确指定当前资料来源profile')
  const home=await realpath(runtime.home),sourceProfile=await realpath(this.sourceProfile),runtimeProfile=await realpath(runtime.dir)
  if(!same(await realpath(dirname(dirname(sourceProfile))),home)||dirname(sourceProfile).toLowerCase()!==join(home,'profiles').toLowerCase()||!same(await realpath(dirname(dirname(runtimeProfile))),home))throw Error('当前学习承接必须使用同一个Native home，不能复制会话跨home迁移')
  const files:Plan['files']=[],read=async(file:string,optional=false)=>{try{const stat=await lstat(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>64*1024*1024)throw Error('当前来源文件不可安全读取');const actual=await realpath(file),offset=relative(home,actual);if(!offset||offset.startsWith('..')||isAbsolute(offset))throw Error('当前来源逃出Native home');const bytes=await readFile(actual);files.push({path:actual,sha256:sha(bytes),bytes:bytes.length});return JSON.parse(bytes.toString('utf8'))}catch(error){if(optional&&(error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error}}
  const directory=join(sourceProfile,'worktable-platform')
  const apps=await read(join(directory,'applications.v1.json')),resources=await read(join(directory,'resources.v1.json')),roles=await read(join(directory,'roles.v1.json')),tasks=await read(join(directory,'tasks.v1.json'),true),migrations=await read(join(directory,'migrations.v1.json'),true)
  if(!object(apps)||![1,2,3,4,5].includes(apps.schema)||!object(resources)||resources.schema!==1||!object(roles)||![1,2,3,4].includes(roles.schema)||tasks&&(!object(tasks)||![1,2,3,4].includes(tasks.schema))||migrations&&(!object(migrations)||migrations.schema!==1))throw Error('当前来源schema不受支持')
  const selected=array(apps.instances).filter(row=>['kaogong','kaogong-library'].includes(row.appId))
  if(selected.some(row=>!id(row.id)||!Number.isSafeInteger(row.revision)||row.revision<1)||new Set(selected.map(row=>row.id)).size!==selected.length)throw Error('当前档案身份无效或重复')
  const ids=new Set(selected.map(row=>row.id)),profiles:StudyProfile[]=selected.map(row=>({...row,kind:row.appId==='kaogong-library'?'library':'learner',title:[row.title,row.name,row.label].find(value=>typeof value==='string'&&value.trim())??(row.appId==='kaogong-library'?'保留资料库 · ':'保留备考档案 · ')+row.id.slice(0,12)})),views:StudyView[]=array(apps.views).filter(row=>ids.has(row.instanceId)).map(row=>({...row,profileId:row.instanceId}))
  if(views.some(row=>!id(row.id))||new Set(views.map(row=>row.id)).size!==views.length)throw Error('当前学习视图身份无效或重复')
  for(const profile of profiles)if(!views.some(row=>row.profileId===profile.id))views.push({id:randomUUID(),profileId:profile.id})
  const bindings=array(roles.bindings).filter(row=>ids.has(row.instanceId)&&row.appId==='kaogong'),grants=array(resources.connections).filter(row=>ids.has(row.ownerInstanceId)||ids.has(row.consumerInstanceId)),teaching=array(tasks?.tasks??[]).filter(row=>ids.has(row.instanceId)&&row.appId==='kaogong')
  for(const rows of [bindings.map(row=>row.key),grants.map(row=>row.id),teaching.map(row=>row.id),grants.filter(row=>row.status==='active').map(row=>JSON.stringify([row.consumerInstanceId,row.resourceId]))])if(new Set(rows).size!==rows.length)throw Error('当前来源身份或有效授权不唯一，未选择首项')
  const conflicts:string[]=[]
  for(const row of array(apps.lifecycle??[]))if(['kaogong','kaogong-library'].includes(row.appId)&&row.enabled===false)conflicts.push('来源应用已停用：'+row.appId)
  for(const row of bindings){if(row.key!==JSON.stringify([row.instanceId,row.roleId])||!id(row.sessionId)||!['intent','ready'].includes(row.phase)||row.presetId!=='standard'||!isAbsolute(row.creation?.cwd??'')||!Array.isArray(row.previousSessionIds)||!Number.isSafeInteger(row.revision))throw Error('当前角色绑定不可证明');if(row.phase==='ready')await this.validateNative(row);else conflicts.push('角色创建结果待核对：'+row.roleId);const candidates=views.filter(view=>view.profileId===row.instanceId);if(typeof row.viewId!=='string'){const old=teaching.find(task=>task.sessionId===row.sessionId&&candidates.some(view=>view.id===task.source?.viewId));row.viewId=old?.source.viewId??candidates.find(view=>view.type==='page')?.id??candidates[0]?.id}}
  if(new Set(bindings.flatMap(row=>[row.sessionId,...row.previousSessionIds])).size!==bindings.flatMap(row=>[row.sessionId,...row.previousSessionIds]).length)throw Error('当前原生角色归属冲突')
  for(const row of grants)if(!ids.has(row.ownerInstanceId)||!ids.has(row.consumerInstanceId)||!['question-bank','materials'].includes(row.resourceId)||!['active','revoked'].includes(row.status)||!Array.isArray(row.allowedActions)||row.allowedActions.some((action:string)=>action!=='read')||!row.allowedActions.includes('read'))conflicts.push('资料授权关系不可证明：'+row.id)
  for(const row of teaching){if(!id(row.id)||!id(row.sessionId)||!['prepared','discarded','submitting','accepted','unknown','failed'].includes(row.status)||!Number.isSafeInteger(row.revision))throw Error('当前教学回执格式不受支持');if(['submitting','accepted','unknown'].includes(row.status)&&!id(row.requestId))throw Error('当前教学准入缺少精确回执');row.historicalHandoff=true}
  for(const row of array(apps.provisions??[]))if(ids.has(row.id)&&row.kind==='instance-admission'&&row.state!=='ready')conflicts.push('档案接入尚未完成：'+row.id)
  if(migrations&&array(migrations.plans??[]).some(row=>!['applied','discarded','rejected','closed','completed'].includes(row.status)))conflicts.push('来源存在未完成或未知迁移计划，需先核对')
  for(const profile of profiles){const prefix='kaogong_i_'+sha(profile.id)+'_';for(const [suffix,version]of [['notebook',1],['progress',1],['bank',2],['knowledge',1],['practice',1],['lessons',1]] as const){const data=await read(join(home,'storages',prefix+suffix+'.json'),true);if(data&&(!object(data)||data.unit?.name!==prefix+suffix||data.unit?.version!==version))throw Error('当前业务域身份或版本不匹配')}}
  for(const name of ['kaogong_platform_rc3','kaogong_adoption_rc3','kaogong_adoption_plans_rc3','kaogong_material_import_rc3','kaogong_material_plans_rc3'])await read(join(home,'storages',name+'.json'),true)
  return{home,sourceProfile,runtimeProfile,files,profiles,views,bindings,grants,teaching,conflicts,digest:sha(JSON.stringify(files))}
 }
 private async validateNative(row:any){
  const stored=await this.ctx.sessionPersistence.stat(row.sessionId),projection=await this.ctx.sessionController.projections({sessionId:row.sessionId},new AbortController().signal)
  if(!stored||stored.header.id!==row.sessionId||stored.formatStatus!=='current'||projection?.kind!=='sequenced'||projection.values.agentPreset!==row.presetId||typeof stored.header.cwd!=='string'||!same(await realpath(stored.header.cwd),await realpath(row.creation.cwd)))throw Error('当前原生绑定身份、预设或目录不匹配')
  const workspaces=this.ctx.workspaceRegistry.list().filter(workspace=>workspace.sessionIds.includes(row.sessionId))
  if(workspaces.length!==1||!same(await realpath(workspaces[0]!.path),await realpath(row.creation.cwd)))throw Error('当前Native工作区归属不匹配')
 }
 preview(){return this.serial(async()=>{const captured=await this.capture(),state=await this.workspace.list();if(captured.profiles.some(row=>state.profiles.some(other=>other.id===row.id)))captured.conflicts.push('目标已存在同身份档案；仅可恢复原有精确接管回执');const plan:Plan={...captured,id:randomUUID(),status:'prepared',createdAt:Date.now()};await this.table().put(plan.id,plan);return this.present(plan)})}
 confirm(input:{id:string;digest:string;confirmed:boolean;continueProfileId?:string}){return this.serial(async()=>{
  const plan=this.table().get(input.id) as Plan|undefined
  if(!plan||input.confirmed!==true||input.digest!==plan.digest)throw Error('需要匹配预览的明确确认')
  if(plan.status==='applied')return this.present(plan)
  const learners=plan.profiles.filter(row=>row.kind==='learner'),continueProfileId=input.continueProfileId??(learners.length===1?learners[0]!.id:undefined)
  if(learners.length&&!learners.some(row=>row.id===continueProfileId))throw Error('请明确选择承接后继续的备考档案，不推断旧页面选择')
  if(plan.status!=='prepared')throw Error('接管执行结果未知，保留原数据与回执；不能自动重试')
  const current=await this.capture();if(current.digest!==plan.digest)throw Error('当前来源已变化，请重新预览')
  if(plan.conflicts.length||current.conflicts.length)throw Error('来源存在冲突或未确认状态，未接管')
  const state=await this.workspace.list()
  if(plan.profiles.some(row=>state.profiles.some(other=>other.id===row.id))||plan.views.some(row=>state.views.some(other=>other.id===row.id)))throw Error('目标档案或视图身份冲突')
  const reservedSessions=new Set(plan.bindings.flatMap(row=>[row.sessionId,...row.previousSessionIds]))
  for(const[,binding]of this.workspace.domain.table('bindings').entries())if([binding.sessionId,...binding.previousSessionIds].some(sessionId=>reservedSessions.has(sessionId)))throw Error('原生会话已属于另一个备考档案，未覆盖绑定')
  for(const [name,rows,key]of [['bindings',plan.bindings,(row:any)=>row.key],['grants',plan.grants,(row:any)=>row.id],['teaching',plan.teaching,(row:any)=>row.id]] as const)for(const row of rows)if(this.workspace.domain.table(name).get(key(row)))throw Error('目标元数据已存在，未覆盖')
  await this.table().put(plan.id,{...plan,status:'applying'})
  try{for(const row of plan.bindings)await this.workspace.domain.table('bindings').put(row.key,row);for(const row of plan.grants)await this.workspace.domain.table('grants').put(row.id,row);for(const row of plan.teaching)await this.workspace.domain.table('teaching').put(row.id,row);await this.workspace.change(value=>{value.profiles.push(...plan.profiles);value.views.push(...plan.views);value.lastProfileId=continueProfileId??value.lastProfileId});const applied={...plan,status:'applied' as const,continueProfileId};await this.table().put(plan.id,applied);return this.present(applied)}catch(error){await this.table().put(plan.id,{...plan,status:'unknown'});throw error}
 })}
 async close(){await this.pending}
}
