import { useState } from 'react'
import {recipePageStyles} from './recipe-page-styles.ts'
import { captureRecipeModuleContext } from './module-context.ts'
import { PreparedTaskEditor } from './task-view.tsx'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComponentType } from 'react'
import type { AppRecipe,RecipeModule } from './recipe-api.ts'
export interface RecipeModuleProps { recipe:AppRecipe; module:RecipeModule; appId:string; instanceId:string; preview:boolean; taskEditorHost?:boolean; ctx?:Context; pageId:string; t:(key:any)=>string; renderFactorySlot?:PropsRenderFactories['renderFactorySlot'] }
const renderers=new Map<string,ComponentType<RecipeModuleProps>>()
/** Renderers are installed code owned by plugins; recipes contain no executable source. */
export function registerRecipeModuleRenderer(id:string,view:ComponentType<RecipeModuleProps>):()=>void{if(renderers.has(id))throw new Error('Duplicate module renderer');renderers.set(id,view);return()=>{if(renderers.get(id)===view)renderers.delete(id)}}
function RecipeModuleSection(props:RecipeModuleProps) {
 const [error,setError]=useState(''),{module,ctx,preview,t,appId,instanceId,pageId}=props,View=renderers.get(module.type)
 const prepare=()=>{try{
  const tasks=ctx?.get('personalWorkbenchTasks');if(!tasks)throw new Error(t('taskUnavailable'))
  const context=[...captureRecipeModuleContext(props)]
  tasks.prepare({key:{appId,instanceId,roleId:module.roleId!},...(module.config.taskSkill==='workbench-data-display'?{skill:'workbench-data-display' as const}:{}),task:String(module.config.taskPrompt),source:{pageId,moduleId:module.id,label:module.title},context});setError('')
 }catch(error){setError(error instanceof Error?error.message:String(error))}}
 return <section className="pwb-recipe-module" data-module-type={module.type} style={{display:'flex',flexDirection:'column',minWidth:0,minHeight:module.type==='role-chat'?0:undefined,overflow:module.type==='role-chat'?'hidden':undefined}}><h3 style={{flexShrink:0}}>{module.title||t(module.type==='empty'?'recipeModuleempty':'modulePane')}</h3>{module.type==='empty'?<p role="status">{t('canvasEmptyRuntime')}</p>:View?<View {...props}/>:['stats','list','detail','filter'].includes(module.type)?<p role="status">{t('recipeEmptyModule')}</p>:<p role="alert">{t('recipeMissingModule')}: {module.type}</p>}
 {!preview&&ctx&&module.roleId&&typeof module.config.taskPrompt==='string'&&module.config.taskPrompt.trim()&&<><button data-pwb-button disabled={!ctx.get('personalWorkbenchTasks')} onClick={prepare}>{t('taskPrepared')}</button>{error&&<p role="alert">{error}</p>}</>}
 {!preview&&ctx&&module.roleId&&props.taskEditorHost&&module.type!=='role-chat'&&module.type!=='custom'&&<PreparedTaskEditor ctx={ctx} bindingKey={{appId,instanceId,roleId:module.roleId}} label={props.recipe.roles.find(role=>role.id===module.roleId)?.name} t={t}/>}</section>
}
export function RecipePage({recipe,pageId,appId,instanceId,preview=false,t,ctx,renderFactorySlot}:{recipe:AppRecipe;pageId:string;appId:string;instanceId:string;preview?:boolean;t:(key:any)=>string;ctx?:Context;renderFactorySlot?:PropsRenderFactories['renderFactorySlot']}){
 const page=recipe.pages.find(p=>p.id===pageId);if(!page)return <p role="alert">{t('recipeMissingPage')}</p>
 // One editor per role on the visible page, preferring its native chat module.
 // The draft remains in the role store when a different page becomes visible.
 const editorHosts=new Map<string,string>()
 for(const module of page.modules)if(module.roleId&&module.type==='custom'&&module.config.mode==='generate'&&!editorHosts.has(module.roleId))editorHosts.set(module.roleId,module.id)
 for(const module of page.modules)if(module.roleId&&module.type==='role-chat'&&!editorHosts.has(module.roleId))editorHosts.set(module.roleId,module.id)
 for(const module of page.modules)if(module.roleId&&!editorHosts.has(module.roleId))editorHosts.set(module.roleId,module.id)
 const conversationOnly=page.modules.length===1&&page.modules[0].type==='role-chat'
 return <><style>{recipePageStyles}</style><div className="pwb-recipe-page" data-layout={page.layout} data-recipe-version={recipe.version} data-preview={preview} style={{display:'grid',flex:1,width:'100%',height:preview?undefined:'100%',minWidth:0,minHeight:0,overflow:'auto',gap:16,gridTemplateColumns:page.layout==='stack'||page.modules.length===1?'minmax(0,1fr)':'repeat(auto-fit,minmax(min(100%,max(320px,calc((100% - 16px)/2))),1fr))',gridAutoRows:conversationOnly?'minmax(0,1fr)':page.modules.some(module=>module.type==='role-chat')?'minmax(440px,auto)':'auto',alignContent:conversationOnly?'stretch':'start'}}>{page.modules.map(module=><RecipeModuleSection key={module.id} recipe={recipe} module={module} appId={appId} instanceId={instanceId} preview={preview} taskEditorHost={!!module.roleId&&editorHosts.get(module.roleId)===module.id} ctx={ctx} pageId={pageId} t={t} renderFactorySlot={renderFactorySlot}/>)}</div></>
}
