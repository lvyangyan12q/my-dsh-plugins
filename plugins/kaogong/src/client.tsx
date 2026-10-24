import {useMemo} from 'react'
import type {Context} from '@deepseek-ai/cordis'
import {requireProtocol} from 'dsh-worktable/sdk'
import type {ApplicationViewProps} from 'dsh-worktable/sdk'
import {createViewTransport} from './client-runtime.ts'
import {KaogongStateContext,KaogongPresentationContext,KaogongViewState,KaogongViewStatePool} from './view-state.tsx'
import {KaogongTransportContext,KaogongServicesContext} from './view-context.tsx'
import {SdkClassroom,sdkLearningStyles} from './sdk-classroom.tsx'
import {KnowledgeLibrary} from './knowledge-reader.tsx'

export {KaogongView} from './kaogong-view.tsx'
export type {KaogongViewProps,KaogongTeachingRequest,PracticeContext,PracticeResult} from './kaogong-view.tsx'
export {KaogongStateContext,KaogongPresentationContext,KaogongViewState,KaogongViewStatePool}
export const inject=['worktableApplicationViews']

type ViewProps=ApplicationViewProps&{state?:KaogongViewState;presentation?:KaogongViewState}
function ScopedView(props:ViewProps&{library?:boolean}){
  const state=useMemo(()=>props.state??new KaogongViewState(props.instance.id),[props.state,props.instance.id])
  const presentation=useMemo(()=>props.presentation??new KaogongViewState(props.instance.id,props.view.id),[props.presentation,props.instance.id,props.view.id])
  const transport=useMemo(()=>createViewTransport({instanceId:props.instance.id,viewId:props.view.id}),[props.instance.id,props.view.id])
  const services=useMemo(()=>({roles:props.roles,tasks:props.tasks}),[props.roles,props.tasks])
  if(state.instanceId!==props.instance.id||presentation.instanceId!==props.instance.id||presentation.viewId!==props.view.id)return <p role="alert">学习视图状态归属不符；未读取其他实例。</p>
  return <KaogongStateContext.Provider value={state}><KaogongPresentationContext.Provider value={presentation}><KaogongTransportContext.Provider value={transport}><KaogongServicesContext.Provider value={services}>
    {props.library?<section className="kg-sdk-classroom" aria-label="考公资料库"><style>{sdkLearningStyles}</style><header><strong>考公资料库</strong><small>来源资料只读展示；学习笔记、成绩和老师会话不在此共享。</small></header><div className="kg-sdk-content"><KnowledgeLibrary active/></div></section>:<SdkClassroom key={props.view.id} {...props}/>}
  </KaogongServicesContext.Provider></KaogongTransportContext.Provider></KaogongPresentationContext.Provider></KaogongStateContext.Provider>
}
function owned(props:ViewProps,id:string){return props.application.id===id&&props.instance.appId===id&&props.view.instanceId===props.instance.id&&props.instance.id!=='default'}
export function KaogongApplicationView(props:ViewProps){return owned(props,'kaogong')?<ScopedView {...props}/>:<p role="alert">考公需要工作台提供的明确实例和视图；旧 default 未自动接管。</p>}
export function KaogongLibraryView(props:ViewProps){return owned(props,'kaogong-library')?<ScopedView {...props} library/>:<p role="alert">资料库实例归属不符；未读取全局资料。</p>}

/** No sidebar replacement, native renderer factory, Session context or old workbench runtime. */
export function apply(ctx:Context){
  requireProtocol(ctx.worktableApplicationViews.describe(),['instance-view-v1','instance-role-v1','prepared-task-v1'])
  const pool=new KaogongViewStatePool()
  const learning=(props:ApplicationViewProps)=><KaogongApplicationView {...props} state={pool.forInstance(props.instance.id)} presentation={pool.forView(props.instance.id,props.view.id)}/>
  const library=(props:ApplicationViewProps)=><KaogongLibraryView {...props} state={pool.forInstance(props.instance.id)} presentation={pool.forView(props.instance.id,props.view.id)}/>
  const removeLearning=ctx.worktableApplicationViews.register('kaogong',{page:learning,classroom:learning,practice:learning,errors:learning,materials:learning,plan:learning})
  let removeLibrary:()=>void|Promise<void>
  try{removeLibrary=ctx.worktableApplicationViews.register('kaogong-library',{page:library,materials:library})}
  catch(error){void removeLearning();pool.dispose();throw error}
  ctx.effect(()=>async()=>{try{await removeLibrary()}finally{try{await removeLearning()}finally{pool.dispose()}}},'kaogong public application views')
}

/** Frozen source-era launchers do not issue unscoped reads/writes from the new installed bundle. */
export function KaogongDashboard(){return <p role="status">请从工作台应用目录打开考公学习；旧独立入口已冻结，原记录保留。</p>}
export const KaogongWorkbenchContent=KaogongDashboard
