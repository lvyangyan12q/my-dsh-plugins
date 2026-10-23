import type {Context,Volatile} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import type {ApplicationDefinition,RoleDefinition,Disposer} from 'dsh-worktable/sdk'
import {requireProtocol} from 'dsh-worktable/sdk'
import schema from '@deepseek-ai/schemastery'
import {isAbsolute} from 'node:path'
import {installNotes} from './notes-host.ts'
import {installNoteCapabilities,privateSkillId} from './notes-capabilities.ts'
export const name='project-notes'
export const inject:string[]=[]
export interface Config {settingsVersion:number;managedAgentId:string|Volatile<string>;managedSkillId:string|Volatile<string>;roleWorkspace:string|Volatile<string>}
export const Config:schema<{settingsVersion?:number;managedAgentId?:string;managedSkillId?:string;roleWorkspace?:string},Config>=schema.object({settingsVersion:schema.number().default(1),managedAgentId:schema.string().pattern(/^(?:[a-z][a-z0-9.-]{0,79})?$/).default('').volatile(),managedSkillId:schema.string().pattern(/^(?:[a-z][a-z0-9.-]{0,79})?$/).default('').volatile(),roleWorkspace:schema.string().pattern(/^(?:$|[a-zA-Z]:[\\/]|\/)/).default('').volatile()})
export const application:ApplicationDefinition={id:'project-notes',title:'项目便签',version:'0.2.2-rc.3.1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'完整便签页'},{id:'summary',title:'便签摘要'}]}
export function notesRole(input:Omit<Config,'settingsVersion'>):RoleDefinition|undefined{
 const get=(value:string|Volatile<string>)=>typeof value==='string'?value:value.get();const config={managedAgentId:get(input.managedAgentId),managedSkillId:get(input.managedSkillId),roleWorkspace:get(input.roleWorkspace)}
 if(!config.managedAgentId||!config.managedSkillId||!config.roleWorkspace)return
 if(!/^[a-z][a-z0-9.-]{0,79}$/.test(config.managedAgentId)||!/^[a-z][a-z0-9.-]{0,79}$/.test(config.managedSkillId)||!isAbsolute(config.roleWorkspace))throw new Error('请填写精确公共能力ID及原生已登记工作区的绝对路径。')
 return {id:'assistant',title:'便签整理助手',agent:{kind:'agent',source:'managed',id:config.managedAgentId},creation:{cwd:config.roleWorkspace},skills:[{kind:'skill',source:'managed',id:config.managedSkillId},{kind:'skill',source:'application',ownerAppId:'project-notes',id:privateSkillId}]}
}
export function apply(ctx:Context,config:Config){
 if(config.settingsVersion!==1)throw new Error('不支持此便签配置版本，原有业务记录保留。')
 ctx.inject(['settings'],child=>child.effect(()=>(child as unknown as {settings:{configure(policy:{auto:boolean},owner:Context['fiber']):()=>void}}).settings.configure({auto:false},ctx.fiber),'project notes native configuration policy'))
 let role=notesRole(config),roleContributed=false
 ctx.inject(['worktableApplications','worktableProtocol'],child=>child.effect(async function*(){requireProtocol(child.worktableProtocol.describe(),['application-registration-v1']);const remove=await child.worktableApplications.contribute(application);yield remove},'project notes application'))
 ctx.inject(['storageDomain','worktableResources','worktableProtocol'],child=>child.effect(async function*(){
  requireProtocol(child.worktableProtocol.describe(),['resource-reference-v1','prepared-task-v1']);const owner=await installNotes(child,()=>({configured:roleContributed,skillIds:role?[role.skills![0]!.id]:[]}));let remove:Disposer|undefined
  try{remove=child.worktableResources.register(owner.resource)}catch(error){try{await owner.dispose()}catch(cleanup){throw new AggregateError([error,cleanup],'便签启动及清理均失败。')}throw error}
  yield async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>remove?.()),owner.dispose()]);const errors=results.filter(r=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>(r as PromiseRejectedResult).reason),'便签资源释放失败；其余清理已尝试。')}
 },'project notes owned data'))
 ctx.inject(['worktableCapabilities','worktableRoles','skills','worktableProtocol'],child=>child.effect(async function*(){
  requireProtocol(child.worktableProtocol.describe(),['application-private-capability-v1','instance-role-v1']);const removeCapabilities=installNoteCapabilities(child);let removeRole:Disposer|undefined
  let updates=Promise.resolve(),closing=false;const refresh=()=>{const next=notesRole(config);updates=updates.catch(()=>{}).then(async()=>{roleContributed=false;await removeRole?.();removeRole=undefined;role=next;if(!closing&&role){removeRole=child.worktableRoles.contribute('project-notes',[role]);roleContributed=true}});return updates};
  try{await refresh()}catch(error){try{await removeCapabilities()}catch(cleanup){throw new AggregateError([error,cleanup],'便签角色启动及能力清理均失败。')}throw error}
  const releaseUpdates=(ctx as unknown as {on(name:'loader/volatile-update',listener:()=>void):()=>void}).on('loader/volatile-update',()=>{void refresh().catch(error=>{roleContributed=false;console.error('Project Notes角色配置未应用：',error)})});
  yield async()=>{closing=true;releaseUpdates();await updates.catch(()=>{});roleContributed=false;const results=await Promise.allSettled([Promise.resolve().then(()=>removeRole?.()),removeCapabilities()]);const errors=results.filter(r=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>(r as PromiseRejectedResult).reason),'便签角色能力释放失败。')}
 },'project notes role and private skill'))
}
