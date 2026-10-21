import React,{useEffect,useRef,useState} from 'react'
/** Optional managed-owner upgrade controls. Opening never adopts or executes. */
export function MigrationPanel({viewId}:{viewId:string}){
 const [expanded,setExpanded]=useState(false),[state,setState]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ack,setAck]=useState(false),[irreversible,setIrreversible]=useState(false)
 const identity=useRef(viewId),epoch=useRef(0),request=useRef<AbortController|null>(null)
 identity.current=viewId
 useEffect(()=>{setState(null);setAck(false);setIrreversible(false);setError('');return()=>{epoch.current++;request.current?.abort()}},[viewId])
 async function send(body:any,signal?:AbortSignal){const response=await fetch('/api/worktable/migrations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});const value=await response.json();if(!response.ok)throw Error(value.error||value.message||'升级检查失败。');return value}
 async function load(){const own=viewId,generation=++epoch.current;request.current?.abort();const controller=request.current=new AbortController();try{const value=await send({action:'get',viewId},controller.signal);if(identity.current===own&&generation===epoch.current){setState(value);setAck(false);setIrreversible(false);setError('')}}catch(e:any){if(!controller.signal.aborted&&identity.current===own)setError(e.message)}}
 useEffect(()=>{if(expanded)void load()},[expanded,viewId])
 async function action(kind:string,plan?:any){const own=viewId;setBusy(true);setError('');try{await send({action:kind,viewId,...(plan?{id:plan.id,revision:plan.revision}:{}),...(kind==='adopt'?{applicationVersion:state.applicationVersion,dataVersion:state.inspection.dataVersion,dataRevision:state.inspection.revision}:{}),...(kind==='recover'?{dataRevision:state.inspection.revision}:{}),confirmed:ack,irreversibleConfirmed:irreversible});if(identity.current===own)await load()}catch(e:any){if(identity.current===own){setError(e.message);await load();setError(e.message)}}finally{if(identity.current===own)setBusy(false)}}
 const active=state?.plans?.find((row:any)=>!['applied','recovered','discarded'].includes(row.status))
 return <details className="dsh-wt_taskPanel" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>升级与恢复</summary>
 {expanded&&<><p>平台管理升级合同，业务迁移由应用所有者执行。不可逆操作不承诺自动回滚。</p><p>确认前请了解：任一受管实例未就绪时，整个应用各项目的新建、角色、任务及平台资料访问会暂停；历史原生会话仍可打开与 Stop。单实例确认或迁移不认证其他未确认实例。</p><button type="button" disabled={busy} onClick={()=>void load()}>重新检查</button>{error&&<p role="alert">{error}</p>}
 {state&&<><p>声明版本 {state.applicationVersion} · 资料版本 {state.inspection?.dataVersion||'未核验'} · revision {state.inspection?.revision||'未知'}</p><p>状态：{state.status}</p>
 {!state.managed&&<><p>该应用尚未接入已确认的受管链；保留既有行为，不表示只读或已受升级保护。确认基线只登记元数据，不迁移资料。</p>{state.inspection&&<><label><input type="checkbox" aria-label="确认当前声明基线" checked={ack} onChange={event=>setAck(event.target.checked)}/>确认以上当前声明与资料检查</label><button type="button" disabled={busy||!ack} onClick={()=>void action('adopt')}>确认当前基线（不迁移资料）</button></>}</>}
 {state.managed&&!active&&<button type="button" disabled={busy||!state.inspection} onClick={()=>void action('prepare')}>准备迁移计划（不执行）</button>}
 {active&&<section><p>应用 {active.fromApplicationVersion} → {active.toApplicationVersion} · 资料 {active.fromDataVersion} → {active.toDataVersion} · 计划 revision {active.revision} · 来源资料 revision {active.dataRevision}</p><p>影响：{active.impact}</p><p>恢复入口：{active.recovery}</p>{active.notice&&<p role="alert">{active.notice}</p>}{active.irreversible&&<p>包含不可逆影响；恢复入口不等于自动回滚。</p>}
 <label><input type="checkbox" aria-label="确认迁移影响" checked={ack} onChange={event=>setAck(event.target.checked)}/>确认当前计划、影响与恢复说明</label>{active.irreversible&&<label><input type="checkbox" aria-label="确认不可逆影响" checked={irreversible} onChange={event=>setIrreversible(event.target.checked)}/>单独确认不可逆影响</label>}
 {active.status==='prepared'?<><button type="button" disabled={busy||!ack||(active.irreversible&&!irreversible)} onClick={()=>void action('confirm',active)}>确认执行迁移</button><button type="button" disabled={busy} onClick={()=>void action('discard',active)}>放弃未执行计划</button></>:<><p>结果未确认，新实例、角色、任务及平台资料访问已阻止。原生历史查看与停止仍可使用。</p><button type="button" disabled={busy||!ack||!state.inspection||!state.recoveryAvailable||(active.irreversible&&!irreversible)} onClick={()=>void action('recover',active)}>确认由所属应用恢复</button></>}
 </section>}</>}
 </>}
 </details>
}
