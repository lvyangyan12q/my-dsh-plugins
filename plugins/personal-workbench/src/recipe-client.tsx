import type {Context} from '@deepseek-ai/cordis'
import type {Workbench} from './workbench.ts'
import type {WorkbenchAppId,WorkbenchAppProps} from './workbench-api.ts'
import type {RecipeRecord} from './recipe-api.ts'
import {recipeRequest} from './recipe-editor.tsx'
import {RecipePage} from './recipe-view.tsx'
export function installRecipeClient(ctx:Context,workbench:Workbench){
 const installed=new Map<string,{version:number;remove:()=>void}>();let disposed=false,tail=Promise.resolve()
 const refresh=()=>{const task=tail.catch(()=>{}).then(async()=>{const {recipes}=await recipeRequest({action:'catalog'});if(disposed)return;for(const record of recipes??[]){const recipe=record.running;if(!recipe||installed.get(recipe.appId)?.version===recipe.version)continue;if(!installed.has(recipe.appId)&&workbench.getSnapshot().definitions.some(d=>d.id===recipe.appId))throw new Error('Recipe application identity is already registered');installed.get(recipe.appId)?.remove();installed.delete(recipe.appId);const View=(props:WorkbenchAppProps&{t:(key:any)=>string})=><RecipePage recipe={recipe} pageId={props.pageId} appId={props.appId} instanceId={props.instanceId} t={props.t}/>;const removeView=ctx.slots.register({name:'personal-workbench.app',key:recipe.appId,locale:'personal-workbench'},View);try{const removeApp=workbench.registerApp({id:recipe.appId as WorkbenchAppId,version:String(recipe.version),name:recipe.name,icon:'layout-grid',source:'Workbench',pages:recipe.pages.map(p=>({id:p.id,label:p.label})),defaultLayout:{width:900,height:650,pageId:recipe.pages[0].id},roles:recipe.roles.map(r=>({id:r.id,name:r.name})),dependencies:recipe.pages.flatMap(p=>p.modules.map(m=>({id:m.type,available:true})))});installed.set(recipe.appId,{version:recipe.version,remove:()=>{removeApp();removeView()}})}catch(e){removeView();throw e}}});tail=task;return task}
 ctx.slots.inject('personal-workbench.app',()=>{void refresh().catch(()=>{});return()=>{disposed=true;for(const entry of installed.values())entry.remove();installed.clear()}})
 return refresh
}
