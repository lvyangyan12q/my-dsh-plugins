import {useEffect,useMemo,useRef,useState} from 'react'
import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {MainPanelId} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {PropsRuntime} from '@deepseek-ai/dsh-client-ui-slots'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import {createViewTransport} from './client-runtime.ts'
import {KaogongStateContext,KaogongPresentationContext,KaogongViewState,KaogongViewStatePool} from './view-state.tsx'
import {KaogongTransportContext,KaogongServicesContext} from './view-context.tsx'
import {SdkClassroom,sdkLearningStyles} from './sdk-classroom.tsx'
import {KnowledgeLibrary} from './knowledge-reader.tsx'
import {MaterialImportPanel} from './materials-panel.tsx'
import {createStudyServices,studyRequest} from './study-client-services.ts'
import {openNativeStudySession} from './study-native-navigation.ts'
import type {StudySessionNavigation} from './study-native-navigation.ts'
import type {StudyDirectory,StudySelection,StudyViewProps} from './study-client-contracts.ts'

export {KaogongView} from './kaogong-view.tsx'
export type {KaogongViewProps,KaogongTeachingRequest,PracticeContext,PracticeResult} from './kaogong-view.tsx'
export {KaogongStateContext,KaogongPresentationContext,KaogongViewState,KaogongViewStatePool}
export const inject=['slots','layout','uiWorkspace','sidebarRight','sidebarRightTabs']
export const panelId='kaogong.learning' as MainPanelId
export const learningTabId='kaogong.learning-panel'

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {interface SidebarRightTabParamsMap {'kaogong-learning':StudySessionNavigation}}

type NativeStudyUI={open(target:StudySessionNavigation):Promise<void>;returnOverview():void}
type SurfaceProps={native?:NativeStudyUI;pool?:KaogongViewStatePool}
const lastProfileKey='kaogong/last-profile/v1'
function savedProfile(){try{return window.localStorage.getItem(lastProfileKey)}catch{return null}}
function rememberProfile(id:string){try{window.localStorage.setItem(lastProfileKey,id)}catch{/* Host selection remains authoritative. */}}

function LibraryContent({viewId}:{viewId:string}){const[revision,setRevision]=useState(0);return <section className="kg-sdk-classroom" aria-label="考公资料库"><style>{sdkLearningStyles}</style><header><strong>考公资料库</strong><small>私有资料保持原有来源与授权。</small></header><div className="kg-sdk-content"><MaterialImportPanel viewId={viewId} onApplied={()=>setRevision(value=>value+1)}/><KnowledgeLibrary key={revision} active/></div></section>}

export function ScopedStudyView(props:StudyViewProps&SurfaceProps&{sessionId?:string}){
  const localPool=useMemo(()=>props.pool??new KaogongViewStatePool(),[props.pool])
  useEffect(()=>()=>{if(!props.pool)localPool.dispose()},[localPool,props.pool])
  const state=localPool.forInstance(props.profile.id)
  const presentation=localPool.forView(props.profile.id,props.view.id+(props.sessionId?':'+props.sessionId:''))
  const transport=useMemo(()=>createViewTransport({instanceId:props.profile.id,viewId:props.view.id}),[props.profile.id,props.view.id])
  const services=useMemo(()=>createStudyServices(props.view.id,async sessionId=>{if(!props.native)throw new Error('原生课堂导航暂不可用');await props.native.open({sessionId,profileId:props.profile.id,viewId:props.view.id})}),[props.view.id,props.profile.id,props.native])
  if(props.view.profileId!==props.profile.id||props.profile.id==='default')return <p role="alert">学习视图归属不符</p>
  return <KaogongStateContext.Provider value={state}><KaogongPresentationContext.Provider value={presentation}><KaogongTransportContext.Provider value={transport}><KaogongServicesContext.Provider value={services}>{props.profile.kind==='library'?<LibraryContent viewId={props.view.id}/>:<SdkClassroom {...props} roles={props.roles??services.roles} tasks={props.tasks??services.tasks} onReturn={()=>{localPool.forView(props.profile.id,props.view.id).cell('study.page',null).set('overview');props.native?.returnOverview()}}/>}</KaogongServicesContext.Provider></KaogongTransportContext.Provider></KaogongPresentationContext.Provider></KaogongStateContext.Provider>
}

/** Opening the panel reads existing profiles; profile creation is an explicit confirmation. */
export function StudyDashboard({native,pool}:SurfaceProps){
  const [directory,setDirectory]=useState<StudyDirectory>({profiles:[],views:[]}),[selection,setSelection]=useState<StudySelection|null>(null)
  const [title,setTitle]=useState('我的备考档案'),[kind,setKind]=useState<'learner'|'library'>('learner'),[creating,setCreating]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true)
  const ownedPool=useMemo(()=>pool??new KaogongViewStatePool(),[pool]),alive=useRef(true),locked=useRef(false)
  useEffect(()=>()=>{if(!pool)ownedPool.dispose()},[ownedPool,pool])
  useEffect(()=>{alive.current=true;const controller=new AbortController();void studyRequest<StudyDirectory>(undefined,controller.signal).then(value=>{if(controller.signal.aborted)return;setDirectory(value);const preferred=savedProfile()??value.lastProfileId,profile=value.profiles.find(row=>row.id===preferred)??value.profiles.find(row=>row.kind==='learner');const view=profile&&value.views.find(row=>row.profileId===profile.id);if(profile&&view)setSelection({profile,view})}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>{alive.current=false;controller.abort()}},[])
  const change=async(body:Record<string,unknown>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError('');try{const value=await studyRequest<StudySelection>(body);if(!alive.current)return;if(value.view.profileId!==value.profile.id)throw new Error('档案视图归属不匹配');setSelection(value);setCreating(false);rememberProfile(value.profile.id);setDirectory(current=>({profiles:[...current.profiles.filter(row=>row.id!==value.profile.id),value.profile],views:[...current.views.filter(row=>row.id!==value.view.id),value.view],lastProfileId:value.profile.id}))}catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'档案操作失败')}finally{locked.current=false;if(alive.current)setBusy(false)}}
  return <section aria-label="考公学习" className="kg-study-dashboard"><style>{sdkLearningStyles}</style>{loading?<p role="status">正在读取备考档案…</p>:<><details><summary>备考档案设置</summary><label>当前档案<select aria-label="备考档案" value={selection?.profile.id??''} disabled={busy} onChange={event=>void change({action:'open',profileId:event.target.value})}><option value="">选择备考档案</option>{directory.profiles.map(row=><option key={row.id} value={row.id}>{row.title}{row.kind==='library'?' · 资料库':''}</option>)}</select></label><button disabled={busy} onClick={()=>setCreating(true)}>新建备考档案或资料库</button></details>{(!selection||creating)&&<form onSubmit={event=>{event.preventDefault();void change({action:'create',title,kind,confirmed:true})}}><h2>创建备考档案</h2><p>确认后保存档案。考试目标和学习计划可稍后设置。</p><label>名称<input aria-label="备考档案名称" value={title} maxLength={200} disabled={busy} onChange={event=>setTitle(event.target.value)}/></label><label>用途<select aria-label="档案用途" value={kind} disabled={busy} onChange={event=>setKind(event.target.value as 'learner'|'library')}><option value="learner">个人备考</option><option value="library">只读资料库</option></select></label><button disabled={busy||!title.trim()} type="submit">确认创建备考档案</button>{selection&&<button type="button" onClick={()=>setCreating(false)}>取消</button>}</form>}{selection&&!creating&&<ScopedStudyView key={selection.profile.id+':'+selection.view.id} {...selection} native={native} pool={ownedPool}/>}</>}{error&&<p role="alert">{error}</p>}</section>
}

type LearningTabProps=PropsRuntime<'sidebar.right.pane.tab'>&SurfaceProps
export function StudyLearningTab(props:LearningTabProps){
  const info=props.useTabInfo(),params=info.tab.navigation.params
  const [selection,setSelection]=useState<StudySelection|null>(null),[error,setError]=useState('')
  const target=params&&'profileId'in params?params:null
  useEffect(()=>{setSelection(null);setError('');const abort=new AbortController();if(params!==undefined&&(!target||target.sessionId!==props.sessionId)){setError('学习面板与原生会话归属不符');return()=>abort.abort()}
    const stop=()=>abort.abort();info.tab.signal.addEventListener('abort',stop,{once:true})
    void studyRequest<StudySelection>({action:'session-context',...(target?{viewId:target.viewId}:{}),sessionId:props.sessionId},abort.signal).then(value=>{if(abort.signal.aborted)return;if(value.view.profileId!==value.profile.id||target&&(value.profile.id!==target.profileId||value.view.id!==target.viewId))throw new Error('学习档案与原生会话归属不符');setSelection(value)}).catch(cause=>{if(!abort.signal.aborted)setError(cause.message)})
    return()=>{abort.abort();info.tab.signal.removeEventListener('abort',stop)}
  },[params===undefined,target?.profileId,target?.viewId,target?.sessionId,props.sessionId,info.tab.signal])
  if(error)return <p role="alert">{error}</p>
  return selection?<ScopedStudyView {...selection} native={props.native} pool={props.pool} panel sessionId={props.sessionId}/>:<p role="status">正在核对学习档案…</p>
}

/** Register only public Native seats. The existing Native Conversation remains untouched. */
export function apply(ctx:Context){
  const pool=new KaogongViewStatePool();let navigation=new AbortController()
  const native:NativeStudyUI={open:target=>{navigation.abort();navigation=new AbortController();return openNativeStudySession({uiWorkspace:{openSession:id=>ctx.uiWorkspace.openSession(id as SessionId)},sidebarRight:{mounted:ctx.sidebarRight.mounted,openTab:(_kind,options)=>ctx.sidebarRight.openTab('kaogong-learning',options)}},target,navigation.signal)},returnOverview:()=>ctx.layout.selectPanel(panelId)}
  ctx.effect(function*(){
    yield ctx.sidebarRightTabs.register({id:learningTabId,kind:'kaogong-learning',title:()=> '考公学习',keepMounted:true})
    yield ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:panelId,inject:()=>({native,pool})},StudyDashboard))
    yield ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:panelId,order:20,label:()=> '考公学习'},()=> <span aria-hidden="true">考</span>))
    yield ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:learningTabId,inject:()=>({native,pool})},StudyLearningTab))
    yield ()=>{navigation.abort();pool.dispose()}
  },'kaogong standalone Native learning surfaces')
}

export const KaogongDashboard=StudyDashboard
export const KaogongApplicationView=ScopedStudyView
export const KaogongLibraryView=ScopedStudyView
export const KaogongWorkbenchContent=StudyDashboard
