import {useEffect,useState} from 'react'
import {resourceRequest,notifyReading,type DataConnection} from './reading-data-client.ts'
type Instance = {id:string;appId:string;projectId:string|null}
export function ReadingSharing({instanceId,viewId}:{instanceId:string;viewId:string}) {
  const [instances,setInstances]=useState<Instance[]>([]),[connections,setConnections]=useState<DataConnection[]>([]),[target,setTarget]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  async function load(signal?:AbortSignal){
    const [references,response]=await Promise.all([resourceRequest({operation:'snapshot'},signal),fetch('/api/worktable/applications',{credentials:'same-origin',signal})])
    const apps=await response.json();if(!response.ok)throw Error(apps.error??'应用目录不可用')
    if(!signal?.aborted){setConnections(references.connections);setInstances(apps.instances.filter((row:Instance)=>row.appId==='reading-statistics'))}
  }
  useEffect(()=>{const controller=new AbortController();void load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(String(e))});return()=>controller.abort()},[instanceId,viewId])
  async function manage(body:Record<string,unknown>){setBusy(true);setError('');try{await resourceRequest(body);await load();notifyReading()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  const incoming=connections.filter(row=>row.consumerInstanceId===instanceId).at(-1)
  return <details><summary>资料共享</summary><div style={{display:'grid',gap:8}}>
    <p>仅引用所属实例资料，不复制整库。默认只读；撤销阻止后续访问，已发送的AI历史保留。</p>
    {incoming&&<p role="status">当前引用：{incoming.ownerInstanceId} · {incoming.status==='active'?'共享中':'已撤销'}</p>}
    {error&&<p role="alert">{error}</p>}
    <label>共享给阅读实例<select aria-label="共享给阅读实例" value={target} onChange={e=>setTarget(e.target.value)}><option value="">选择目标实例</option>{instances.filter(row=>row.id!==instanceId).map(row=><option key={row.id} value={row.id}>{row.projectId??'未归属'} · {row.id.slice(0,8)}</option>)}</select></label>
    <button disabled={busy||!target||incoming?.status==='active'} onClick={()=>void manage({operation:'share',ownerViewId:viewId,consumerInstanceId:target,resourceId:'reading-records'})}>确认只读共享</button>
    {connections.filter(row=>row.ownerInstanceId===instanceId).map(row=><div key={row.id}><span>目标 {row.consumerInstanceId.slice(0,8)} · {row.status==='active'?(row.allowedActions.includes('update')?'允许编辑':'只读'):'已撤销'}</span>{row.status==='active'&&<><button disabled={busy} onClick={()=>void manage({operation:'permissions',id:row.id,revision:row.revision,allowedActions:row.allowedActions.includes('update')?['read']:['read','create','update','delete']})}>{row.allowedActions.includes('update')?'改为只读':'允许新增、编辑、删除'}</button><button disabled={busy} onClick={()=>void manage({operation:'revoke',id:row.id,revision:row.revision})}>撤销共享</button></>}</div>)}
    <button disabled={busy} onClick={()=>{setBusy(true);void load().then(()=>notifyReading()).catch(e=>setError(String(e))).finally(()=>setBusy(false))}}>刷新共享状态</button>
  </div></details>
}
