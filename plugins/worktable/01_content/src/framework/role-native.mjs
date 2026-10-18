import {resolve} from 'node:path'
import {reject} from './roles.mjs'
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&(process.platform==='win32'?resolve(a).toLowerCase()===resolve(b).toLowerCase():resolve(a)===resolve(b))
/** Exact 0.2.0-rc.2 public Host interfaces. No private Agent fields or client create extensions. */
export function createRoleAuthority(ctx,capabilities){
 const workspace=cwd=>{const row=ctx.workspaceRegistry.list().find(row=>same(row.path,cwd));if(!row)reject('workspace-unavailable','请先在原生DSH登记角色工作目录。');return row}
 const existing=async row=>{const projection=await ctx.sessionController.projections({sessionId:row.sessionId},new AbortController().signal);if(!projection)reject('session-missing','角色原生会话缺失，请恢复历史或明确替换。');if(projection.values.agentPreset!==row.presetId)reject('agent-changed','角色原生会话Agent已改变，请明确替换。');const inspection=await ctx.sessionController.inspect(row.sessionId);if(!same(inspection?.meta.cwd,row.creation.cwd))reject('workspace-changed','角色原生会话目录已改变。');const registered=workspace(row.creation.cwd);if(!registered.sessionIds.includes(row.sessionId))reject('workspace-membership','角色会话不在原生工作区中。')}
 return {validate:async(definition,appId)=>{workspace(definition.creation.cwd);return capabilities.validateRole(definition,appId)},validateExisting:existing,
 validateAttachment:async(definition,sessionId)=>existing({sessionId,presetId:definition.presetId,creation:definition.creation}),
 create:async row=>{const registered=workspace(row.creation.cwd);const value=await ctx.sessionController.create({sessionId:row.sessionId,agentPreset:row.presetId,workspaceId:registered.id});if(value.sessionId!==row.sessionId||value.agentPreset!==row.presetId)reject('native-identity','原生角色会话身份或Agent不匹配。');await ctx.sessionPersistence.flush();return value.sessionId}}
}
