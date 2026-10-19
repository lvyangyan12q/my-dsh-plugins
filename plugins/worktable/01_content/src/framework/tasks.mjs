import {randomUUID} from 'node:crypto'
import {RoleStore,RoleError} from './roles.mjs'
import {AdmissionGate} from './admission.mjs'
export {RoleStore as TaskStore} from './roles.mjs'
const fail=(code,message)=>{throw new RoleError(code,message)}
const textOf=value=>{if(typeof value!=='string'||!value.trim()||value.length>24000)fail('task-text-invalid','请输入任务，最多24000字。');return value}
/** Durable preparation and submission references. Native DSH owns execution and its full conversation. */
export class TaskDirectory {
 constructor(store,{applications,roles,resources,gate=new AdmissionGate(),native}){Object.assign(this,{store,applications,roles,resources,gate,native})}
 async list(viewId){const context=await this.applications.resolveView(viewId);return (await this.store.snapshot()).tasks?.filter(row=>row.instanceId===context.instance.id).map(row=>this.present(row))??[]}
 present(row){const value=structuredClone(row);if(value.status==='submitting'){value.status='unknown';value.notice='提交结果尚未确认。请查看原生会话；不会自动重发。'}return value}
 async find(id){const row=(await this.store.snapshot()).tasks?.find(row=>row.id===id);if(!row)fail('task-missing','任务记录不存在。');return row}
 prepare(input){return this.gate.run(async()=>{
  const {view,instance,application}=await this.applications.resolveView(input.viewId);if(application.kind!=='deep')fail('deep-required','网页没有任务执行权限。');
  const role=await this.roles.read(instance.id,input.roleId);if(role.unavailable)fail('role-unavailable',role.unavailable.reason);const binding=role.binding;if(binding?.phase!=='ready')fail('role-not-ready','请先在应用角色中创建可用会话。');
  const contexts=await this.resources.captureTaskContexts(input.viewId,input.contexts??[]);
  const row={id:randomUUID(),revision:1,status:'prepared',appId:instance.appId,instanceId:instance.id,instanceRevision:instance.revision,roleId:input.roleId,sessionId:binding.sessionId,bindingRevision:binding.revision,source:{viewId:view.id,viewType:view.type,applicationTitle:application.title},text:textOf(input.text),contexts,createdAt:Date.now()};
  await this.store.change(data=>{data.tasks??=[];data.tasks.push(row);return row});return row
 })}
 edit(id,revision,input){return this.gate.run(async()=>{const row=await this.find(id);if(row.status!=='prepared'||row.revision!==revision)fail('task-changed','任务已更新或发送，请刷新。');const text=textOf(input.text);if(!Array.isArray(input.contexts)||input.contexts.reduce((sum,c)=>sum+(typeof c?.text==='string'?c.text.length:32001),0)>32000||input.contexts.some(c=>!row.contexts.some(old=>old.id===c.id)||typeof c.text!=='string'||c.text.length>16000)||new Set(input.contexts.map(c=>c.id)).size!==input.contexts.length)fail('context-invalid','只能编辑或移除已准备的上下文。');const next={...row,text,contexts:input.contexts.map(c=>({...row.contexts.find(old=>old.id===c.id),text:c.text})),revision:row.revision+1};await this.put(next);return next})}
 discard(id,revision){return this.gate.run(async()=>{const row=await this.find(id);if(row.status!=='prepared'||row.revision!==revision)fail('task-changed','任务已更新或发送。');return this.put({...row,status:'discarded',revision:row.revision+1})})}
 put(row){return this.store.change(data=>{const index=data.tasks.findIndex(saved=>saved.id===row.id),stopRequestedAt=Math.max(data.tasks[index].stopRequestedAt??0,row.stopRequestedAt??0);const next={...row,...(stopRequestedAt?{stopRequestedAt}:{})};data.tasks[index]=next;return next})}
 async validate(row){const context=await this.applications.resolveView(row.source.viewId);if(context.instance.id!==row.instanceId||context.instance.appId!==row.appId||context.instance.revision!==row.instanceRevision)fail('source-changed','来源实例已改变，请重新准备。');await this.roles.resolve(row.instanceId,row.roleId,row.sessionId,row.bindingRevision);const current=await this.resources.captureTaskContexts(row.source.viewId,row.contexts.map(c=>c.reference));if(current.length!==row.contexts.length||current.some((c,index)=>c.fingerprint!==row.contexts[index].fingerprint))fail('context-changed','资料或共享授权已改变，请重新准备任务。')}
 submit(id,revision){return this.gate.run(async()=>{const prepared=await this.find(id);if(prepared.requestId)return this.present(prepared);return this.resources.withTaskLease(prepared.source.viewId,prepared.contexts.map(c=>c.reference),async()=>{
  let row=await this.find(id);if(row.requestId)return this.present(row);if(row.status!=='prepared'||row.revision!==revision)fail('task-changed','任务已更新或放弃，请刷新。');
  await this.validate(row);
  const prompt=[row.text,...row.contexts.map(c=>'资料上下文（用户确认，非额外权限）：'+c.title+'\n'+c.text)].join('\n\n');
  row={...row,revision:row.revision+1,status:'submitting',requestId:randomUUID(),submittedAt:Date.now(),payload:{sessionId:row.sessionId,mode:'queue',content:[{type:'text',text:prompt}]}};
  await this.put(row);
  try{await this.validate(row)}catch(error){return this.put({...row,status:'failed',notice:error.message})}
  try{const result=await this.gate.detached(()=>this.native.prompt({...row.payload,requestId:row.requestId},AbortSignal.timeout(15000)));if(result?.accepted!==true)throw Error('原生未返回准入回执。');await this.native.flush?.();row={...row,status:'accepted',notice:'已进入原生会话。执行结果、问题、审批和轨迹请在原生对话查看。'};return await this.put(row)}
  catch(error){const unknown={...row,status:'unknown',notice:'提交结果未知，请查看原生会话；不会自动重发。',error:String(error.message??error).slice(0,1000)};try{await this.put(unknown)}catch{}return unknown}
 })})}
 async open(id){const row=await this.find(id);if(!row.requestId)fail('not-submitted','此准备任务尚未发送。');return {sessionId:row.sessionId}}
 async stop(id){const row=await this.find(id);if(!row.requestId||!['accepted','unknown','submitting'].includes(row.status))fail('not-submitted','此任务没有准入记录。');await this.native.cancel({sessionId:row.sessionId});await this.put({...row,stopRequestedAt:Date.now()});return {sessionId:row.sessionId,notice:'已请求原生Stop；队列保留，已发生的写入不会回滚。'}}
}
