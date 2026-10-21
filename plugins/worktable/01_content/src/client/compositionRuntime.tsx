import * as React from 'react'
import {useEffect,useRef,useState} from 'react'
import {createPresentation} from '../sdk.mjs'
import {websiteEntry,WEBSITE_SANDBOX} from '../framework/web-policy.mjs'
import {compositionRequest,platformRequest,moduleNames} from './compositionClient'
import {isAbs,parentPathOf} from './pathutil'
let presentationControls:any
const getPresentation=()=>presentationControls??(presentationControls=createPresentation(React))
const changed=(instanceId:string)=>window.dispatchEvent(new CustomEvent('dsh:composition-state-changed',{detail:{instanceId}}))
const columnStyle={minWidth:0,minHeight:160,padding:12,border:'1px solid var(--dsw-alias-border-l2,#7775)',borderRadius:8,overflow:'auto'} as const
function usePresentation(props:any){
 const [state,setState]=useState<any>(null),[error,setError]=useState(''),generation=useRef(0)
 useEffect(()=>{let alive=true;const refresh=()=>{const ticket=++generation.current;compositionRequest('state-read',{viewId:props.view.id}).then(value=>{if(alive&&ticket===generation.current&&value.instanceId===props.instance.id){setState(value);setError('')}}).catch(error=>{if(alive&&ticket===generation.current)setError(error.message)})};setState(null);refresh();const onChange=(event:any)=>{if(event.detail?.instanceId===props.instance.id)refresh()};window.addEventListener('dsh:composition-state-changed',onChange);return()=>{alive=false;generation.current++;window.removeEventListener('dsh:composition-state-changed',onChange)}},[props.view.id,props.instance.id])
 async function update(scopeId:string,patch:any){if(!state)return;const ticket=generation.current;try{const current=state.scopes[scopeId]??{filters:{},selectedId:null};const value=await compositionRequest('state-save',{viewId:props.view.id,scopeId,expectedRevision:state.revision,...current,...patch});if(ticket!==generation.current||value.instanceId!==props.instance.id)return;setState(value);setError('');changed(props.instance.id);return true}catch(error:any){if(ticket===generation.current)setError(error.message);return false}}
 return {state,error,update}
}
/** Existing user-selected HTML is opaque-origin content; never gets the native cookie/DOM. */
export function CustomArtifact({path,title}:any){
 const [html,setHtml]=useState<string|null>(null),[error,setError]=useState('')
 useEffect(()=>{let alive=true;const controller=new AbortController();setHtml(null);setError('');if(!path||!isAbs(path)){setError('请选择已存在的HTML产物绝对路径。');return()=>controller.abort()}
 fetch('/api/worktable/file?path='+encodeURIComponent(path),{credentials:'same-origin',signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('产物无法读取；请核对路径。');return response.text()}).then(text=>{if(alive)setHtml(text)}).catch(error=>{if(alive&&!controller.signal.aborted)setError(error.message)});return()=>{alive=false;controller.abort()}},[path])
 return error?<p role="alert">{error}</p>:html===null?<p role="status">正在读取产物…</p>:<iframe title={title??'自定义产物'} srcDoc={html} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{width:'100%',height:300,border:0}}/>
}
function ResourceBrowser({path}:any){
 const [current,setCurrent]=useState(path??''),[entries,setEntries]=useState<any[]>([]),[error,setError]=useState(''),[preview,setPreview]=useState<any>(null),[tick,setTick]=useState(0)
 useEffect(()=>setCurrent(path??''),[path]);useEffect(()=>{let alive=true;setEntries([]);setError('');setPreview(null);if(!isAbs(current)){setError('请配置资源目录绝对路径。');return}
 platformRequest('fs',{path:current}).then(value=>{if(alive){if(value.error)throw new Error(value.error);setEntries(value.entries??[])}}).catch(error=>{if(alive)setError(error.message)});return()=>{alive=false}},[current,tick])
 return <div><div className="dsh-wt_appLine"><button type="button" onClick={()=>setCurrent(parentPathOf(current))}>上一级</button><button type="button" onClick={()=>setTick(tick+1)}>刷新资源</button></div><details><summary>当前目录</summary><small>{current}</small></details>{error&&<p role="alert">{error}</p>}{entries.map(entry=><button className="dsh-wt_treeRow" type="button" key={entry.path} onClick={()=>entry.isDir?setCurrent(entry.path):setPreview(entry)}>{entry.isDir?'📁':'📄'} {entry.name}</button>)}{preview&&(/\.html?$/i.test(preview.name)?<CustomArtifact path={preview.path} title={preview.name}/>:<a href={'/api/worktable/file?path='+encodeURIComponent(preview.path)} target="_blank" rel="noopener noreferrer">打开 {preview.name} ↗</a>)}</div>
}
function FilterControls({fields,values,onCommit}:any){const UI=getPresentation();const [draft,setDraft]=useState(values),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false);const current=useRef(values);current.current=draft;useEffect(()=>{if(!dirty)setDraft(values)},[values,dirty]);return <div><UI.Filters fields={fields} values={draft} onChange={(next:any)=>{setDraft(next);setDirty(true)}}/><button type="button" disabled={!dirty||saving} onClick={async()=>{setSaving(true);const sent=draft;const ok=await onCommit(sent);if(ok&&JSON.stringify(current.current)===JSON.stringify(sent))setDirty(false);setSaving(false)}}>应用筛选</button></div>}
function DataModule({module,recipe,props,presentation}:any){
 const UI=getPresentation()
 const ref=recipe.connections?.find((row:any)=>row.id===module.connectionId),scopeId=module.connectionId??module.id,scope=presentation.state?.scopes[scopeId]??{filters:{},selectedId:null}
 const [value,setValue]=useState<any>(null),[phase,setPhase]=useState('loading'),[error,setError]=useState(''),[tick,setTick]=useState(0),[granting,setGranting]=useState(false)
 useEffect(()=>{let alive=true;const controller=new AbortController();setValue(null);setError('');if(!ref){setPhase('ready');return}
 setPhase('loading');platformRequest('applications',{action:'resolve',viewId:ref.viewId},controller.signal).then(async source=>{const result=await platformRequest('resources',{operation:'call',viewId:props.view.id,resourceId:ref.resourceId,action:'read'},controller.signal);if(result.connection?(result.connection.consumerInstanceId!==props.instance.id||result.connection.ownerInstanceId!==source.instance.id||result.connection.resourceId!==ref.resourceId):source.instance.id!==props.instance.id)throw new Error('共享来源与当前配方不一致，请明确撤销旧引用后重新授权。');if(alive){setValue(result.value);setPhase('ready')}}).catch(error=>{if(alive&&!controller.signal.aborted){setError(error.message);setPhase('error')}});return()=>{alive=false;controller.abort()}},[props.view.id,ref?.id,ref?.resourceId,ref?.viewId,tick])
 const config=module.config??{},recordsField=config.recordsField??'records',source=value?.[recordsField]
 const rows=Array.isArray(source)?source:[];const query=String(scope.filters.query??'').toLocaleLowerCase();const fields=Array.isArray(config.queryFields)?config.queryFields:[config.mapping?.title??'title'];const filtered=rows.filter((row:any)=>Object.entries(scope.filters).every(([key,value])=>!value||(key==='query'?fields.some((field:string)=>String(row?.[field]??'').toLocaleLowerCase().includes(String(value).toLocaleLowerCase())):String(row?.[key]??'').toLocaleLowerCase().includes(String(value).toLocaleLowerCase()))))
 async function share(){setGranting(true);try{await platformRequest('resources',{operation:'share',ownerViewId:ref.viewId,consumerInstanceId:props.instance.id,resourceId:ref.resourceId});setTick(tick+1)}catch(error:any){setError(error.message)}finally{setGranting(false)}}
 if(!ref)return <p>请选择数据来源后再启用；未读取任何业务记录。</p>
 if(phase==='error')return <div><UI.State phase="error" error={error} onRetry={()=>setTick(tick+1)}/><details><summary>显式授权</summary><p>仅将所选资料只读共享给当前实例，不共享对话或写权限。</p><button type="button" disabled={granting} onClick={share}>授权此实例只读引用</button></details></div>
 if(phase==='ready'&&!Array.isArray(source))return <p role="alert">数据中没有数组字段 {recordsField}，请在模块中配置记录字段。</p>
 const common:any={phase,error,records:filtered,onRetry:()=>setTick(tick+1)}
 if(module.type==='statistics')return <UI.Stats {...common} metrics={config.metrics??[{id:'count',label:'记录数',aggregate:'count'}]}/>
 if(module.type==='filter')return <FilterControls fields={config.fields??[{id:'query',label:'筛选'}]} values={scope.filters} onCommit={(filters:any)=>presentation.update(scopeId,{filters})}/>
 if(module.type==='detail')return <UI.Detail phase={phase} record={filtered.find((row:any)=>row[config.idField??'id']===scope.selectedId)} fields={config.fields??[{field:'title',label:'标题'}]}/>
 return <UI.List {...common} mapping={config.mapping??{id:'id',title:'title'}} selectedId={scope.selectedId??undefined} onSelect={(selectedId:string)=>presentation.update(scopeId,{selectedId})}/>
}
function ConversationModule({module,props}:any){
 const [facts,setFacts]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[tick,setTick]=useState(0),owner=useRef(0)
 useEffect(()=>{const ticket=++owner.current;setFacts(null);setError('');setBusy(false);if(module.roleId&&props.roles)props.roles.read(module.roleId).then((value:any)=>{if(owner.current===ticket)setFacts(value)}).catch((error:any)=>{if(owner.current===ticket)setError(error.message)});return()=>{owner.current++}},[props.instance.id,module.roleId,tick])
 async function action(kind:string){const ticket=owner.current;setBusy(true);try{if(kind==='ensure')await props.roles.ensure(module.roleId);else await props.roles.open(module.roleId,facts.binding.sessionId,facts.binding.revision);if(ticket===owner.current)setTick(value=>value+1)}catch(error:any){if(ticket===owner.current)setError(error.message)}finally{if(ticket===owner.current)setBusy(false)}}
 if(!module.roleId)return <p>请在模块编辑中关联角色，再打开原生对话。</p>
 return <div><p>{facts?.binding?facts.binding.phase==='ready'?'角色会话已就绪':'创建待恢复，请使用上方应用角色面板重试':'尚未创建角色会话'}</p>{facts?.unavailable&&<p role="status">{facts.unavailable.reason}</p>}<div className="dsh-wt_appLine">{!facts?.binding&&<button type="button" disabled={busy||!props.roles||!facts||!!facts?.unavailable} onClick={()=>action('ensure')}>创建角色会话</button>}{facts?.binding?.phase==='ready'&&<button type="button" disabled={busy||!!facts?.unavailable} onClick={()=>action('open')}>打开同一原生会话</button>}<button type="button" onClick={()=>setTick(value=>value+1)}>刷新角色状态</button></div><details><summary>关联身份</summary><small>角色 {module.roleId} · 会话 {facts?.binding?.sessionId??'未创建'}</small></details><p>在旁边原生对话编辑。任务可在上方AI任务面板准备，确认后显式发送；关闭模块不会停止任务。</p>{error&&<p role="alert">{error}</p>}</div>
}
function ModuleContent({module,recipe,props,presentation,preview}:any){
 const config=module.config??{}
 if(preview)return <p>{moduleNames[module.type]} · 预览不读取业务资料、不创建对话；启用后可使用。</p>
 if(['statistics','list','detail','filter'].includes(module.type))return <DataModule module={module} recipe={recipe} props={props} presentation={presentation}/>
 if(module.type==='resources')return <ResourceBrowser path={config.path}/>
 if(module.type==='custom')return <CustomArtifact path={config.artifactPath} title={config.title}/>
 if(module.type==='website'){let url;try{url=websiteEntry(config.url,window.location.origin)}catch(error:any){return <p role="alert">{error.message}</p>}return <div><a href={url} target="_blank" rel="noopener noreferrer">外部打开 ↗</a><iframe title={config.title??'网站模块'} src={url} sandbox={WEBSITE_SANDBOX} referrerPolicy="no-referrer" style={{width:'100%',height:300,border:0}}/></div>}
 if(module.type==='animation'){let url;try{url=new URL(config.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error()}catch{return <p role="alert">请配置有效的图片或视频地址。</p>}return config.media==='video'?<video src={url.href} controls preload="metadata" style={{maxWidth:'100%'}}/>:<img src={url.href} alt={config.title??'动画媒体'} style={{maxWidth:'100%'}}/>}
 if(module.type==='conversation')return <ConversationModule module={module} props={props}/>
 return <p role="alert">模块类型不可用，配置保留。</p>
}
export function CompositionCanvas({recipe,pageId,props,presentation,preview=false}:any){
 const UI=getPresentation()
 const page=pageId==='page'?recipe.pages[0]:recipe.pages.find((page:any)=>'page.'+page.id===pageId)
 if(!page)return <p role="alert">此页面已移除，原视图与实例记录保留。</p>
 return <div style={{display:'grid',gridTemplateColumns:recipe.layout==='vertical'?'minmax(0,1fr)':'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:12,padding:12,minWidth:0}}>{page.modules.map((module:any)=><section key={module.id} aria-label={module.config?.title??moduleNames[module.type]} style={columnStyle}><strong>{module.config?.title??moduleNames[module.type]}</strong><UI.Surface theme={module.config?.theme??'inherit'}><ModuleContent module={module} recipe={recipe} props={props} presentation={presentation} preview={preview}/></UI.Surface></section>)}</div>
}
export function CompositionRuntime({recipe,...props}:any){const presentation=usePresentation(props);return <>{presentation.error&&<p role="alert">{presentation.error}（请刷新视图后重试，当前运行配方保持。）</p>}<CompositionCanvas recipe={recipe} pageId={props.view.type} props={props} presentation={presentation}/></>}
