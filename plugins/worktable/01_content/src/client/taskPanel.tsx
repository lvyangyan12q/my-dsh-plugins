import {describeNativeTaskState} from './sessionCompat'
import {useEffect,useRef,useState} from 'react'
import {roleRequest,openRoleNativeSession} from './rolePanel'
let facts:(id:string)=>any=()=>null
export function configureTaskFacts(read:(id:string)=>any){facts=read;return()=>{if(facts===read)facts=()=>null}}
const signals=new Set<(viewId:string)=>void>()
export async function taskRequest(body:any,signal?:AbortSignal){const response=await fetch('/api/worktable/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal});const value=await response.json();if(!response.ok)throw new Error(value.error??'任务操作失败。');return value}
export function createTaskFacade(viewId:string){return Object.freeze({prepare:async(input:{roleId:string;text:string;contexts?:any[]})=>{const row=await taskRequest({action:'prepare',viewId,roleId:input.roleId,text:input.text,contexts:input.contexts??[]});for(const signal of signals)signal(viewId);return row}})}
const labelOf=(row:any)=>({prepared:'准备中（未发送）',accepted:'原生已接纳',unknown:'提交结果未知',failed:'准入前失败',discarded:'已放弃'} as any)[row.status]??'请查看原生记录'
/** This is task preparation, never a second native conversation composer. */
export function TaskPanel({viewId,instanceId}:{viewId:string;instanceId:string}){
 const [expanded,setExpanded]=useState(false),[rows,setRows]=useState<any[]>([]),[roles,setRoles]=useState<any[]>([]),[roleId,setRoleId]=useState(''),[text,setText]=useState(''),[editing,setEditing]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[,tick]=useState(0)
 const identity=useRef({viewId});if(identity.current.viewId!==viewId)identity.current={viewId};
 const active=useRef(true),epoch=useRef(0),request=useRef<AbortController|null>(null)
 useEffect(()=>{active.current=true;const signal=(id:string)=>{if(id===viewId){setExpanded(true);void load()}};signals.add(signal);return()=>{active.current=false;epoch.current++;request.current?.abort();signals.delete(signal)}},[viewId])
 useEffect(()=>{if(!expanded)return;void load();const timer=setInterval(()=>tick(x=>x+1),1500);return()=>clearInterval(timer)},[expanded,viewId])
 async function load(){const generation=++epoch.current;request.current?.abort();const controller=request.current=new AbortController();try{const [tasks,rs]=await Promise.all([taskRequest({action:'list',viewId},controller.signal),roleRequest({action:'list',instanceId},controller.signal)]);if(active.current&&generation===epoch.current){setRows(tasks);setRoles(rs.roles);setRoleId(current=>current||rs.roles[0]?.id||'')}}catch(e:any){if(active.current&&!controller.signal.aborted)setError(e.message)}}
 async function action(kind:string,row?:any){const owner=identity.current;setBusy(true);setError('');setNotice('');try{const value=await taskRequest({action:kind,viewId,...(row?{id:row.id,revision:row.revision}:{}),...(kind==='prepare'?{roleId,text,contexts:[]}:{}),...(kind==='edit'?{text:editing.text,contexts:editing.contexts.map((c:any)=>({id:c.id,text:c.text}))}:{})});if(!active.current||identity.current!==owner)return;
  if(kind==='open')await openRoleNativeSession(value.sessionId);
  if(kind==='prepare'){setText('');setEditing(value)}
  if(kind==='edit'||kind==='discard'||kind==='submit')setEditing(null);
  if(value.notice)setNotice(value.notice);await load()
 }catch(e:any){if(active.current&&identity.current===owner)setError(e.message)}finally{if(active.current&&identity.current===owner)setBusy(false)}}
 return <details className="dsh-wt_taskPanel" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>AI 任务</summary>
  <p className="dsh-wt_appHint">先准备和确认资料，再显式发送。对话、工具轨迹、问题与审批沿用旁边的原生对话。</p>
  <p>实例 {instanceId.slice(0,8)} · 来源视图 {viewId.slice(0,8)}</p>
  <form className="dsh-wt_appForm" onSubmit={event=>{event.preventDefault();void action('prepare')}}>
   <label>任务角色<select value={roleId} onChange={event=>setRoleId(event.target.value)} disabled={busy}>{!roles.length&&<option value="">请先创建应用角色</option>}{roles.map(role=><option key={role.id} value={role.id}>{role.title}</option>)}</select></label>
   <label>准备新任务<textarea aria-label="准备任务正文" maxLength={24000} value={text} onChange={event=>setText(event.target.value)}/></label>
   <button type="submit" disabled={busy||!roleId||!text.trim()}>准备任务（不发送）</button>
  </form>
  {[...rows].reverse().map(row=>{const native=facts(row.sessionId);return <article className="dsh-wt_appCard" key={row.id}>
   <strong>{roles.find(role=>role.id===row.roleId)?.title??row.roleId} · {labelOf(row)}</strong><small>来源 {row.source.viewType} · {row.source.viewId.slice(0,8)} · 会话 {row.sessionId.slice(0,8)}</small>
   <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.text}</p>
   {row.contexts.map((context:any)=><details key={context.id}><summary>{context.title} · {context.metadata.ownerInstanceId.slice(0,8)}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{context.text}</pre></details>)}
   {row.requestId&&<p role="status">{describeNativeTaskState(native,row.stopRequestedAt).label}{native?.completionUnread?' · 有未读结束提示':''}{row.stopRequestedAt?' · 已请求Stop（保留队列）':''}</p>}
   {row.notice&&<p>{row.notice}</p>}{row.requestId&&<p className="dsh-wt_appHint">Stop作用于此原生会话的当前回合，保留排队消息，不回滚已发生的写入。</p>}
   <div className="dsh-wt_appLine">{row.status==='prepared'?<><button disabled={busy} onClick={()=>setEditing(structuredClone(row))}>编辑准备任务</button><button disabled={busy} onClick={()=>action('discard',row)}>放弃</button><button disabled={busy||editing?.id===row.id} onClick={()=>action('submit',row)}>确认发送到原生会话</button></>:row.requestId&&<><button disabled={busy} onClick={()=>action('open',row)}>查看原生对话与轨迹</button>{['accepted','unknown'].includes(row.status)&&<button disabled={busy} onClick={()=>action('stop',row)}>Stop 此原生会话</button>}</>}</div>
  </article>})}
  {editing&&<form className="dsh-wt_appForm" onSubmit={event=>{event.preventDefault();void action('edit',editing)}}><strong>编辑准备内容（尚未发送）</strong><label>任务正文<textarea aria-label="编辑任务正文" value={editing.text} maxLength={24000} onChange={event=>setEditing({...editing,text:event.target.value})}/></label>{editing.contexts.map((context:any)=><div key={context.id}><label>{context.title}<textarea aria-label={'编辑上下文 '+context.title} maxLength={16000} value={context.text} onChange={event=>setEditing({...editing,contexts:editing.contexts.map((c:any)=>c.id===context.id?{...c,text:event.target.value}:c)})}/></label><button type="button" onClick={()=>setEditing({...editing,contexts:editing.contexts.filter((c:any)=>c.id!==context.id)})}>移除此上下文</button></div>)}<div className="dsh-wt_appLine"><button type="submit" disabled={busy}>保存准备内容</button><button type="button" disabled={busy} onClick={()=>setEditing(null)}>取消编辑</button></div></form>}
  <button disabled={busy} onClick={()=>load()}>刷新任务状态</button>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </details>
}
