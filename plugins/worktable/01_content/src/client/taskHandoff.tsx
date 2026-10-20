import{useEffect,useRef,useState}from'react'
import{taskRequest}from'./taskPanel'
import{openRoleNativeSession}from'./rolePanel'
/** Durable profile references only; no app definition, capability resolution or native composer. */
export function TaskHandoff(){
 const[state,setState]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const ticket=useRef(0),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;ticket.current++}},[])
 async function load(){const own=++ticket.current;try{const value=await taskRequest({action:'handoff'});if(own===ticket.current){setState(value);setError('')}}catch(e:any){if(own===ticket.current)setError(e.message)}}
 async function control(action:string,id:string){setBusy(true);setError('');try{const value=await taskRequest({action,id});if(!alive.current)return;if(action==='handoff-open')await openRoleNativeSession(value.sessionId);else setError(value.notice??'已请求Stop')}catch(e:any){if(alive.current)setError(e.message)}finally{if(alive.current)setBusy(false)}}
 const sessions=new Map<string,any>();for(const row of state?.roles??[])for(const sessionId of[row.sessionId,...row.previousSessionIds])sessions.set(sessionId,{...row,sessionId});for(const row of state?.tasks??[])if(row.requestId)sessions.set(row.sessionId,row)
 return <details onToggle={event=>{if(event.currentTarget.open)void load()}}><summary>原生会话交接 / 卸载准备</summary><p>停用不停止原生任务。卸载前请打开相关原生会话，处理问题、审批和运行任务；也可直接从 DSH 原生会话列表继续。</p><p>原生插件管理不提供应用任务卸载否决接口。直接卸载工作台后，本入口消失；原生会话保留。此清单不代表任务已结束或已完成交接。</p>{[...sessions.values()].map(row=><div className="dsh-wt_appCard" key={row.sessionId}><strong>{row.appId} · {row.roleId}</strong><small>实例 {row.instanceId} · 原生会话 {row.sessionId}</small><div className="dsh-wt_appLine"><button disabled={busy} onClick={()=>void control('handoff-open',row.sessionId)}>打开原生对话与轨迹</button><button disabled={busy} onClick={()=>void control('handoff-stop',row.sessionId)}>Stop 此原生会话</button></div></div>)}{state&&sessions.size===0&&<p>没有已保存的原生会话引用。</p>}<p>Stop仅作用于当前回合，保留排队消息，不回滚已有写入。</p><button disabled={busy} onClick={()=>void load()}>刷新交接清单</button>{error&&<p role="status">{error}</p>}</details>
}
