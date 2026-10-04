import type {AppRecipe,RecipeModule} from './recipe-api.ts'
export interface PageTemplate {id:string;label:string;page:AppRecipe['pages'][number]}
const presentationFields=['valueField','latitudeField','longitudeField'] as const
/** Templates are structures, never a clone of an application's runtime or private configuration. */
export function capturePageTemplate(id:string,label:string,page:AppRecipe['pages'][number]):PageTemplate{
 return {id,label,page:{id:'template-page',label:page.label,layout:page.layout,...(page.splitPercent===undefined?{}:{splitPercent:page.splitPercent}),modules:page.modules.map((module,index)=>{
  const config:RecipeModule['config']={}
  for(const field of presentationFields)if(typeof module.config[field]==='string')config[field]=module.config[field]
  if(module.type==='custom')config.mode='generate'
  if(module.connectionId||module.config.requiresConnection===true||['chart','map','stats','list','filter','detail'].includes(module.type))config.requiresConnection=true
  if(module.roleId||module.config.requiresRole===true||module.type==='role-chat'||module.type==='custom')config.requiresRole=true
  return {id:'slot.'+index,title:module.title,type:module.type,config}
 })}}
}
/** New identities force rebinding in the destination; the source template remains unchanged. */
export function instantiatePageTemplate(template:PageTemplate):AppRecipe['pages'][number]{
 const page=structuredClone(template.page);page.id='page.'+crypto.randomUUID()
 for(const module of page.modules)module.id='module.'+crypto.randomUUID()
 return page
}
