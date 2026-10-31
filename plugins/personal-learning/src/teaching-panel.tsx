import React,{useEffect,useState} from 'react'
export function TeachingPanel({instanceId,request,openSession}){
 const[workspaces,setWorkspaces]=useState([]),[workspaceId,setWorkspaceId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{let active=true;request({action:'teaching-workspaces'}).then(rows=>{if(active){setWorkspaces(rows);setWorkspaceId(rows[0]?.id??'')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[instanceId])
 async function open(){setBusy(true);setError('');try{const binding=await request({action:'teaching-open',instanceId,workspaceId});await openSession(binding.sessionId)}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <article><h2>原生教学会话</h2><p>在 DSH 对话中使用 /personal-learning-teach 开始教学；停止、审批及后续提问由原生会话处理。</p><label>DSH 工作目录<select value={workspaceId} onChange={e=>setWorkspaceId(e.target.value)}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.path}</option>)}</select></label><button disabled={busy||!workspaceId} onClick={open}>{busy?'正在打开…':'打开或继续教学'}</button>{error&&<p role="alert">{error}</p>}</article>
}
