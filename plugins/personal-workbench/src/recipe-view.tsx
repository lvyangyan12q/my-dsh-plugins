import { useState } from 'react'
import { captureRecipeModuleContext } from './module-context.ts'
import { PreparedTaskEditor } from './task-view.tsx'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComponentType } from 'react'
import type { AppRecipe,RecipeModule } from './recipe-api.ts'
export interface RecipeModuleProps { recipe:AppRecipe; module:RecipeModule; appId:string; instanceId:string; preview:boolean; ctx?:Context; pageId:string; t:(key:any)=>string; renderFactorySlot?:PropsRenderFactories['renderFactorySlot'] }
const renderers=new Map<string,ComponentType<RecipeModuleProps>>()
/** Renderers are installed code owned by plugins; recipes contain no executable source. */
export function registerRecipeModuleRenderer(id:string,view:ComponentType<RecipeModuleProps>):()=>void{if(renderers.has(id))throw new Error('Duplicate module renderer');renderers.set(id,view);return()=>{if(renderers.get(id)===view)renderers.delete(id)}}
function RecipeModuleSection(props:RecipeModuleProps) {
 const [error,setError]=useState(''),{module,ctx,preview,t,appId,instanceId,pageId}=props,View=renderers.get(module.type)
 const prepare=()=>{try{
  const tasks=ctx?.get('personalWorkbenchTasks');if(!tasks)throw new Error(t('taskUnavailable'))
  const context=[...captureRecipeModuleContext(props)]
  tasks.prepare({key:{appId,instanceId,roleId:module.roleId!},task:String(module.config.taskPrompt),source:{pageId,moduleId:module.id,label:module.title},context});setError('')
 }catch(error){setError(error instanceof Error?error.message:String(error))}}
 return <section><h3>{module.title}</h3>{View?<View {...props}/>:['stats','list','detail','filter'].includes(module.type)?<p role="status">{t('recipeEmptyModule')}</p>:<p role="alert">{t('recipeMissingModule')}: {module.type}</p>}
 {!preview&&ctx&&module.roleId&&typeof module.config.taskPrompt==='string'&&module.config.taskPrompt.trim()&&<><button disabled={!ctx.get('personalWorkbenchTasks')} onClick={prepare}>{t('taskPrepared')}</button>{error&&<p role="alert">{error}</p>}<PreparedTaskEditor ctx={ctx} bindingKey={{appId,instanceId,roleId:module.roleId}} t={t}/></>}</section>
}
export function RecipePage({recipe,pageId,appId,instanceId,preview=false,t,ctx,renderFactorySlot}:{recipe:AppRecipe;pageId:string;appId:string;instanceId:string;preview?:boolean;t:(key:any)=>string;ctx?:Context;renderFactorySlot?:PropsRenderFactories['renderFactorySlot']}){
 const page=recipe.pages.find(p=>p.id===pageId);if(!page)return <p role="alert">{t('recipeMissingPage')}</p>
 return <div data-recipe-version={recipe.version} data-preview={preview} style={{display:'grid',gap:16,gridTemplateColumns:page.layout==='stack'?'1fr':'repeat(2,minmax(0,1fr))'}}>{page.modules.map(module=><RecipeModuleSection key={module.id} recipe={recipe} module={module} appId={appId} instanceId={instanceId} preview={preview} ctx={ctx} pageId={pageId} t={t} renderFactorySlot={renderFactorySlot}/>)}</div>
}
