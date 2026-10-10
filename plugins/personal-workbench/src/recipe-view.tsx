import {isDataModuleType} from './content-catalog.ts'
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
export interface RecipeModuleProps { conversationHost?:boolean; onViewRole?:()=>void; toolbarHost?:HTMLDivElement|null; onEditModule?:(pageId:string,moduleId:string,changeContent:boolean)=>void; placement?:number; focused?:boolean; onFocus?:()=>void; active?:boolean; recipe:AppRecipe; module:RecipeModule; appId:string; instanceId:string; preview:boolean; taskEditorHost?:boolean; ctx?:Context; pageId:string; t:(key:any)=>string; renderFactorySlot?:PropsRenderFactories['renderFactorySlot'] }
const renderers=new Map<string,ComponentType<RecipeModuleProps>>()
export interface RecipeModuleDescriptor { title:string; appIds?:readonly string[] }
const descriptors=new Map<string,RecipeModuleDescriptor>()
let rendererRevision=0
const rendererListeners=new Set<()=>void>()
const renderersChanged=()=>{rendererRevision++;for(const listener of rendererListeners)listener()}
const allowed=(id:string,appId?:string)=>!descriptors.get(id)?.appIds||(!!appId&&descriptors.get(id)!.appIds!.includes(appId))
export const recipeRendererCatalog={has:(id:string,appId?:string)=>renderers.has(id)&&(appId===undefined||allowed(id,appId)),getSnapshot:()=>rendererRevision,entries:(appId?:string)=>[...descriptors].filter(([id])=>allowed(id,appId)).map(([id,descriptor])=>({id,...descriptor})),subscribe:(listener:()=>void)=>{rendererListeners.add(listener);return()=>{rendererListeners.delete(listener)}}}
/** Renderers are installed code owned by plugins; recipes contain no executable source. */
export function registerRecipeModuleRenderer(id:string,view:ComponentType<RecipeModuleProps>,descriptor?:RecipeModuleDescriptor):()=>void{
 if(renderers.has(id))throw new Error('Duplicate module renderer')
 if(descriptor&&(!descriptor.title.trim()||descriptor.title.length>300||descriptor.appIds&&(!descriptor.appIds.length||descriptor.appIds.some(appId=>typeof appId!=='string'||!appId))))throw new Error('Invalid module descriptor')
 renderers.set(id,view);if(descriptor)descriptors.set(id,Object.freeze({title:descriptor.title,...(descriptor.appIds?{appIds:Object.freeze([...descriptor.appIds])}:{})}));renderersChanged();let active=true
 return()=>{if(active&&renderers.get(id)===view){active=false;renderers.delete(id);descriptors.delete(id);renderersChanged()}}
}
function DataRoleConversation(props:RecipeModuleProps){
 const [opened,setOpened]=useState(false),[visited,setVisited]=useState(false),surface=useRef<HTMLDivElement>(null)
 useEffect(()=>{const node=surface.current,show=()=>{setOpened(true);setVisited(true)};node?.addEventListener('pwb-show-role',show);return()=>node?.removeEventListener('pwb-show-role',show)},[])
 const role=props.recipe.roles.find(role=>role.id===props.module.roleId)
 if(!role)return <p role="alert">{props.t('taskMissingRole')}</p>
 return <div ref={surface} data-pwb-data-role><button data-pwb-button type="button" aria-expanded={props.conversationHost?opened:undefined} onClick={()=>{if(props.conversationHost){setVisited(true);setOpened(!opened)}else props.onViewRole?.()}}>{props.t('moduleRoleConversation')}</button>{props.conversationHost&&visited&&<div hidden={!opened} style={{height:460,minHeight:0,marginTop:12}}>{props.renderFactorySlot?.('personal-workbench.role-conversation',{bindingKey:{appId:props.appId,instanceId:props.instanceId,roleId:role.id},active:props.active!==false&&opened,label:role.name,expectedPresetId:role.presetId},{fallback:<p role="alert">{props.t('taskUnavailable')}</p>})??<p role="alert">{props.t('taskUnavailable')}</p>}</div>}</div>
}
function RecipeModuleSection(props:RecipeModuleProps) {
 const [toolbarHost,setToolbarHost]=useState<HTMLDivElement|null>(null)
 const [error,setError]=useState(''),{module,ctx,preview,t,appId,instanceId,pageId}=props,View=allowed(module.type,appId)?renderers.get(module.type):undefined
 const prepare=()=>{try{
  const tasks=ctx?.get('personalWorkbenchTasks');if(!tasks)throw new Error(t('taskUnavailable'))
  const context=[...captureRecipeModuleContext(props)]
  tasks.prepare({key:{appId,instanceId,roleId:module.roleId!},...(module.config.taskSkill==='workbench-data-display'?{skill:'workbench-data-display' as const}:{}),task:String(module.config.taskPrompt),source:{pageId,moduleId:module.id,label:module.title},context});setError('')
 }catch(error){setError(error instanceof Error?error.message:String(error))}}
 return <section className="pwb-recipe-module" data-module-type={module.type} data-module-id={module.id} data-module-focused={props.focused?'true':undefined} style={{order:props.placement,...(props.focused?{position:'absolute' as const,inset:props.preview?0:'44px 0 0',zIndex:5,background:'var(--pwb-paper,#fdfcf9)',padding:16,overflow:'auto'}:{}),display:'flex',flexDirection:'column',minWidth:0,minHeight:module.type==='role-chat'?0:undefined,overflow:module.type==='role-chat'?'hidden':undefined}}><header className="pwb-module-heading"><h3>{module.title||t(module.type==='empty'?'recipeModuleempty':'modulePane')}</h3><div ref={setToolbarHost} className="pwb-module-toolbar">{!preview&&props.onEditModule&&<><button data-pwb-button type="button" aria-label={t('canvasChangeContent')+': '+module.id} onClick={()=>props.onEditModule!(pageId,module.id,true)}>{t('canvasChangeContent')}</button><button data-pwb-button type="button" aria-label={t('canvasConfigure')+': '+module.id} onClick={()=>props.onEditModule!(pageId,module.id,false)}>{t('canvasConfigure')}</button></>}{props.onFocus&&<button data-pwb-button type="button" aria-label={t(props.focused?'canvasRestore':'canvasFocus')+': '+module.id} aria-pressed={!!props.focused} onClick={props.onFocus}>{t(props.focused?'canvasRestore':'canvasFocus')}</button>}</div></header>{module.type==='empty'?<p role="status">{t('canvasEmptyRuntime')}</p>:View?<View {...props} toolbarHost={toolbarHost}/>:['stats','list','detail','filter'].includes(module.type)?<p role="status">{t('recipeEmptyModule')}</p>:<p role="alert">{t('recipeMissingModule')}: {module.type}</p>}
 {!preview&&ctx&&module.roleId&&typeof module.config.taskPrompt==='string'&&module.config.taskPrompt.trim()&&<><button data-pwb-button disabled={!ctx.get('personalWorkbenchTasks')} onClick={prepare}>{t('taskPrepared')}</button>{error&&<p role="alert">{error}</p>}</>}
 {!preview&&module.roleId&&isDataModuleType(module.type)&&<DataRoleConversation {...props}/>}
 {!preview&&ctx&&module.roleId&&props.taskEditorHost&&module.type!=='role-chat'&&module.type!=='custom'&&<PreparedTaskEditor ctx={ctx} bindingKey={{appId,instanceId,roleId:module.roleId}} label={props.recipe.roles.find(role=>role.id===module.roleId)?.name} t={t}/>}</section>
}
function KeptRecipePage({recipe,pageId,appId,instanceId,preview=false,t,ctx,renderFactorySlot,active=true,onEditModule,onSelectPage,onViewRole,conversationHosts}:{onSelectPage?:(pageId:string)=>void;onViewRole?:(pageId:string,moduleId:string)=>void;conversationHosts?:Map<string,{pageId:string;moduleId:string}>;onEditModule?:RecipeModuleProps['onEditModule'];active?:boolean;recipe:AppRecipe;pageId:string;appId:string;instanceId:string;preview?:boolean;t:(key:any)=>string;ctx?:Context;renderFactorySlot?:PropsRenderFactories['renderFactorySlot']}){
 const canvas=useRef<HTMLDivElement>(null)
 const preferenceKey=JSON.stringify(['pwb-page-layout',appId,instanceId,pageId,recipe.version])
 const readPreference=()=>{try{const stored=JSON.parse(globalThis.localStorage?.getItem(preferenceKey)??'null');return {ratio:typeof stored?.ratio==='number'&&stored.ratio>=20&&stored.ratio<=80?stored.ratio:undefined,focus:typeof stored?.focus==='string'?stored.focus:null}}catch{return {ratio:undefined,focus:null}}}
 const [preference,setPreference]=useState(readPreference)
 useEffect(()=>{setPreference(readPreference())},[preferenceKey])
 const updatePreference=(next:typeof preference)=>{setPreference(next);if(!preview)try{globalThis.localStorage?.setItem(preferenceKey,JSON.stringify(next))}catch{}}
 useEffect(()=>{const node=canvas.current,show=()=>updatePreference({...preference,focus:null});node?.addEventListener('pwb-show-role',show);return()=>node?.removeEventListener('pwb-show-role',show)},[preference,pageId])
 const page=recipe.pages.find(p=>p.id===pageId);if(!page)return <p role="alert">{t('recipeMissingPage')}</p>
 // One editor per role on the visible page, preferring its native chat module.
 // The draft remains in the role store when a different page becomes visible.
 const editorHosts=new Map<string,string>()
 for(const module of page.modules)if(module.roleId&&module.type==='custom'&&module.config.mode==='generate'&&!editorHosts.has(module.roleId))editorHosts.set(module.roleId,module.id)
 for(const module of page.modules)if(module.roleId&&module.type==='role-chat'&&!editorHosts.has(module.roleId))editorHosts.set(module.roleId,module.id)
 for(const module of page.modules)if(module.roleId&&!editorHosts.has(module.roleId))editorHosts.set(module.roleId,module.id)
 const conversationOnly=page.modules.length===1&&page.modules[0].type==='role-chat'
 const ratio=preference.ratio??page.splitPercent??50
 return <div ref={canvas} className="pwb-recipe-canvas" style={{position:'relative',display:'flex',flexDirection:'column',minWidth:0,height:'100%'}}><style>{recipePageStyles}</style>{!preview&&<AnnotationLayer canvas={canvas} recipe={recipe} pageId={pageId} instanceId={instanceId} ctx={ctx} active={active} t={t} onRevealRole={()=>updatePreference({...preference,focus:null})}/>} {!preview&&page.layout!=='stack'&&page.modules.length>1&&!preference.focus&&<div className="pwb-recipe-resize"><span>{t('canvasResizeColumns')}</span><ColumnDivider label={t('canvasResizeColumns')} value={ratio} onChange={value=>updatePreference({...preference,ratio:value})}/></div>}<div className="pwb-recipe-page" data-layout={page.layout} data-recipe-version={recipe.version} data-preview={preview} data-conversation-only={conversationOnly} style={{display:'grid',flex:1,width:'100%',height:preview?undefined:'calc(100% - 44px)',minWidth:0,minHeight:0,overflow:'auto',gap:16,gridTemplateColumns:page.layout==='stack'||page.modules.length===1?'minmax(0,1fr)':'minmax(0,'+ratio+'fr) minmax(0,'+(100-ratio)+'fr)',gridAutoRows:conversationOnly?'minmax(0,1fr)':page.modules.some(module=>module.type==='role-chat')?'minmax(440px,auto)':'auto',alignContent:conversationOnly?'stretch':'start'}}>{[...page.modules].sort((a,b)=>a.id.localeCompare(b.id)).map(module=><RecipeModuleSection onEditModule={onEditModule} placement={page.modules.findIndex(item=>item.id===module.id)} focused={preference.focus===module.id} onFocus={preview?undefined:()=>updatePreference({...preference,focus:preference.focus===module.id?null:module.id})} active={active} key={module.id} recipe={recipe} module={module} appId={appId} instanceId={instanceId} preview={preview} taskEditorHost={!!module.roleId&&editorHosts.get(module.roleId)===module.id} ctx={ctx} pageId={pageId} t={t} conversationHost={!!module.roleId&&conversationHosts?.get(module.roleId)?.moduleId===module.id&&conversationHosts?.get(module.roleId)?.pageId===pageId} onViewRole={()=>{const host=module.roleId&&conversationHosts?.get(module.roleId);if(host)onViewRole?.(host.pageId,host.moduleId)}} renderFactorySlot={renderFactorySlot}/>)}</div></div>
}

export function RecipePage(props:Parameters<typeof KeptRecipePage>[0]){
 const [reveal,setReveal]=useState<{pageId:string;moduleId:string}|null>(null),surface=useRef<HTMLDivElement>(null)
 const conversationHosts=new Map<string,{pageId:string;moduleId:string}>()
 for(const kind of ['role-chat','generate','data'])for(const page of props.recipe.pages)for(const module of page.modules){if(!module.roleId||conversationHosts.has(module.roleId))continue;if(kind==='role-chat'?module.type==='role-chat':kind==='generate'?module.type==='custom'&&module.config.mode==='generate':isDataModuleType(module.type))conversationHosts.set(module.roleId,{pageId:page.id,moduleId:module.id})}
 const showRole=(pageId:string,moduleId:string)=>{setReveal({pageId,moduleId});if(pageId!==props.pageId)props.onSelectPage?.(pageId)}
 useEffect(()=>{if(!reveal||reveal.pageId!==props.pageId)return;const page=[...surface.current?.querySelectorAll<HTMLElement>('[data-recipe-page]')??[]].find(node=>node.dataset.recipePage===reveal.pageId),module=[...page?.querySelectorAll<HTMLElement>('[data-module-id]')??[]].find(node=>node.dataset.moduleId===reveal.moduleId);if(module){const Event=module.ownerDocument.defaultView!.Event;module.querySelector('[data-pwb-data-role]')?.dispatchEvent(new Event('pwb-show-role'));page?.querySelector('.pwb-recipe-canvas')?.dispatchEvent(new Event('pwb-show-role'));for(const details of module.querySelectorAll('details')){details.open=true;details.dispatchEvent(new Event('pwb-reveal-role'))}module.querySelector('[data-pwb-role-key]')?.dispatchEvent(new Event('pwb-reveal-role'));module.scrollIntoView?.({block:'nearest'})}setReveal(null)},[reveal,props.pageId])
 const [visited,setVisited]=useState<Set<string>>(()=>new Set([props.pageId]))
 useEffect(()=>{setVisited(old=>old.has(props.pageId)?old:new Set([...old,props.pageId]))},[props.pageId])
 const visible=new Set([...visited,props.pageId])
 return <div ref={surface} style={{display:'contents'}}>{props.recipe.pages.filter(page=>visible.has(page.id)).map(page=><div key={page.id} data-recipe-page={page.id} hidden={page.id!==props.pageId} style={{minWidth:0,minHeight:0,width:'100%',height:'100%',flex:'1 1 0%'}}><KeptRecipePage {...props} conversationHosts={conversationHosts} onViewRole={showRole} pageId={page.id} active={props.active!==false&&page.id===props.pageId}/></div>)}</div>
}
