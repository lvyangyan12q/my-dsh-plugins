import {useSyncExternalStore,useState} from 'react'
import type {PropsRenderFactories} from '@deepseek-ai/dsh-client-ui-slots'
import type {Context} from '@deepseek-ai/cordis'
import type {Workbench} from './workbench.ts'
import type {WorkbenchAppDefinition,WorkbenchAppId,WorkbenchAppProps} from './workbench-api.ts'
import type {AppRecipe} from './recipe-api.ts'
import {recipeRequest} from './recipe-editor.tsx'
import {RuntimeModuleDialog} from './recipe-module-dialog.tsx'
import {displayCatalog,getDisplaySource} from './display-api.ts'
import type {RecipeDependency} from './recipe-api.ts'
import {RecipePage,recipeRendererCatalog} from './recipe-view.tsx'
const definition=(recipe:AppRecipe,host:RecipeDependency[]=[]):WorkbenchAppDefinition=>({id:recipe.appId as WorkbenchAppId,version:String(recipe.version),name:recipe.name,icon:'layout-grid',source:'Workbench',pages:recipe.pages.map(p=>({id:p.id,label:p.label})),defaultLayout:{width:900,height:650,pageId:recipe.pages[0].id},roles:recipe.roles.map(r=>({id:r.id,name:r.name})),dependencies:[...new Set(recipe.pages.flatMap(p=>p.modules.map(m=>m.type)))].map(type=>{const row=host.find(row=>row.id===type);const available=type==='empty'||recipeRendererCatalog.has(type);return row?.available===false?row:{id:type,available,...(!available?{reason:'Unavailable module renderer: '+type}:{})}}).concat(recipe.connections.map(connection=>{const row=host.find(row=>row.id==='connection:'+connection.id);const available=connection.sourceAppId===recipe.appId&&!!getDisplaySource(connection.sourceAppId,connection.resource);return row?.available===false?row:{id:'connection:'+connection.id,available,...(!available?{reason:'Unavailable data adapter: '+connection.id}:{})}}),recipe.roles.flatMap(role=>[{id:'agent:'+role.id},...role.skillNames.map(name=>({id:'skill:'+role.id+':'+name}))]).map(row=>host.find(dep=>dep.id===row.id)??{id:row.id,available:false,reason:'Host dependency status unavailable'}),host.filter(row=>row.id.startsWith('skill:')&&!recipe.roles.some(role=>role.skillNames.some(name=>row.id==='skill:'+role.id+':'+name))))})
export function installRecipeClient(ctx:Context,workbench:Workbench){
 const installed=new Map<string,{recipe:AppRecipe;host:RecipeDependency[];reproject:()=>void;update:(next:AppRecipe,host:RecipeDependency[])=>void;remove:()=>void}>();let disposed=false,tail=Promise.resolve()
 const refresh=()=>{const task=tail.catch(()=>{}).then(async()=>{
  const {recipes,dependencies}=await recipeRequest({action:'catalog'});if(disposed)return
  for(const record of recipes??[]){
   const recipe=record.running,existing=installed.get(record.appId)
   if(!recipe)continue
   const host=dependencies?.[record.appId]??[]
   if(existing){existing.update(recipe,host);continue}
   if(workbench.getSnapshot().definitions.some(d=>d.id===recipe.appId))throw new Error('Recipe application identity is already registered')
   let current=recipe
   const listeners=new Set<()=>void>(),subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},snapshot=()=>current
   // The slot component remains stable; recipe changes reconcile existing pages and modules.
   const View=(props:WorkbenchAppProps&Partial<PropsRenderFactories>&{t:(key:any)=>string})=>{
    const value=useSyncExternalStore(subscribe,snapshot,snapshot)
    const [target,setTarget]=useState<{appId:string;pageId:string;moduleId:string;changeContent:boolean}|null>(null)
    return <><RecipePage onEditModule={(pageId,moduleId,changeContent)=>setTarget({appId:props.appId,pageId,moduleId,changeContent})} recipe={value} active={props.active} pageId={props.pageId} appId={props.appId} instanceId={props.instanceId} t={props.t} ctx={ctx} renderFactorySlot={props.renderFactorySlot}/>{target&&<RuntimeModuleDialog target={target} t={props.t} refresh={refresh} onClose={()=>setTarget(null)}/>}</>
   }
   const removeView=ctx.slots.register({name:'personal-workbench.app',key:recipe.appId,locale:'personal-workbench'},View)
   try{
    const registration=workbench.registerApp(definition(recipe,host))
    const entry={recipe,host,reproject:()=>registration.update(definition(entry.recipe,entry.host)),update:(next:AppRecipe,host:RecipeDependency[])=>{entry.host=host;registration.update(definition(next,host));if(current.version!==next.version){current=next;entry.recipe=next;for(const listener of listeners)listener()}},remove:()=>{registration();removeView();listeners.clear()}}
    installed.set(recipe.appId,entry)
   }catch(e){removeView();throw e}
  }
 });tail=task;return task}
 ctx.slots.inject('personal-workbench.app',()=>{const changed=()=>{for(const entry of installed.values())entry.reproject()};const removeRenderers=recipeRendererCatalog.subscribe(changed),removeSources=displayCatalog.subscribe(changed);void refresh().catch(()=>{});return()=>{disposed=true;removeRenderers();removeSources();for(const entry of installed.values())entry.remove();installed.clear()}})
 return refresh
}
