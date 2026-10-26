import {useCallback,useEffect,useRef,useState} from 'react'
import {studyRequest} from './study-client-services.ts'
import {useBusinessState} from './view-state.tsx'
import {useLearningHttp} from './view-context.tsx'

type Sources={libraries:{profileId:string;title:string;viewId:string}[];connections:{id:string;resourceId:string;ownerProfileId:string;status:string;revision:number}[]}
export function SourceConnections({viewId}:{viewId:string}){
  const [sources,setSources]=useState<Sources>({libraries:[],connections:[]}),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [,setRefresh]=useBusinessState('reader.refresh',0),[,setDashboard]=useBusinessState('dashboard',null)
  const http=useLearningHttp(),locked=useRef(false),alive=useRef(true)
  const refresh=useCallback(async(signal?:AbortSignal)=>{const value=await studyRequest<Sources>({action:'source-list',viewId},signal);if(!signal?.aborted&&alive.current)setSources(value)},[viewId])
  useEffect(()=>{alive.current=true;const abort=new AbortController();void refresh(abort.signal).catch(cause=>{if(!abort.signal.aborted)setError(cause.message)});return()=>{alive.current=false;abort.abort()}},[refresh])
  const change=async(body:Record<string,unknown>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await studyRequest({...body,viewId});setRefresh(value=>value+1);await refresh();const response=await http.fetch('/api/kaogong/dashboard');if(response.ok&&alive.current)setDashboard(await response.json())}catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'资料授权操作失败')}finally{locked.current=false;if(alive.current)setBusy(false)}}
  return <section className="kg-overview" aria-label="资料来源与授权"><h3>资料来源与授权</h3><p>引用只读资料，不接管来源中的学习记录。私有笔记不共享。</p>{error&&<p role="alert">{error}</p>}{sources.libraries.length===0&&<p>尚无资料库，可在备考档案设置中新建资料库并预览接入资料。</p>}{sources.libraries.map(library=><div key={library.profileId}><strong>{library.title}</strong><div className="kg-actions"><button disabled={busy} onClick={()=>void change({action:'source-share',ownerViewId:library.viewId,resourceId:'question-bank'})}>确认使用题库</button><button disabled={busy} onClick={()=>void change({action:'source-share',ownerViewId:library.viewId,resourceId:'materials'})}>确认使用资料</button></div></div>)}{sources.connections.map(row=><p key={row.id}>{row.resourceId==='question-bank'?'题库':'资料'} · {sources.libraries.find(library=>library.profileId===row.ownerProfileId)?.title??'保留来源'} · {row.status==='active'?'已授权':'已撤销'}{row.status==='active'&&<button disabled={busy} onClick={()=>void change({action:'source-revoke',id:row.id,revision:row.revision})}>撤销{row.resourceId==='question-bank'?'题库':'资料'}引用</button>}</p>)}</section>
}
