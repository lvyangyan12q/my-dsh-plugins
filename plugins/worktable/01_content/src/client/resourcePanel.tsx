import {useEffect,useRef,useState} from 'react'
import {platformRequest} from './compositionClient'
const sourceKey=(row:any)=>JSON.stringify([row.instanceId,row.resourceId])
/** Platform-owned metadata controls. Opening never reads business rows or grants access. */
export function ResourcePanel({instanceId,viewId}:{instanceId:string;viewId:string}){
 const [state,setState]=useState<any>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[source,setSource]=useState(''),[consumer,setConsumer]=useState(instanceId),[busy,setBusy]=useState(false)
 const ownership=useRef(0),generation=useRef(0),alive=useRef(true),expanded=useRef(false),pending=useRef<AbortController|null>(null)
 async function load(){const ticket=++generation.current;pending.current?.abort();const controller=new AbortController();pending.current=controller
  try{const [catalog,grants,apps]=await Promise.all([platformRequest('resources',{operation:'catalog'},controller.signal),platformRequest('resources',{operation:'snapshot'},controller.signal),platformRequest('applications',undefined,controller.signal)])
   if(alive.current&&ticket===generation.current&&!controller.signal.aborted){const seen=new Set();setState({catalog:catalog.filter((row:any)=>{const key=sourceKey(row);if(seen.has(key))return false;seen.add(key);return true}),connections:grants.connections,...apps});setError('')}
  }catch(e:any){if(alive.current&&ticket===generation.current&&!controller.signal.aborted){setState(null);setError(e.message)}}
 }
 useEffect(()=>{alive.current=true;ownership.current++;setState(null);setError('');setNotice('');setSource('');setConsumer(instanceId);setBusy(false);if(expanded.current)void load()
  const changed=(event:Event)=>{const ids=(event as CustomEvent).detail?.instanceIds;if(expanded.current&&ids?.includes(instanceId))void load()};window.addEventListener('dsh:resources-changed',changed)
  return()=>{alive.current=false;generation.current++;pending.current?.abort();window.removeEventListener('dsh:resources-changed',changed)}
 },[instanceId,viewId])
 const sources=state?.catalog??[],selected=sources.find((row:any)=>sourceKey(row)===source)
 const targets=(state?.instances??[]).filter((row:any)=>state.applications.some((app:any)=>app.id===row.appId&&app.kind==='deep'&&app.enabled!==false)&&state.views.some((view:any)=>view.instanceId===row.id))
 const target=targets.find((row:any)=>row.id===consumer),conflict=state?.connections.some((row:any)=>row.consumerInstanceId===consumer&&row.resourceId===selected?.resourceId&&row.status==='active')
 const relevant=(state?.connections??[]).filter((row:any)=>row.ownerInstanceId===instanceId||row.consumerInstanceId===instanceId)
 const appTitle=(appId:string)=>state?.applications.find((app:any)=>app.id===appId)?.title??appId
 async function mutate(body:any,ids:string[]){const owner=ownership.current;setBusy(true);setError('');setNotice('')
  try{await platformRequest('resources',body);if(!alive.current||owner!==ownership.current)return;setNotice(body.operation==='share'?'已授权只读；请在使用应用点击刷新资料。':'已撤销；后续读取将被阻止，原资料和已发送的AI历史保留。');await load();if(alive.current&&owner===ownership.current)window.dispatchEvent(new CustomEvent('dsh:resources-changed',{detail:{instanceIds:ids}}))}
  catch(e:any){if(alive.current&&owner===ownership.current)setError(e.message)}finally{if(alive.current&&owner===ownership.current)setBusy(false)}
 }
 return <details className="dsh-wt_rolePanel" onToggle={event=>{expanded.current=event.currentTarget.open;if(expanded.current)void load()}}><summary>资料连接</summary>
  <p className="dsh-wt_appHint">仅连接应用公开提供的资料。不共享对话或写权限；私有资料由所属应用保管。</p>
  {state&&<><div className="dsh-wt_appForm"><label>资料来源<select aria-label="资料来源" value={source} disabled={busy} onChange={event=>{setSource(event.target.value);setNotice('')}}><option value="">选择资料</option>{sources.map((row:any)=><option key={sourceKey(row)} value={sourceKey(row)}>{row.appTitle} · {row.instanceId} · {row.descriptor?.title??row.resourceId}</option>)}</select></label>
   <label>使用实例<select aria-label="使用实例" value={consumer} disabled={busy} onChange={event=>{setConsumer(event.target.value);setNotice('')}}><option value="">选择已有实例</option>{targets.map((row:any)=><option key={row.id} value={row.id}>{appTitle(row.appId)} · {row.id}{row.id===instanceId?'（当前）':''}</option>)}</select></label></div>
   {!sources.length&&<p>目前没有可共享的资料来源。请先建立资料所属实例。</p>}
   {selected&&target&&<p className="dsh-wt_appHint">将 {selected.appTitle} · {selected.instanceId} 的 {selected.descriptor?.title??selected.resourceId} 只读提供给 {appTitle(target.appId)} · {target.id}。{selected.instanceId===target.id?'同实例自有资料无需授权。':conflict?'该实例已有此类资料引用，请先撤销原引用。':''}</p>}
   <button className="dsh-wt_appPrimary" type="button" disabled={busy||!selected||!target||selected.instanceId===target.id||!!conflict} onClick={()=>mutate({operation:'share',ownerViewId:selected.viewId,consumerInstanceId:target.id,resourceId:selected.resourceId},[selected.instanceId,target.id])}>授权只读引用</button>
   {!relevant.length&&<p>当前实例还没有资料连接。</p>}
   {relevant.map((row:any)=><div className="dsh-wt_appCard" key={row.id}><span>{appTitle(row.ownerAppId)} · {row.ownerInstanceId} → {appTitle(row.consumerAppId)} · {row.consumerInstanceId} · {sources.find((source:any)=>source.instanceId===row.ownerInstanceId&&source.resourceId===row.resourceId)?.descriptor?.title??row.resourceId}</span><small>{row.status==='active'?'已授权只读':'已撤销'}</small>{row.status==='active'&&<button type="button" disabled={busy} onClick={()=>mutate({operation:'revoke',id:row.id,revision:row.revision},[row.ownerInstanceId,row.consumerInstanceId])}>撤销只读引用</button>}</div>)}</>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <button type="button" disabled={busy} onClick={()=>void load()}>刷新资料连接</button>
 </details>
}