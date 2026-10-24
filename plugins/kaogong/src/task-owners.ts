import {createHash} from 'node:crypto'
import type {ApplicationOwnedTask, ApplicationTaskContext, ApplicationTaskOwner, ApplicationTaskOwners, ResourceDirectory} from 'dsh-worktable/sdk'
import type {KvTable} from '@deepseek-ai/dsh-storage-domain'
import type {KaogongHost} from './instance-host.ts'
import type {KaogongInstanceState} from './instance-state.ts'
import {TAXONOMY} from './taxonomy.ts'
import {subjectRoleIds} from './role-definitions.ts'
export type TaskReceipt = {instanceId:string;businessId:string;kind:'review'|'lesson';requestId:string;status:'claimed'|'done'}
const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
function evidence(state:KaogongInstanceState,kind:'review'|'lesson',id:string){
 if(kind==='lesson'){
  const row=state.lessonRecords.get(id);if(!row||row.instanceId!==state.instanceId)throw Error('Lesson unavailable')
  const {binding,revision,updatedAt,...content}=row
  return {content,subject:row.request.subject,materialIds:row.request.materialIds}
 }
 const row=state.rounds.get(id);if(!row?.score)throw Error('Review requires a submitted round')
 const {review,...content}=row
 return {content,subject:row.context.subject,materialIds:[] as string[]}
}
function payloadId(kind:'review'|'lesson',payload:unknown){const key=kind==='review'?'roundId':'lessonId';if(!payload||typeof payload!=='object'||Object.keys(payload).length!==1||typeof (payload as Record<string,unknown>)[key]!=='string')throw Error('Select an existing business record');return (payload as Record<string,string>)[key]!}
/** Claims precede native admission; only a known persisted native receipt finalizes business state. */
export function registerTaskOwners(host:KaogongHost, owners:ApplicationTaskOwners, receipts:KvTable<string,TaskReceipt>, resources:ResourceDirectory){
 const disposers:(()=>void|Promise<void>)[]=[]
 for(const kind of ['review','lesson'] as const){
  const load=(task:ApplicationOwnedTask)=>host.state(task.instanceId,async state=>{const value=evidence(state,kind,task.preparation.id);const token=task.preparation.token as {fingerprint?:string};if(token?.fingerprint!==fingerprint(value))throw Error('Business evidence changed; prepare again');return value})
  const owner:ApplicationTaskOwner={version:'1',
   prepare:(context:ApplicationTaskContext,payload)=>host.state(context.instanceId,async state=>{
    const id=payloadId(kind,payload),value=evidence(state,kind,id)
    const role=kind==='review'?'counselor':subjectRoleIds[TAXONOMY.findIndex(row=>row.subject===value.subject)]??'teacher'
    if(context.roleId!==role)throw Error('Teaching role does not match the source subject')
    if(kind==='review'&&state.rounds.get(id)?.review!=='ready')throw Error('Review already sent or admission uncertain; inspect its native Session')
    // A single materials reference preserves source/grant validation for every chosen material.
    const contexts=value.materialIds.length?[{resourceId:'teaching',selection:{kind:'materials',ids:value.materialIds}}]:[]
    if(contexts.length)await resources.call({viewId:context.viewId,resourceId:'teaching',action:'read'})
    return {id,text:`/kaogong-teach ${kind==='review'?'讲评本轮真实提交结果，不重复提交成绩、不自动打卡。':'继续已保存课堂，不自动宣布完成。'}\n以下是应用核验的数据：\n${JSON.stringify(value.content)}`,contexts,token:{fingerprint:fingerprint(value)}}
   }),
   validate:async task=>{await load(task)},
   beforeSubmit:async task=>host.state(task.instanceId,async state=>{
    await load(task);if(!task.requestId)throw Error('Native admission intent required')
    const previous=receipts.get(task.id)
    if(previous&&(previous.instanceId!==task.instanceId||previous.requestId!==task.requestId))throw Error('Task receipt identity changed')
    if(!previous)await receipts.put(task.id,{instanceId:task.instanceId,businessId:task.preparation.id,kind,requestId:task.requestId,status:'claimed'})
    if(kind==='review')await state.practice.review(task.preparation.id,'claim')
    else await state.lessons.prepare(task.preparation.id)
   }),
   accepted:async task=>host.state(task.instanceId,async state=>{
    const receipt=receipts.get(task.id)
    if(!receipt||receipt.instanceId!==task.instanceId||receipt.businessId!==task.preparation.id||receipt.requestId!==task.requestId||receipt.kind!==kind)throw Error('Application claim receipt unavailable')
    if(receipt.status==='done')return
    if(kind==='review')await state.practice.review(task.preparation.id,'complete')
    await receipts.put(task.id,{...receipt,status:'done'})
   }),
  }
  disposers.push(owners.contribute('kaogong',kind,owner))
 }
 return async()=>{for(const remove of disposers.reverse())await remove()}
}
