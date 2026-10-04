import {AnnotationLayer} from './annotation-view.tsx'
import {ColumnDivider} from './column-divider.tsx'
import { useState,useEffect,useRef } from 'react'
import {recipePageStyles} from './recipe-page-styles.ts'
import { captureRecipeModuleContext } from './module-context.ts'
import { PreparedTaskEditor } from './task-view.tsx'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComponentType } from 'react'
import type { AppRecipe,RecipeModule } from './recipe-api.ts'
export interface RecipeModuleProps { toolbarHost?:HTMLDivElement|null; onEditModule?:(pageId:string,moduleId:string,changeContent:boolean)=>void; placement?:number; focused?:boolean; onFocus?:()=>void; active?:boolean; recipe:AppRecipe; module:RecipeModule; appId:string; instanceId:string; preview:boolean; taskEditorHost?:boolean; ctx?:Context; pageId:string; t:(key:any)=>string; renderFactorySlot?:PropsRenderFactories['renderFactorySlot'] }
const renderers=new Map<string,ComponentType<RecipeModuleProps>>()
/** Renderers are installed code owned by plugins; recipes contain no executable source. */
export function registerRecipeModuleRenderer(id:string,view:ComponentType<RecipeModuleProps>):()=>void{if(renderers.has(id))throw new Error('Duplicate module renderer');renderers.set(id,view);return()=>{if(renderers.get(id)===view)renderers.delete(id)}}
function RecipeModuleSection(props:RecipeModuleProps) {
 const [toolbarHost,setToolbarHost]=useState<HTMLDivElement|null>(null)
 const [error,setError]=useState(''),{module,ctx,preview,t,appId,instanceId,pageId}=props,View=renderers.get(module.type)
 const prepare=()=>{try{
  const tasks=ctx?.get('personalWorkbenchTasks');if(!tasks)throw new Error(t('taskUnavailable'))
  const context=[...captureRecipeModuleContext(props)]
  tasks.prepare({key:{appId,instanceId,roleId:module.roleId!},...(module.config.taskSkill==='workbench-data-display'?{skill:'workbench-data-display' as const}:{}),task:String(module.config.taskPrompt),source:{pageId,moduleId:module.id,label:module.title},context});setError('')
 }catch(error){setError(error instanceof Error?error.message:String(error))}}
 return <section className="pwb-recipe-module" data-module-type={module.type} data-module-id={module.id} data-module-focused={props.focused?'true':undefined} style={{order:props.placement,...(props.focused?{position:'absolute' as const,inset:props.preview?0:'44px 0 0',zIndex:5,background:'var(--pwb-paper,#fdfcf9)',padding:16,overflow:'auto'}:{}),display:'flex',flexDirection:'column',minWidth:0,minHeight:module.type==='role-chat'?0:undefined,overflow:module.type==='role-chat'?'hidden':undefined}}><header className="pwb-module-heading"><h3>{module.title||t(module.type==='empty'?'recipeModuleempty':'modulePane')}</h3><div ref={setToolbarHost} className="pwb-module-toolbar">{!preview&&props.onEditModule&&<><button data-pwb-button type="button" aria-label={t('canvasChangeContent')+': '+module.id} onClick={()=>props.onEditModule!(pageId,module.id,true)}>{t('canvasChangeContent')}</button><button data-pwb-button type="button" aria-label={t('canvasConfigure')+': '+module.id} onClick={()=>props.onEditModule!(pageId,module.id,false)}>{t('canvasConfigure')}</button></>}{props.onFocus&&<button data-pwb-button type="button" aria-label={t(props.focused?'canvasRestore':'canvasFocus')+': '+module.id} aria-pressed={!!props.focused} onClick={props.onFocus}>{t(props.focused?'canvasRestore':'canvasFocus')}</button>}</div></header>{module.type==='empty'?<p role="status">{t('canvasEmptyRuntime')}</p>:View?<View {...props} toolbarHost={toolbarHost}/>:['stats','list','detail','filter'].includes(module.type)?<p role="status">{t('recipeEmptyModule')}</p>:<p role="alert">{t('recipeMissingModule')}: {module.type}</p>}
 {!preview&&ctx&&module.roleId&&typeof module.config.taskPrompt==='string'&&module.config.taskPrompt.trim()&&<><button data-pwb-button disabled={!ctx.get('personalWorkbenchTasks')} onClick={prepare}>{t('taskPrepared')}</button>{error&&<p role="alert">{error}</p>}</>}
 {!preview&&ctx&&module.roleId&&props.taskEditorHost&&module.type!=='role-chat'&&module.type!=='custom'&&<PreparedTaskEditor ctx={ctx} bindingKey={{appId,instanceId,roleId:module.roleId}} label={props.recipe.roles.find(role=>role.id===module.roleId)?.name} t={t}/>}</section>
}
function KeptRecipePage({recipe,pageId,appId,instanceId,preview=false,t,ctx,renderFactorySlot,active=true,onEditModule}:{onEditModule?:RecipeModuleProps['onEditModule'];active?:boolean;recipe:AppRecipe;pageId:string;appId:string;instanceId:string;preview?:boolean;t:(key:any)=>string;ctx?:Context;renderFactorySlot?:PropsRenderFactories['renderFactorySlot']}){
 const canvas=useRef<HTMLDivElement>(null)
 const preferenceKey=JSON.stringify(['pwb-page-layout',appId,instanceId,pageId,recipe.version])
 const readPreference=()=>{try{const stored=JSON.parse(globalThis.localStorage?.getItem(preferenceKey)??'null');return {ratio:typeof stored?.ratio==='number'&&stored.ratio>=20&&stored.ratio<=80?stored.ratio:undefined,focus:typeof stored?.focus==='string'?stored.focus:null}}catch{return {ratio:undefined,focus:null}}}
 const [preference,setPreference]=useState(readPreference)
 useEffect(()=>{setPreference(readPreference())},[preferenceKey])
 const updatePreference=(next:typeof preference)=>{setPreference(next);if(!preview)try{globalThis.localStorage?.setItem(preferenceKey,JSON.stringify(next))}catch{}}
 const page=recipe.pages.find(p=>p.id===pageId);if(!page)return <p role="alert">{t('recipeMissingPage')}</p>
 // One editor per role on the visible page, preferring its native chat module.
 // The draft remains in the role store when a different page becomes visible.
 const editorHosts=new Map<string,string>()
 for(const module of page.modules)if(module.roleId&&module.type==='custom'&&module.config.mode==='generate'&&!editorHosts.has(module.roleId))editorHosts.set(module.roleId,module.id)
 for(const module of page.modules)if(module.roleId&&module.type==='role-chat'&&!editorHosts.has(module.roleId))editorHosts.set(module.roleId,module.id)
 for(const module of page.modules)if(module.roleId&&!editorHosts.has(module.roleId))editorHosts.set(module.roleId,module.id)
 const conversationOnly=page.modules.length===1&&page.modules[0].type==='role-chat'
 const ratio=preference.ratio??page.splitPercent??50
 return <div ref={canvas} style={{position:'relative',display:'flex',flexDirection:'column',minWidth:0,height:'100%'}}><style>{recipePageStyles}</style>{!preview&&<AnnotationLayer canvas={canvas} recipe={recipe} pageId={pageId} instanceId={instanceId} ctx={ctx} active={active} t={t} onRevealRole={()=>updatePreference({...preference,focus:null})}/>} {!preview&&page.layout!=='stack'&&page.modules.length>1&&!preference.focus&&<div className="pwb-recipe-resize"><span>{t('canvasResizeColumns')}</span><ColumnDivider label={t('canvasResizeColumns')} value={ratio} onChange={value=>updatePreference({...preference,ratio:value})}/></div>}<div className="pwb-recipe-page" data-layout={page.layout} data-recipe-version={recipe.version} data-preview={preview} style={{display:'grid',flex:1,width:'100%',height:preview?undefined:'calc(100% - 44px)',minWidth:0,minHeight:0,overflow:'auto',gap:16,gridTemplateColumns:page.layout==='stack'||page.modules.length===1?'minmax(0,1fr)':'minmax(0,'+ratio+'fr) minmax(0,'+(100-ratio)+'fr)',gridAutoRows:conversationOnly?'minmax(0,1fr)':page.modules.some(module=>module.type==='role-chat')?'minmax(440px,auto)':'auto',alignContent:conversationOnly?'stretch':'start'}}>{[...page.modules].sort((a,b)=>a.id.localeCompare(b.id)).map(module=><RecipeModuleSection onEditModule={onEditModule} placement={page.modules.findIndex(item=>item.id===module.id)} focused={preference.focus===module.id} onFocus={preview?undefined:()=>updatePreference({...preference,focus:preference.focus===module.id?null:module.id})} active={active} key={module.id} recipe={recipe} module={module} appId={appId} instanceId={instanceId} preview={preview} taskEditorHost={!!module.roleId&&editorHosts.get(module.roleId)===module.id} ctx={ctx} pageId={pageId} t={t} renderFactorySlot={renderFactorySlot}/>)}</div></div>
}

export function RecipePage(props:Parameters<typeof KeptRecipePage>[0]){
 const [visited,setVisited]=useState<Set<string>>(()=>new Set([props.pageId]))
 useEffect(()=>{setVisited(old=>old.has(props.pageId)?old:new Set([...old,props.pageId]))},[props.pageId])
 const visible=new Set([...visited,props.pageId])
 return <>{props.recipe.pages.filter(page=>visible.has(page.id)).map(page=><div key={page.id} data-recipe-page={page.id} hidden={page.id!==props.pageId} style={{minWidth:0,minHeight:0,width:'100%',height:'100%',flex:'1 1 0%'}}><KeptRecipePage {...props} pageId={page.id} active={page.id===props.pageId}/></div>)}</>
}
