import {useEffect,useRef,useState} from 'react'
import {resourceRequest,notifyReading,type DataConnection} from './reading-data-client.ts'
type Scope = {key:string;controller?:AbortController}
type Instance = {id:string;appId:string;projectId:string|null}
export function ReadingSharing({instanceId,viewId}:{instanceId:string;viewId:string}) {
  const [instances,setInstances]=useState<Instance[]>([]),[connections,setConnections]=useState<DataConnection[]>([]),[target,setTarget]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const key=instanceId+':'+viewId,scope=useRef<Scope>({key})
  if(scope.current.key!==key){scope.current.controller?.abort();scope.current={key}}
  const active=(token:Scope)=>scope.current===token&&!!token.controller&&!token.controller.signal.aborted
  async function load(token:Scope){
    const signal=token.controller!.signal
    const [references,response]=await Promise.all([resourceRequest({operation:'snapshot'},signal),fetch('/api/worktable/applications',{credentials:'same-origin',signal})])
    const apps=await response.json();if(!response.ok)throw Error(apps.error??'应用目录不可用')
    if(active(token)){setConnections(references.connections);setInstances(apps.instances.filter((row:Instance)=>row.appId==='reading-statistics'))}
  }
  useEffect(()=>{const token:Scope={key,controller:new AbortController()};scope.current=token;setTarget('');setError('');setBusy(false);setInstances([]);setConnections([]);void load(token).catch(e=>{if(active(token))setError(String(e))});return()=>token.controller!.abort()},[instanceId,viewId])
  async function manage(body?:Record<string,unknown>){const token=scope.current;if(!active(token))return;setBusy(true);setError('');try{if(body)await resourceRequest(body,token.controller!.signal);if(!active(token))return;await load(token);if(active(token))notifyReading()}catch(e){if(active(token))setError(e instanceof Error?e.message:String(e))}finally{if(active(token))setBusy(false)}}
  const label=(id:string)=>{const row=instances.find(item=>item.id===id),current=instances.find(item=>item.id===instanceId);const scope=!row?'':row.projectId===null?'未归属':current&&row.projectId===current.projectId?'同项目':'其他项目';return (scope?scope+' · ':'')+'实例 '+id.slice(0,8)}
  const incoming=connections.filter(row=>row.consumerInstanceId===instanceId).at(-1)
  return <details><summary>资料共享</summary><div style={{display:'grid',gap:8}}>
    <p>仅引用所属实例资料，不复制整库。默认只读；撤销阻止后续访问，已发送的AI历史保留。</p>
    {incoming&&<p role="status">当前引用：{label(incoming.ownerInstanceId)} · {incoming.status==='active'?'共享中':'已撤销'}</p>}
    {error&&<p role="alert">{error}</p>}
    <label>共享给阅读实例<select aria-label="共享给阅读实例" value={target} onChange={e=>setTarget(e.target.value)}><option value="">选择目标实例</option>{instances.filter(row=>row.id!==instanceId).map(row=><option key={row.id} value={row.id}>{label(row.id)}</option>)}</select></label>
    <button disabled={busy||!target||incoming?.status==='active'} onClick={()=>void manage({operation:'share',ownerViewId:viewId,consumerInstanceId:target,resourceId:'reading-records'})}>确认只读共享</button>
    {connections.filter(row=>row.ownerInstanceId===instanceId).map(row=><div key={row.id}><span>目标 {label(row.consumerInstanceId)} · {row.status==='active'?(row.allowedActions.includes('update')?'允许编辑':'只读'):'已撤销'}</span>{row.status==='active'&&<><button disabled={busy} onClick={()=>void manage({operation:'permissions',id:row.id,revision:row.revision,allowedActions:row.allowedActions.includes('update')?['read']:['read','create','update','delete']})}>{row.allowedActions.includes('update')?'改为只读':'允许新增、编辑、删除'}</button><button disabled={busy} onClick={()=>void manage({operation:'revoke',id:row.id,revision:row.revision})}>撤销共享</button></>}</div>)}
    <button disabled={busy} onClick={()=>void manage()}>刷新共享状态</button>
  </div></details>
}
