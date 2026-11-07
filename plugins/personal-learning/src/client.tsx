import {LabPanel} from './lab-panel.tsx'
import {MapPanel} from './map-panel.tsx'
import React,{useEffect,useState} from 'react'

export const inject=['slots','layout','uiWorkspace']
export async function learningRequest(body?:Record<string,unknown>){const res=await fetch('/api/personal-learning',{credentials:'same-origin',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const value=await res.json();if(!res.ok)throw Error(value.error||'学习空间读取失败');return value}

export function LearningStudio({openSession}){
 const[view,setView]=useState('studio')
 const[state,setState]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const[title,setTitle]=useState(''),[goal,setGoal]=useState(''),[prior,setPrior]=useState(''),[creating,setCreating]=useState(false)
 useEffect(()=>{let active=true;learningRequest().then(value=>{if(active)setState(value)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[])
 async function openInstance(instanceId:string){if(busy)return;setBusy(true);setError('');try{await learningRequest({action:'open',instanceId});setState(await learningRequest());setCreating(false)}catch(e){setError(e.message)}finally{setBusy(false)}}
 const current=state?.instances.find(row=>row.id===state.lastInstanceId)
 const[viewReady,setViewReady]=useState<string|null>(null)
 useEffect(()=>{let active=true;setViewReady(null);if(!current)return;learningRequest({action:'continuation-read',instanceId:current.id}).then(result=>{if(active){setView(result.position?.view==='map'?'map':'studio');setViewReady(current.id)}}).catch(e=>{if(active){setError(e.message);setView('studio');setViewReady(current.id)}});return()=>{active=false}},[current?.id])
 async function navigate(next){if(!current||busy||viewReady!==current.id)return;setBusy(true);try{await learningRequest({action:'continuation-save',instanceId:current.id,view:next==='map'?'map':'course'});setView(next)}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function create(event){event.preventDefault();if(busy)return;setBusy(true);setError('');try{await learningRequest({action:'create',title,goal,priorKnowledge:prior});setState(await learningRequest());setCreating(false);setView('studio')}catch(e){setError(e.message)}finally{setBusy(false)}}
 function startCreate(){setTitle('');setGoal('');setPrior('');setCreating(true)}
 return <section className="pl-studio" aria-label="个人学习空间"><style>{styles}</style>
  <header className="pl-top">
   <div className="pl-brand"><span aria-hidden="true">∴</span><b>知间</b><em>个人学习空间</em></div>
   {state&&<div className="pl-spaces" aria-label="学习空间">
    {state.instances.map(row=><button key={row.id} type="button" className="pl-space" aria-pressed={row.id===current?.id} disabled={busy} onClick={()=>void openInstance(row.id)}>{row.title}</button>)}
    <button type="button" className="pl-space pl-space-add" disabled={busy} onClick={startCreate}>+ 新空间</button>
   </div>}
   <div className="pl-views" role="group" aria-label="学习视图">
    <button type="button" aria-pressed={view==='studio'} disabled={!current||busy||viewReady!==current?.id} onClick={()=>navigate('studio')}>工作室</button>
    <button type="button" aria-pressed={view==='map'} disabled={!current||busy||viewReady!==current?.id} onClick={()=>navigate('map')}>知识地图</button>
   </div>
  </header>
  <main className="pl-main">
   {error&&<p role="alert" className="pl-alert">{error}</p>}
   {!state&&!error&&<p className="pl-status">正在读取学习空间…</p>}
   {state&&(current&&!creating
    ? (view==='studio'
      ? <LabPanel key={current.id+'-lab'} instanceId={current.id} request={learningRequest} openSession={openSession}/>
      : <MapPanel key={current.id+'-map'} instanceId={current.id} instanceTitle={current.title} goal={current.goal} request={learningRequest} openSession={openSession} openCourse={async id=>{await learningRequest({action:'continuation-save',instanceId:current.id,courseId:id});setView('studio')}}/>)
    : <form className="pl-create" onSubmit={create}><small>开始一段新的探索</small><h1>你想理解什么？</h1><label>学习名称<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>学习目标<textarea required maxLength={8000} value={goal} onChange={e=>setGoal(e.target.value)}/></label><label>已有基础<textarea maxLength={8000} value={prior} onChange={e=>setPrior(e.target.value)}/></label><div className="pl-create-actions"><button type="button" className="pl-quiet" onClick={()=>setCreating(false)} disabled={!current}>取消</button><button className="pl-primary" disabled={busy}>{busy?'正在保存…':'创建学习空间'}</button></div></form>)}
  </main>
 </section>
}
export function apply(ctx){ctx.effect(function*(){
 yield ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'personal-learning',inject:()=>({openSession:id=>ctx.uiWorkspace.openSession(id)})},LearningStudio))
 yield ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'personal-learning',order:21,label:()=> '个人学习'},()=> <span aria-hidden="true">学</span>))
},'personal learning standalone menu')}
const styles=`.pl-studio{background:#fff;color:#1f1f1d;min-height:100%;font:14px/1.7 system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.pl-studio *{box-sizing:border-box}
.pl-studio button{font-family:inherit;font-size:13px;line-height:1.5;background:#fff;color:#1f1f1d;border:1px solid #e6e6e2;border-radius:8px;padding:8px 14px;cursor:pointer}
.pl-studio button:hover:not(:disabled){border-color:#d3d3cc;background:#fafaf8}
.pl-studio input,.pl-studio textarea,.pl-studio select{font-family:inherit;font-size:13px;color:#1f1f1d;background:#fff;border:1px solid #dbdbdb;border-radius:8px;padding:8px 10px}
.pl-studio textarea{width:100%}
.pl-studio article h2,.pl-studio article h3{font-size:16px;margin:0 0 10px;letter-spacing:-.01em}
.pl-studio article p{font-size:13px;color:#6f6f68;margin:6px 0}
.pl-studio summary{cursor:pointer;font-size:13px;font-weight:600}
.pl-context article + article{margin-top:18px}
.pl-top{display:flex;align-items:center;gap:18px;padding:12px 24px;border-bottom:1px solid #e6e6e2;background:rgba(255,255,255,.96);position:sticky;top:0;z-index:6}
.pl-brand{display:flex;align-items:baseline;gap:8px;white-space:nowrap}
.pl-brand span{color:#0f6b3f;font-size:16px}
.pl-brand b{font-size:14px;letter-spacing:.04em}
.pl-brand em{font-style:normal;color:#a2a29a;font-size:12px}
.pl-spaces{display:flex;gap:6px;align-items:center;flex:1;min-width:0;overflow:auto;scrollbar-width:none}
.pl-spaces::-webkit-scrollbar{display:none}
.pl-studio .pl-space{border:1px solid transparent;background:none;color:#6f6f68;padding:5px 12px;border-radius:999px;font-size:13px;white-space:nowrap;cursor:pointer}
.pl-studio .pl-space[aria-pressed=true]{background:#f7f7f5;border-color:#e6e6e2;color:#1f1f1d;font-weight:600}
.pl-studio .pl-space-add{border:1px dashed #d8d8d2;color:#a2a29a}
.pl-views{display:flex;gap:2px;padding:2px;border:1px solid #e6e6e2;border-radius:9px;background:#fafaf8;flex-shrink:0}
.pl-studio .pl-views button{border:0;background:none;color:#8a8a84;font-size:12.5px;padding:4px 10px;border-radius:7px;cursor:pointer}
.pl-studio .pl-views button[aria-pressed=true]{background:#fff;color:#1f1f1d;box-shadow:0 1px 2px rgba(0,0,0,.06);font-weight:600}
.pl-studio .pl-views button:disabled{opacity:.5;cursor:default}
.pl-main{max-width:1180px;margin:0 auto;padding:30px 24px 72px}
.pl-status{color:#8a8a84;font-size:13px}
.pl-alert{color:#a2462a;font-size:13px}
.pl-workspace{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start}
.pl-workspace .pl-canvas{min-width:0}
.pl-workspace .pl-canvas h1{font-size:28px;margin:6px 0 18px}
.pl-context{border-left:1px solid #e6e6e2;padding-left:22px}
.pl-studio details{margin:14px 0}
.pl-studio summary{cursor:pointer;font-weight:600;font-size:13px}
.pl-create{max-width:640px;margin:24px auto 0}
.pl-create small{color:#8a8a84;font-size:12px;letter-spacing:.1em}
.pl-create h1{font-size:28px;margin:8px 0 24px}
.pl-create label{display:block;margin:18px 0;font-size:13px;color:#6f6f68}
.pl-create input,.pl-create textarea{display:block;width:100%;margin-top:8px;padding:11px 12px;border:1px solid #dbdbdb;border-radius:8px;font:inherit;color:#1f1f1d;background:#fff}
.pl-create-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:22px}
.pl-studio .pl-primary{background:#0f6b3f;color:#fff;border:0;border-radius:8px;padding:11px 20px;font-weight:600;font-size:14px;cursor:pointer}
.pl-studio .pl-primary:hover{background:#0c5a35}
.pl-studio .pl-quiet{background:#fff;color:#4a4a45;border:1px solid #e6e6e2;border-radius:8px;padding:10px 16px;font-size:13px;cursor:pointer}
.pl-studio button:disabled{opacity:.5;cursor:default}
.pl-studio :focus-visible{outline:2px solid #0f6b3f;outline-offset:2px}
@media(max-width:1000px){.pl-workspace{grid-template-columns:minmax(0,1fr)}.pl-context{border-left:0;padding-left:0}}
@media(max-width:680px){.pl-top{flex-wrap:wrap;padding:10px 14px;gap:10px}.pl-brand em{display:none}.pl-main{padding:20px 14px 60px}.pl-workspace .pl-canvas h1{font-size:22px}}`
