import {useSyncExternalStore} from 'react'
import {contentTypes} from './content-catalog.ts'
import {recipeRendererCatalog} from './recipe-view.tsx'
export function useApplicationModules(appId?:string){useSyncExternalStore(recipeRendererCatalog.subscribe,recipeRendererCatalog.getSnapshot,recipeRendererCatalog.getSnapshot);return recipeRendererCatalog.entries(appId).filter(row=>!contentTypes.some(type=>type===row.id))}
export function moduleChoiceTitle(type:string,appId:string,t:(key:any)=>string){return recipeRendererCatalog.entries(appId).find(row=>row.id===type)?.title??t('recipeModule'+type)}
