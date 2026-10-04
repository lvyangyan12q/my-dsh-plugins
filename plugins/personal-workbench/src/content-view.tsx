import {ModuleAction} from './module-action.tsx'
import {contentIdentity} from './content-identity.ts'
import {useEffect,useRef,useState} from 'react'
import type {RecipeModuleProps} from './recipe-view.tsx'
import {registerRecipeModuleRenderer} from './recipe-view.tsx'
import {PreparedTaskEditor} from './task-view.tsx'
import {ModuleSessionState} from './module-session-state.tsx'
import {webAddress} from './content-catalog.ts'
export async function contentRequest(props:Pick<RecipeModuleProps,'appId'|'instanceId'|'module'>,action:string,path?:string,signal?:AbortSignal,requestId?:string):Promise<any>{
 const response=await fetch('/api/personal-workbench/content',{method:'POST',credentials:'same-origin',signal,headers:{'content-type':'application/json'},body:JSON.stringify({action,appId:props.appId,instanceId:props.instanceId,moduleId:props.module.id,...(path===undefined?{}:{path}),...(requestId===undefined?{}:{requestId})})}),value=await response.json();if(!response.ok)throw new Error(value.error??'Content unavailable');return value
}
function Embedded({url,title,t,revision,onReload,toolbarHost,moduleId}:{toolbarHost?:HTMLDivElement|null;moduleId:string;url:string;title:string;t:RecipeModuleProps['t'];revision:number;onReload:()=>void}){
 return <><div className="pwb-content-toolbar"><ModuleAction target={toolbarHost}><button data-pwb-button type="button" aria-label={t('moduleReload')+': '+moduleId} onClick={onReload}>{t('moduleReload')}</button></ModuleAction><a href={url} target="_blank" rel="noopener noreferrer">{t('moduleOpen')}</a><small>{t('moduleEmbedHelp')}</small></div><iframe key={revision} className="pwb-content-frame" title={title} src={url} sandbox="allow-scripts allow-forms allow-popups" referrerPolicy="no-referrer"/></>
}
function FilePreview({file,title}:{file:{kind:string;content:string};title:string}){
 if(file.kind==='html')return <iframe className="pwb-content-frame" title={title} srcDoc={file.content} sandbox="allow-scripts" referrerPolicy="no-referrer"/>
 if(file.kind==='image')return <img className="pwb-content-image" alt={title} src={file.content}/>
 return <pre className="pwb-content-text">{file.content}</pre>
}
function ContentModule(props:RecipeModuleProps){
 const {module,preview,t,ctx}=props,[expanded,setExpanded]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[tick,setTick]=useState(0),[frameRevision,setFrameRevision]=useState(0),[path,setPath]=useState(''),[file,setFile]=useState<any>(null),[entries,setEntries]=useState<{name:string;path:string;directory:boolean}[]>([]),[requirement,setRequirement]=useState(String(module.config.requirement??'')),[waiting,setWaiting]=useState(false)
 const actionController=useRef<AbortController>(),conversationDetails=useRef<HTMLDetailsElement>(null)
 useEffect(()=>{const details=conversationDetails.current,show=()=>setExpanded(true);details?.addEventListener('pwb-reveal-role',show);return()=>details?.removeEventListener('pwb-reveal-role',show)},[module.type,module.config.mode,preview])
 const identity=JSON.stringify([props.appId,props.instanceId,props.recipe.workspace??null,contentIdentity(module)]),remote=['website','animation'].includes(module.type)||module.type==='custom'&&module.config.mode==='url'
 useEffect(()=>{actionController.current?.abort();setExpanded(false);setBusy(false);setPath('');setFile(null);setEntries([]);setRequirement(String(module.config.requirement??''));setWaiting(false);setError('')},[identity])
 useEffect(()=>()=>actionController.current?.abort(),[identity,path])
 useEffect(()=>{
  if(preview||remote)return
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
  const load=async()=>{try{
   const action=module.type==='resources'?'list':module.config.mode==='file'?'file':'artifact',value=await contentRequest(props,action,path,controller.signal)
   if(controller.signal.aborted)return;setError(value.error??'')
   if(action==='list'){setEntries(value.entries);setFile(null)}else{setFile(value.ready===false?null:value);setWaiting(value.pending===true)}
   if(action==='artifact'&&!controller.signal.aborted)timer=setTimeout(()=>{void load()},3000)
  }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:String(error))}}
  void load();return()=>{controller.abort();if(timer)clearTimeout(timer)}
 },[identity,preview,remote,path,tick])
 const open=async(child:string)=>{actionController.current?.abort();const controller=new AbortController();actionController.current=controller;setBusy(true);setError('');try{const file=await contentRequest(props,'file',child,controller.signal);if(!controller.signal.aborted)setFile(file)}catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:String(error))}finally{if(!controller.signal.aborted)setBusy(false)}}
 const prepare=async()=>{
  if(!ctx||!module.roleId)return;actionController.current?.abort();const controller=new AbortController();actionController.current=controller;setBusy(true);setError('')
  try{const tasks=ctx.get('personalWorkbenchTasks');if(!tasks)throw new Error(t('taskUnavailable'));const result=await contentRequest(props,'reserve',undefined,controller.signal);if(controller.signal.aborted)return
   tasks.prepare({generationRequestId:result.requestId,key:{appId:props.appId,instanceId:props.instanceId,roleId:module.roleId},skill:file&&result.previousPath?'workbench-page-adjust':'workbench-module-generate',source:{pageId:props.pageId,moduleId:module.id,label:module.title},task:requirement,context:[{id:'widget-output',label:module.title,source:props.appId+'/'+props.instanceId+'/'+module.id,text:'Build a self-contained HTML page for this module. Use inline CSS and JavaScript. Save the finished page at this exact absolute path: '+result.path+'\nPrevious output (preserve it): '+(result.previousPath??'none')+'\nRequest identity: '+result.requestId+'\nDo not replace other module artifacts. The workbench will load this file automatically. Do not change DSH or plugin source.'}]},{beforeSend:async()=>{const latest=await contentRequest(props,'begin',undefined,undefined,result.requestId);if(latest.requestId!==result.requestId)throw new Error('Generation target changed; prepare the task again')},onDiscard:async()=>{await contentRequest(props,'discard',undefined,undefined,result.requestId);setWaiting(false);setTick(value=>value+1)}})
   setExpanded(true);setTick(value=>value+1)
  }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:String(error))}finally{if(!controller.signal.aborted)setBusy(false)}
 }
 // Only an explicit refresh resets iframe state; reservation polling must keep it alive.
 const reload=()=>{setFrameRevision(value=>value+1);setTick(value=>value+1)}
 if(preview)return <p role="status">{t('modulePreview')}</p>
 const url=webAddress(module.config.url)
 return <div className="pwb-content-module">
 {remote?(url?<Embedded toolbarHost={props.toolbarHost} moduleId={module.id} url={url} title={module.title} t={t} revision={frameRevision} onReload={reload}/>:<p role="alert">{t('moduleUrl')}</p>):<>
 <div className="pwb-content-toolbar"><ModuleAction target={props.toolbarHost}><button data-pwb-button type="button" aria-label={t('moduleReload')+': '+module.id} disabled={busy} onClick={reload}>{t('moduleReload')}</button></ModuleAction>{module.type==='resources'&&<><button data-pwb-button type="button" disabled={!path||busy} onClick={()=>setPath(path.split('/').slice(0,-1).join('/'))}>{t('moduleUp')}</button><span>{path||t('moduleRoot')}</span></>}</div>
 {module.type==='resources'&&<ul className="pwb-resource-list">{entries.map(entry=><li key={entry.path}><button data-pwb-button type="button" disabled={busy} onClick={()=>{if(entry.directory)setPath(entry.path);else void open(entry.path)}}><span aria-hidden="true">{entry.directory?'▸':'·'}</span>{entry.name}</button></li>)}{!entries.length&&!error&&<li>{t('moduleEmpty')}</li>}</ul>}
 {module.type==='custom'&&module.config.mode==='generate'&&<>{file&&<p role="status">{t('moduleArtifactReady')}</p>}<ModuleSessionState {...props}/></>}
 {module.type==='custom'&&module.config.mode==='generate'&&<details ref={conversationDetails} className="pwb-custom-task" open={!file||expanded}><summary onClick={event=>{event.preventDefault();setExpanded(!conversationDetails.current?.open)}}>{t('moduleSourcegenerate')}</summary><p>{t('moduleGenerateHelp')}</p><label>{t('moduleRequirement')}<textarea aria-label={t('moduleRequirement')+': '+module.id} value={requirement} onChange={e=>setRequirement(e.target.value)} maxLength={2000}/></label><button data-pwb-button data-variant="primary" type="button" disabled={busy||!module.roleId||!requirement.trim()||!ctx?.get('personalWorkbenchTasks')} onClick={()=>{void prepare()}}>{t('modulePrepare')}</button>{!module.roleId&&<p role="alert">{t('taskMissingRole')}</p>}{ctx&&module.roleId&&props.taskEditorHost&&<PreparedTaskEditor ctx={ctx} bindingKey={{appId:props.appId,instanceId:props.instanceId,roleId:module.roleId}} label={props.recipe.roles.find(r=>r.id===module.roleId)?.name} t={t}/>}{props.taskEditorHost&&!props.recipe.pages.find(p=>p.id===props.pageId)?.modules.some(m=>m.type==='role-chat'&&m.roleId===module.roleId)&&props.renderFactorySlot&&<div style={{height:460,minHeight:0,marginTop:12}}>{props.renderFactorySlot('personal-workbench.role-conversation',{bindingKey:{appId:props.appId,instanceId:props.instanceId,roleId:module.roleId!},active:props.active??true,label:props.recipe.roles.find(r=>r.id===module.roleId)?.name},{fallback:<p role="alert">{t('taskUnavailable')}</p>})}</div>}</details>}
 {file?<FilePreview key={frameRevision} file={file} title={module.title}/>:module.type==='custom'&&!error&&<p role="status">{t(waiting?'moduleWaiting':'modulePending')}</p>}
 </>}{error&&<p role="alert">{error}</p>}</div>
}
export function installContentModules(){const removals=['website','custom','animation','resources'].map(type=>registerRecipeModuleRenderer(type,ContentModule));return()=>{for(const remove of removals)remove()}}
