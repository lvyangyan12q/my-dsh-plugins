import {useEffect,useRef,useState} from 'react'
let navigate:((id:string)=>Promise<unknown>)|null=null
export function configureRoleNavigation(open:(id:string)=>Promise<unknown>){navigate=open;return()=>{if(navigate===open)navigate=null}}
export async function openRoleNativeSession(id:string){if(!navigate)throw new Error('原生导航暂不可用。');return navigate(id)}
export async function roleRequest(body:any,signal?:AbortSignal){const response=await fetch('/api/worktable/roles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal});const value=await response.json();if(!response.ok)throw new Error(value.error??'角色操作失败。');return value}
const refOf=(row:any)=>({kind:row.kind,source:row.source,id:row.id,...(row.ownerAppId?{ownerAppId:row.ownerAppId}:{})})
const refKey=(ref:any)=>JSON.stringify([ref?.source,ref?.ownerAppId??null,ref?.id])
/** Read-only until explicit gestures. All editing stays in the resident native composer. */
export function RolePanel({instanceId}:{instanceId:string}){
 const [state,setState]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<Record<string,string>>({})
 const active=useRef(instanceId),generation=useRef(0),abort=useRef<AbortController|null>(null),expanded=useRef(false)
 const alive=useRef(true)
 useEffect(()=>{alive.current=true;active.current=instanceId;setState(null);setSelected({});setError('');setBusy(false);if(expanded.current)void load();return()=>{alive.current=false;generation.current++;abort.current?.abort()}},[instanceId])
 async function load(){const id=instanceId,ticket=++generation.current;abort.current?.abort();const request=new AbortController();abort.current=request;try{const value=await roleRequest({action:'list',instanceId:id},request.signal);if(alive.current&&active.current===id&&ticket===generation.current){setState(value);setError('')}}catch(e:any){if(!request.signal.aborted&&alive.current&&active.current===id)setError(e.message)}}
 async function action(row:any,kind:string,historicalId?:string){const id=instanceId;setBusy(true);setError('');try{
  const candidates=state.capabilities.filter((r:any)=>r.kind==='agent'),agent=candidates.find((r:any)=>refKey(r)===selected[row.id])
  const result=await roleRequest({action:kind,instanceId:id,roleId:row.id,sessionId:row.binding?.sessionId??null,revision:row.binding?.revision??0,...(agent?{agent:refOf(agent)}:{}),...(historicalId?{historicalId}:{})})
  if(!alive.current||active.current!==id)return
  if(kind==='open'||kind==='history'){if(!navigate)throw new Error('原生导航暂不可用。');await navigate(result.sessionId)}
  await load()
 }catch(e:any){if(alive.current&&active.current===id)setError(e.message)}finally{if(alive.current&&active.current===id)setBusy(false)}}
 return <details className="dsh-wt_rolePanel" onToggle={e=>{expanded.current=e.currentTarget.open;if(expanded.current)void load()}}><summary>应用角色</summary>
  <p className="dsh-wt_appHint">同一实例共用角色会话。文字在原生对话编辑，关闭应用视图不会停止任务。</p>
  {state?.roles.length===0&&<p>此应用没有声明角色。</p>}
  {state?.roles.map((row:any)=>{const current=row.binding?.agent??row.agent;const agents=state.capabilities.filter((c:any)=>c.kind==='agent');const value=selected[row.id]??refKey(current);return <div className="dsh-wt_appCard" key={row.id}>
   <strong>{row.title}</strong><small>{row.binding?`${row.binding.phase==='ready'?'已关联':'待重试'} · ${row.binding.sessionId}`:'尚未创建会话'}</small>
   <label>Agent<select value={value} disabled={busy} onChange={e=>setSelected(s=>({...s,[row.id]:e.target.value}))}>{!agents.some((r:any)=>refKey(r)===value)&&<option value={value}>当前Agent不可用</option>}{agents.map((agent:any)=><option value={refKey(agent)} key={refKey(agent)} disabled={!agent.enabled||!agent.userInvocable||!!agent.unavailable}>{agent.title} · {agent.source==='managed'?'公共':'应用私有'}{!agent.enabled?'（已停用）':''}</option>)}</select></label>
   {row.unavailable&&<p role="status">{row.unavailable.reason}</p>}
   <div className="dsh-wt_appLine">
    {!row.binding&&<button disabled={busy} onClick={()=>action(row,'ensure')}>创建角色会话</button>}
    {row.binding?.phase==='ready'&&<button disabled={busy||!!row.unavailable} onClick={()=>action(row,'open')}>打开原生对话</button>}
    {row.binding?.phase==='intent'&&<button disabled={busy} onClick={()=>action(row,'retry')}>重试原创建</button>}
    {row.binding&&<button disabled={busy} onClick={()=>{if(window.confirm('为此角色创建替代会话？旧会话将保留为历史，不停止已有任务。'))void action(row,'replace')}}>明确替换会话</button>}
   </div>
   {!!row.binding?.previousSessionIds.length&&<details><summary>保留历史</summary>{row.binding.previousSessionIds.map((id:string)=><button key={id} disabled={busy} onClick={()=>action(row,'history',id)}>{id}</button>)}</details>}
  </div>})}
  {error&&<p role="alert">{error}</p>}
  <button disabled={busy} onClick={()=>load()}>刷新角色</button>
 </details>
}
const blank={kind:'agent',id:'',title:'',description:'',content:'',enabled:true,userInvocable:true,modelInvocable:true,skillIds:[],baseComposition:'',revision:0}
export function CapabilityManager(){
 const [rows,setRows]=useState<any[]>([]),[form,setForm]=useState<any>(blank),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 async function load(){try{const rows=await roleRequest({action:'capabilities'});if(alive.current)setRows(rows)}catch(e:any){if(alive.current)setError(e.message)}}
 async function save(){setBusy(true);setError('');try{await roleRequest({action:'capability-save',capability:form,revision:form.revision});if(alive.current){setForm(blank);await load()}}catch(e:any){if(alive.current)setError(e.message)}finally{if(alive.current)setBusy(false)}}
 return <details onToggle={e=>{if(e.currentTarget.open)void load()}}><summary>Agent / Skills 管理</summary><p className="dsh-wt_appHint">此处建立的能力可供应用复用。应用私有能力由所属应用维护。</p>
  {rows.length===0&&<p>还没有通过管理入口建立公共能力。</p>}
  {rows.map(row=><div key={row.kind+row.id}><button onClick={()=>setForm(row)}>{row.kind==='agent'?'Agent':'Skill'} · {row.title}{!row.enabled?'（已停用）':''}</button>{row.unavailable&&<p role="status">{row.unavailable.reason}</p>}</div>)}
  <form className="dsh-wt_appForm" onSubmit={e=>{e.preventDefault();void save()}}>
   <label>类型<select value={form.kind} disabled={form.revision>0} onChange={e=>setForm({...blank,kind:e.target.value})}><option value="agent">Agent</option><option value="skill">Skill</option></select></label>
   <label>标识<input required pattern="[a-z][a-z0-9.-]{0,79}" value={form.id} disabled={form.revision>0} onChange={e=>setForm({...form,id:e.target.value})}/></label>
   <label>名称<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
   {form.kind==='agent'&&<label>基础能力<select required value={form.baseComposition??''} onChange={e=>setForm({...form,baseComposition:e.target.value})}><option value="">请选择基础能力</option><option value="workspace-basic-v1">文件读写、检索、提问与Skill（原生权限/审批）</option></select></label>}
   <label>{form.kind==='agent'?'Agent指令':'Skill内容'}<textarea required value={form.content} onChange={e=>setForm({...form,content:e.target.value})}/></label>
   {form.kind==='agent'&&rows.filter(r=>r.kind==='skill').map(skill=><label key={skill.id}><input type="checkbox" checked={form.skillIds.includes(skill.id)} onChange={e=>setForm({...form,skillIds:e.target.checked?[...form.skillIds,skill.id]:form.skillIds.filter((id:string)=>id!==skill.id)})}/>{skill.title}</label>)}
   {(['enabled','userInvocable','modelInvocable'] as const).map((name,i)=><label key={name}><input type="checkbox" checked={form[name]} onChange={e=>setForm({...form,[name]:e.target.checked})}/>{['启用','允许用户调用','允许模型调用'][i]}</label>)}
   <button type="submit" disabled={busy}>{form.revision?'保存修改':'建立公共能力'}</button><button type="button" onClick={()=>setForm(blank)}>新建</button>
  </form>{error&&<p role="alert">{error}</p>}
 </details>
}
/** Trusted app components receive an instance-bound facade, never arbitrary Host/native context. */
export function createRoleFacade(instanceId:string){
 const call=(action:string,roleId:string,extra:any={})=>roleRequest({...extra,action,instanceId,roleId})
 return Object.freeze({
  read:(roleId:string)=>call('read',roleId),
  ensure:(roleId:string,agent?:any)=>call('ensure',roleId,{agent}),
  retry:(roleId:string,sessionId:string,revision:number)=>call('retry',roleId,{sessionId,revision}),
  replace:(roleId:string,sessionId:string,revision:number,agent?:any)=>call('replace',roleId,{sessionId,revision,agent}),
  open:async(roleId:string,sessionId:string,revision:number)=>{const result=await call('open',roleId,{sessionId,revision});if(!navigate)throw new Error('原生导航暂不可用。');await navigate(result.sessionId)},
 })
}
