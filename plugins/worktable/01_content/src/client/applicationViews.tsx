import {describeProtocol} from '../sdk.mjs'
import {TaskPanel,createTaskFacade} from './taskPanel'
import {RolePanel,createRoleFacade} from './rolePanel'
import {MigrationPanel} from './migrationPanel'
import {Component,useMemo,useSyncExternalStore,type ComponentType,type ReactNode} from 'react'

export type ApplicationViewProps={application:{id:string;title:string;kind:'deep';views:{id:string;title:string}[]};instance:{id:string;appId:string;projectId:string|null;revision:number};view:{id:string;instanceId:string;type:string};roles?:ReturnType<typeof createRoleFacade>;tasks?:ReturnType<typeof createTaskFacade>}

/** Trusted plugin service. Applications own components, state and data; no host context is passed. */
class ApplicationViews {
  describe=describeProtocol
  private entries=new Map<string,Record<string,ComponentType<ApplicationViewProps>>>()
  private listeners=new Set<()=>void>()
  private revision=0
  subscribe=(notify:()=>void)=>{this.listeners.add(notify);return ()=>{this.listeners.delete(notify)}}
  getSnapshot=()=>this.revision
  private changed(){this.revision++;for(const notify of this.listeners)notify()}
  register(appId:string,views:Record<string,ComponentType<ApplicationViewProps>>){
    if(!/^[a-z][a-z0-9.-]{0,79}$/.test(appId)||!views?.page||Object.entries(views).some(([id,view])=>!/^[a-z][a-z0-9.-]{0,79}$/.test(id)||typeof view!=='function'))throw new Error('应用视图定义无效。')
    if(this.entries.has(appId))throw new Error('应用视图已经注册。')
    const owned={...views};this.entries.set(appId,owned);this.changed()
    return ()=>{if(this.entries.get(appId)===owned){this.entries.delete(appId);this.changed()}}
  }
  resolve(appId:string,type:string){return this.entries.get(appId)?.[type]}
}
export const applicationViews=new ApplicationViews()
class ViewBoundary extends Component<{children:ReactNode},{error:boolean}>{
  state={error:false}
  static getDerivedStateFromError(){return {error:true}}
  render(){return this.state.error?<p role="alert">应用视图运行失败，请刷新视图重试；实例记录保留。</p>:this.props.children}
}
export function DeepApplicationView(props:ApplicationViewProps&{reloadKey:number}){
  useSyncExternalStore(applicationViews.subscribe,applicationViews.getSnapshot,applicationViews.getSnapshot)
  const roles=useMemo(()=>createRoleFacade(props.instance.id),[props.instance.id])
  const tasks=useMemo(()=>createTaskFacade(props.view.id),[props.view.id])
  const View=applicationViews.resolve(props.application.id,props.view.type)
  if(!props.application.views.some(view=>view.id===props.view.type)||!View)return <p role="alert">应用视图暂不可用，请启用应用插件后重试；实例记录保留。</p>
  return <ViewBoundary key={props.view.id+':'+props.reloadKey}><div style={{height:"100%",display:"flex",flexDirection:"column",minHeight:0}}><RolePanel key={props.instance.id} instanceId={props.instance.id}/><MigrationPanel key={props.view.id+':migration'} viewId={props.view.id}/><TaskPanel key={props.view.id} viewId={props.view.id} instanceId={props.instance.id}/><div style={{flex:1,minHeight:0,overflow:"auto"}}><View application={props.application} instance={props.instance} view={props.view} roles={roles} tasks={tasks}/></div></div></ViewBoundary>
}
