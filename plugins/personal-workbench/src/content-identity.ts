import type {RecipeModule} from './recipe-api.ts'
/** Display titles do not own artifacts; content, role and module identity do. */
export function contentIdentity(module:RecipeModule){const {title,...identity}=module;return JSON.stringify(identity)}
export function matchesContentIdentity(saved:string,module:RecipeModule){
 try{const parsed:unknown=JSON.parse(saved),legacy=Array.isArray(parsed)&&parsed.length===2?parsed[1]:parsed
  if(!legacy||typeof legacy!=='object'||Array.isArray(legacy))return false
  return contentIdentity(legacy as RecipeModule)===contentIdentity(module)
 }catch{return false}
}
