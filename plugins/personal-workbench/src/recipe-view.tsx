import type { ComponentType } from 'react'
import type { AppRecipe,RecipeModule } from './recipe-api.ts'
export interface RecipeModuleProps { recipe:AppRecipe; module:RecipeModule; appId:string; instanceId:string; preview:boolean }
const renderers=new Map<string,ComponentType<RecipeModuleProps>>()
/** Renderers are installed code owned by plugins; recipes contain no executable source. */
export function registerRecipeModuleRenderer(id:string,view:ComponentType<RecipeModuleProps>):()=>void{if(renderers.has(id))throw new Error('Duplicate module renderer');renderers.set(id,view);return()=>{if(renderers.get(id)===view)renderers.delete(id)}}
export function RecipePage({recipe,pageId,appId,instanceId,preview=false,t}:{recipe:AppRecipe;pageId:string;appId:string;instanceId:string;preview?:boolean;t:(key:any)=>string}){
 const page=recipe.pages.find(p=>p.id===pageId);if(!page)return <p role="alert">{t('recipeMissingPage')}</p>
 return <div data-recipe-version={recipe.version} data-preview={preview} style={{display:'grid',gap:16,gridTemplateColumns:page.layout==='stack'?'1fr':'repeat(2,minmax(0,1fr))'}}>{page.modules.map(module=>{const View=renderers.get(module.type);return <section key={module.id}><h3>{module.title}</h3>{View?<View recipe={recipe} module={module} appId={appId} instanceId={instanceId} preview={preview}/>:['stats','list','detail','filter'].includes(module.type)?<p role="status">{t('recipeEmptyModule')}</p>:<p role="alert">{t('recipeMissingModule')}: {module.type}</p>}</section>})}</div>
}
