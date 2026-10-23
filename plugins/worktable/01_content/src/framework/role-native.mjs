import {resolve} from 'node:path'
import {realpathSync} from 'node:fs'
import {reject} from './roles.mjs'
const normalized=path=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path)
const same=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string')return false
 if(normalized(a)===normalized(b))return true
 try{return normalized(realpathSync.native(a))===normalized(realpathSync.native(b))}catch{return false}
}
/** Exact rc.3 public Host interfaces; read-only validation never opens or migrates a Session. */
export function createRoleAuthority(ctx,capabilities){
 const workspace=cwd=>{const row=ctx.workspaceRegistry.list().find(row=>same(row.path,cwd));if(!row)reject('workspace-unavailable','请先在原生DSH登记角色工作目录。');return row}
 const existing=async row=>{
  const stored=await ctx.sessionPersistence.stat(row.sessionId)
  if(!stored)reject('session-missing','角色原生会话缺失，请恢复历史或明确替换。')
  if(stored.header.id!==row.sessionId)reject('native-identity','角色会话身份不匹配。')
  if(stored.formatStatus==='migration-required')reject('session-migration-required','请先在原生DSH完成会话迁移。')
  const projection=await ctx.sessionController.projections({sessionId:row.sessionId},new AbortController().signal)
  if(!projection)reject('session-missing','角色原生会话缺失，请恢复历史或明确替换。')
  if(projection.kind!=='sequenced')reject('session-migration-required','请先在原生DSH完成会话迁移。')
  if(projection.values.agentPreset!==row.presetId)reject('agent-changed','角色原生会话Agent已改变，请明确替换。')
  if(!same(stored.header.cwd,row.creation.cwd))reject('workspace-changed','角色原生会话目录已改变。')
  if(!workspace(row.creation.cwd).sessionIds.includes(row.sessionId))reject('workspace-membership','角色会话不在原生工作区中。')
  return {sessionId:row.sessionId,presetId:row.presetId,cwd:stored.header.cwd,status:'current'}
 }
 return {
  validate:async(definition,appId)=>{workspace(definition.creation.cwd);return capabilities.validateRole(definition,appId)},
  validateExisting:existing,
  validateLegacy:async(row,{allowMissing=false,creation}={})=>{
   if(creation&&!same(creation.cwd,row.creation.cwd))reject('workspace-changed','旧绑定目录与应用声明不同，未改写旧会话目录。')
   if(allowMissing&&!await ctx.sessionPersistence.stat(row.sessionId))return {sessionId:row.sessionId,presetId:row.presetId,cwd:row.creation.cwd,status:'missing'}
   return existing(row)
  },
  validateAttachment:async(definition,sessionId)=>existing({sessionId,presetId:definition.presetId,creation:definition.creation}),
  recoverCreation:async row=>{
   try{await existing(row)}catch(error){if(error.code==='session-missing')reject('creation-unknown','原生创建结果未知，请核对原会话后恢复或明确替换。');throw error}
   await ctx.sessionPersistence.flush();return row.sessionId
  },
  create:async row=>{
   const registered=workspace(row.creation.cwd)
   if(await ctx.sessionPersistence.stat(row.sessionId))reject('native-conflict','预留会话身份已存在，请核对后恢复或明确替换。')
   let value
   try{value=await ctx.sessionController.create({sessionId:row.sessionId,agentPreset:row.presetId,workspaceId:registered.id})}catch{reject('creation-unknown','原生创建结果未知，请核对原会话后恢复或明确替换。')}
   if(value?.sessionId!==row.sessionId||value.agentPreset!==row.presetId)reject('native-identity','原生创建返回了不同身份或Agent，请核对原生会话；未自动重试。')
   await ctx.sessionPersistence.flush()
   await existing(row)
   return value.sessionId
  }
 }
}
