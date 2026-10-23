import {CompositionEditor} from './compositionEditor'
import {TaskHandoff} from './taskHandoff'
import {CapabilityManager} from './rolePanel'
import {useEffect,useRef,useState} from 'react'
import {DeepApplicationView} from './applicationViews'
export {applicationViews} from './applicationViews'
import {websiteEntry,WEBSITE_SANDBOX} from '../framework/web-policy.mjs'

export type ApplicationContent={kind:'application';appId:string;instanceId:string;viewId:string;title:string}
type Project={id:string;name:string}
type Open=(content:ApplicationContent)=>void
const ENDPOINT='/api/worktable/applications'
async function request(body?:any,signal?:AbortSignal){
  const response=await fetch(ENDPOINT,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal}:{cache:'no-store',signal})
  const value=await response.json();if(!response.ok) throw new Error(value.error??'应用操作失败，请重试。');return value
}
function contentOf(application:any,instance:any,view:any):ApplicationContent{return {kind:'application',appId:application.id,instanceId:instance.id,viewId:view.id,title:application.title}}

/** Module-local chooser; no application has layout or native-session ownership. */
export function ApplicationPicker(props:{projectId:string|null;onOpen:Open;onCancel:()=>void}){
  const [snapshot,setSnapshot]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [composing,setComposing]=useState(false)
  const [name,setName]=useState(''),[id,setId]=useState(''),[url,setUrl]=useState('')
  const mounted=useRef(true)
  const directoryRead=useRef(0),ownership=useRef(0)
  useEffect(()=>{
    mounted.current=true;ownership.current++;setSnapshot(null);setError('');setBusy(false)
    let pending:AbortController|null=null
    const refresh=()=>{
      const current=++directoryRead.current;pending?.abort();const controller=new AbortController();pending=controller
      const owns=()=>mounted.current&&!controller.signal.aborted&&directoryRead.current===current
      request(undefined,controller.signal).then(value=>{if(owns()){setSnapshot(value);setError('')}}).catch(e=>{if(owns())setError(e.message)})
    }
    refresh();window.addEventListener('dsh:applications-changed',refresh)
    return()=>{mounted.current=false;ownership.current++;directoryRead.current++;pending?.abort();window.removeEventListener('dsh:applications-changed',refresh)}
  },[props.projectId])
  async function perform(operation:(owns:()=>boolean)=>Promise<void>){const owner=ownership.current;const owns=()=>mounted.current&&ownership.current===owner;setBusy(true);setError('');try{await operation(owns)}catch(e:any){if(owns())setError(e.message)}finally{if(owns())setBusy(false)}}
  async function open(application:any,create:boolean,selected?:any,independent=false){await perform(async owns=>{
    let instance=selected??(independent?null:await request({action:'latest',appId:application.id,projectId:props.projectId}))
    if(!owns())return
    const creating=!instance
    if(creating){if(!create)throw new Error('没有可继续的实例，请显式新建。');instance=await request({action:'create',appId:application.id,projectId:props.projectId})}
    if(!owns())return
    if(!creating){instance=await request({action:'resume',instanceId:instance.id});if(!owns())return;if(instance.appId!==application.id||instance.projectId!==props.projectId)throw new Error('实例归属已改变，请重新打开应用目录。')}
    const state=await request();if(!owns())return
    let view=creating?null:state.views.find((v:any)=>v.instanceId===instance.id)
    if(!view)view=await request({action:'view',instanceId:instance.id})
    if(owns())props.onOpen(contentOf(application,instance,view))
  })}
  if(composing)return <CompositionEditor projectId={props.projectId} onCancel={()=>setComposing(false)} onOpen={props.onOpen}/>
  return <section className="dsh-wt_appPanel" aria-label="选择应用">
    <div className="dsh-wt_appLine"><strong>应用</strong><button type="button" onClick={props.onCancel}>返回模块</button></div>
    <button type="button" className="dsh-wt_appPrimary" onClick={()=>setComposing(true)}>组合应用与模板</button>
    <p className="dsh-wt_appHint">{props.projectId?'在当前项目继续或明确新建实例。':'先使用应用，实例将标记为未归属项目。'}</p>
    {!snapshot&&!error&&<p role="status">正在读取应用…</p>}
    {snapshot?.applications.map((application:any)=>{
      const instances=snapshot.instances.filter((i:any)=>i.appId===application.id&&i.projectId===props.projectId).sort((a:any,b:any)=>b.lastOpenedAt-a.lastOpenedAt)
      const latest=instances[0]
      return <div className="dsh-wt_appCard" key={application.id}>
        <strong>{application.title}</strong><small>{application.kind==='deep'?'应用':'网页'} · {application.id}{application.enabled===false?' · 已停用':''}</small>
        <div className="dsh-wt_appLine">
          <button type="button" className="dsh-wt_appPrimary" disabled={busy||(!latest&&application.enabled===false)} onClick={()=>open(application,!latest)}>{latest?'继续最近实例':'新建实例'}</button>
          {latest&&<button type="button" disabled={busy||application.enabled===false} onClick={()=>open(application,true,undefined,true)}>新建独立实例</button>}
          <button type="button" disabled={busy} onClick={()=>void perform(async owns=>{await request({action:'lifecycle',appId:application.id,enabled:application.enabled===false,revision:application.lifecycleRevision??0});const next=await request();if(owns())setSnapshot(next);window.dispatchEvent(new Event('dsh:applications-changed'))})}>{application.enabled===false?'启用应用':'停用应用'}</button>
        </div>
        {instances.length>1&&<details><summary>其他实例（{instances.length-1}）</summary><div className="dsh-wt_appForm">{instances.slice(1).map((instance:any)=><button type="button" key={instance.id} title={instance.id} disabled={busy} onClick={()=>open(application,false,instance)}>恢复实例 {instance.id.slice(0,8)}</button>)}</div></details>}
      </div>
    })}
    {snapshot?.applications.length===0&&<p>还没有接入应用。可先登记一个独立网页。</p>}
    {snapshot?.lifecycle?.filter((row:any)=>!snapshot.applications.some((app:any)=>app.id===row.appId)).map((row:any)=><div className="dsh-wt_appCard" key={'missing:'+row.appId}><strong>{row.appId} · 应用插件未加载</strong><p>持久策略：{row.enabled?'已启用':'已停用'}。原数据和原生会话保留；启用策略不会安装插件。</p>{!row.enabled&&<button disabled={busy} onClick={()=>void perform(async owns=>{await request({action:'lifecycle',appId:row.appId,enabled:true,revision:row.revision});const next=await request();if(owns())setSnapshot(next);window.dispatchEvent(new Event('dsh:applications-changed'))})}>明确启用此策略</button>}</div>)}
    <TaskHandoff/>
    <CapabilityManager/>
    <details><summary>接入网页应用</summary>
      <form className="dsh-wt_appForm" onSubmit={e=>{e.preventDefault();void perform(async owns=>{
        websiteEntry(url,window.location.origin)
        await request({action:'register',application:{id,title:name,version:'1.0.0',protocolVersion:1,kind:'web',url}})
        const next=await request();if(owns()){setSnapshot(next);setName('');setId('');setUrl('')}
      })}}>
        <label>应用名称<input required value={name} onChange={e=>setName(e.target.value)} /></label>
        <label>应用标识<input required pattern="[a-z][a-z0-9.-]{0,79}" placeholder="reading-web" value={id} onChange={e=>setId(e.target.value)} /></label>
        <label>网页地址<input required type="url" placeholder="https://" value={url} onChange={e=>setUrl(e.target.value)} /></label>
        <p className="dsh-wt_appHint">只管理入口和布局。网页内部状态、原生工具与其他实例不共享。</p>
        <button type="submit" disabled={busy}>登记网页</button>
      </form>
    </details>
    {error&&<p className="dsh-wt_appError" role="alert">{error}</p>}
  </section>
}

export function ApplicationPane(props:{content:ApplicationContent;projects:Project[];onOpen:Open;reloadKey:number}){
  const [resolved,setResolved]=useState<any>(null),[error,setError]=useState(''),[projectId,setProjectId]=useState(''),[busy,setBusy]=useState(false)
  const [loaded,setLoaded]=useState(false),[viewType,setViewType]=useState('page')
  const mounted=useRef(true),generation=useRef(0),ownership=useRef(0),pending=useRef<AbortController|null>(null)
  async function refresh(resume=false){
    const current=++generation.current
    pending.current?.abort()
    const controller=new AbortController();pending.current=controller
    const owns=()=>mounted.current&&!controller.signal.aborted&&generation.current===current
    try{
      if(resume)await request({action:'resume',instanceId:props.content.instanceId},controller.signal)
      const value=await request({action:'resolve',viewId:props.content.viewId},controller.signal)
      if(value.view.id!==props.content.viewId||value.instance.id!==props.content.instanceId||value.application.id!==props.content.appId)throw new Error('视图身份不一致，请从应用入口重新打开。')
      if(value.application.kind!=='deep')websiteEntry(value.application.url,window.location.origin)
      if(owns()){setResolved(value);setError('')}
    }catch(e:any){if(owns()){setResolved(null);setError(e.message)}}
  }
  useEffect(()=>{
    mounted.current=true;ownership.current++;setResolved(null);setError('');setBusy(false);setViewType('page');setProjectId('');void refresh(true)
    const changed=()=>void refresh()
    const opened=(event:Event)=>{if((event as CustomEvent).detail?.viewIds?.includes(props.content.viewId))void refresh(true)}
    window.addEventListener('dsh:applications-changed',changed)
    window.addEventListener('dsh:application-layout-opened',opened)
    return()=>{mounted.current=false;ownership.current++;generation.current++;pending.current?.abort();window.removeEventListener('dsh:applications-changed',changed);window.removeEventListener('dsh:application-layout-opened',opened)}
  },[props.content.viewId,props.content.instanceId,props.content.appId])
  useEffect(()=>setLoaded(false),[props.reloadKey,props.content.viewId])
  async function action(operation:()=>Promise<void>){const owner=ownership.current;setBusy(true);try{await operation()}catch(e:any){if(mounted.current&&ownership.current===owner)setError(e.message)}finally{if(mounted.current&&ownership.current===owner)setBusy(false)}}
  const matching=resolved?.view?.id===props.content.viewId&&resolved?.instance?.id===props.content.instanceId&&resolved?.application?.id===props.content.appId
  const instance=matching?resolved.instance:null,application=matching?resolved.application:null
  return <div className="dsh-wt_application">
    <div className="dsh-wt_appToolbar">
      <span>{application?.title??props.content.title} · {instance?.projectId?(props.projects.find(p=>p.id===instance.projectId)?.name??'已关联项目'):'未归属项目'}</span>
      {matching&&application.kind!=='deep'&&<a href={application.url} target="_blank" rel="noopener noreferrer">外部打开 ↗</a>}
      {matching&&application.kind==='deep'&&<label>视图<select aria-label="添加视图类型" value={viewType} onChange={e=>setViewType(e.target.value)}>{application.views.map((view:any)=><option key={view.id} value={view.id}>{view.title}</option>)}</select></label>}
      {matching&&<button type="button" disabled={busy} onClick={()=>void action(async()=>{const owner=ownership.current;const view=await request({action:'view',instanceId:instance.id,viewType:application.kind==='deep'?viewType:'page'});if(mounted.current&&ownership.current===owner)props.onOpen(contentOf(application,instance,view))})}>添加同实例视图</button>}
      <details><summary>实例</summary><div className="dsh-wt_appDetails">
        <small>实例：{props.content.instanceId}</small><small>视图：{props.content.viewId}</small>
        {instance?.projectId===null&&<><label>关联项目<select value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">选择项目</option>{props.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <button type="button" disabled={!projectId||busy} onClick={()=>void action(async()=>{await request({action:'attach',instanceId:instance.id,projectId,revision:instance.revision});window.dispatchEvent(new Event('dsh:applications-changed'))})}>关联并保留实例</button></>}
        <p className="dsh-wt_appHint">关闭视图保留实例。应用自有状态仅在其声明范围内共享。</p>
      </div></details>
    </div>
    {error&&<p className="dsh-wt_appError" role="alert">{error}<button type="button" onClick={()=>void refresh()}>重试</button></p>}
    {matching&&application.enabled===false&&<div className="dsh-wt_appPanel"><p>应用已停用。新实例、新任务已阻止；已有原生会话不会自动停止。</p><TaskHandoff/></div>}
    {matching&&application.enabled!==false&&application.kind==='deep'&&<div style={{flex:1,minHeight:0,minWidth:0,overflow:'auto'}}><DeepApplicationView key={props.content.viewId} application={application} instance={instance} view={resolved.view} reloadKey={props.reloadKey}/></div>}
    {matching&&application.enabled!==false&&application.kind!=='deep'&&<><p className="dsh-wt_appHint">{loaded?'网页框架已载入；跨域内容是否可用需以页面显示为准。':'正在打开网页。'} 若空白、链接失效或提示禁止嵌入，请选择“外部打开”。</p>
      <iframe key={props.reloadKey} className="dsh-wt_paneFrame" title={application.title} src={application.url} sandbox={WEBSITE_SANDBOX} referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)} onError={()=>setError('网页暂时无法载入，可重试或外部打开。')} />
    </>}
  </div>
}

export function ApplicationLauncher(props:{onOpen:Open}){
  const [open,setOpen]=useState(false)
  return <><button type="button" className="dsh-wt_iconBtn" title="应用（可先使用再关联项目）" aria-label="打开应用目录" onClick={()=>setOpen(true)}>▦</button>
    {open&&<div className="dsh-wt_appBackdrop" onClick={()=>setOpen(false)}><div className="dsh-wt_appDialog" role="dialog" aria-modal="true" aria-label="应用目录" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}}><ApplicationPicker projectId={null} onCancel={()=>setOpen(false)} onOpen={content=>{setOpen(false);props.onOpen(content)}} /></div></div>}
  </>
}
