import {useContext,useEffect,useRef,useState} from 'react'
import {useBusinessState} from './view-state.tsx'
import {KaogongTransportContext,useLearningHttp} from './view-context.tsx'
type Data={materials:{id:string;title:string;subject:string;preview:string;fingerprint:string}[];points:{id:string;subject:string;knowledgePoint:string}[];mappings:{materialId:string;pointId:string;available:boolean}[]}
export function MaterialPointPanel(){const owner=useContext(KaogongTransportContext);return <OwnedMappings key={JSON.stringify([owner?.instanceId,owner?.viewId])}/>}
function OwnedMappings(){
 const [refresh]=useBusinessState('reader.refresh',0)
 const http=useLearningHttp(),alive=useRef(true),generation=useRef(0),[data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[materialId,setMaterial]=useState(''),[pointId,setPoint]=useState('')
 async function request(body?:unknown){const response=await http.fetch('/api/kaogong/material-points',body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined),value=await response.json();if(!response.ok)throw Error(value.error??'关联操作失败');return value}
 useEffect(()=>{
  alive.current=true
  const current=++generation.current
  setData(null);setMaterial('');setPoint('');setError('');setBusy(false)
  void request().then(value=>{if(alive.current&&generation.current===current)setData(value)}).catch(e=>{if(alive.current&&generation.current===current)setError(String(e))})
  return()=>{alive.current=false;++generation.current}
 },[http,refresh])
 async function change(body:unknown){
  if(busy)return
  const current=generation.current,isCurrent=()=>alive.current&&generation.current===current
  setBusy(true);setError('')
  try{await request(body);if(!isCurrent())return;const value=await request();if(isCurrent())setData(value)}
  catch(e){if(isCurrent())setError(String(e))}
  finally{if(isCurrent())setBusy(false)}
 }
 const material=data?.materials.find(row=>row.id===materialId)
 return <section aria-label="讲义与知识点关联"><h3>讲义与知识点关联</h3><p>由你选择讲义对应的知识点；仅可关联原讲义同科目的知识点；只保存本档案关联，不修改原资料、分类或证明。回忆参考展示前 12000 字，长讲义请核对开头是否包含本知识点。</p>{error&&<p role="alert">{error}</p>}{!data?(!error&&<p>正在读取获准资料…</p>):<><label>获准讲义<select value={materialId} onChange={e=>{setMaterial(e.target.value);setPoint('')}}><option value="">请选择讲义</option>{data.materials.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}</select></label><label>关联知识点<select value={pointId} onChange={e=>setPoint(e.target.value)}><option value="">请选择知识点</option>{data.points.filter(row=>row.subject===material?.subject).map(row=><option key={row.id} value={row.id}>{row.subject} · {row.knowledgePoint}</option>)}</select></label>{material&&<details open><summary>核对原文（前 12000 字）</summary><p style={{whiteSpace:'pre-wrap'}}>{material.preview}</p></details>}<button disabled={busy||!material||!pointId} onClick={()=>void change({action:'confirm',materialId,pointId,fingerprint:material?.fingerprint,confirmed:true})}>确认关联</button>{!data.materials.length&&<p>暂无获准讲义，请先接入并授权资料。</p>}{data.mappings.map(row=><p key={JSON.stringify([row.materialId,row.pointId])}>{row.available?(data.materials.find(m=>m.id===row.materialId)?.title??'讲义'):'原资料当前不可用'} → {data.points.find(p=>p.id===row.pointId)?.knowledgePoint??'保留知识点'} <button disabled={busy} onClick={()=>void change({action:'remove',materialId:row.materialId,pointId:row.pointId,confirmed:true})}>确认撤销关联</button></p>)}</>}</section>
}

