import type {AppRecipe} from './recipe-api.ts'
type Layout=AppRecipe['pages'][number]['layout']
export const starterLayouts:readonly Layout[]=['grid','split','stack']
/** Layout-first starters are data only: no sample records, borrowed data, or role sessions. */
export function createStarterRecipe(appId:string,layout:Layout,t:(key:any)=>string):AppRecipe{
 const types=layout==='split'?['filter','list','detail'] as const:['stats','list'] as const
 return {schemaVersion:1,appId,version:1,name:t('recipeNewName'),description:'',pages:[{id:'home',label:t('recipeHome'),layout,modules:types.map(type=>({id:'home.'+type,type,title:t('recipeModule'+type),config:{}}))}],connections:[],roles:[]}
}
export function LayoutThumbnail({layout}:{layout:Layout}){
 return <span className="pwb-layout-thumbnail" data-layout={layout} aria-hidden="true">{Array.from({length:layout==='grid'?4:layout==='stack'?3:2},(_,index)=><span key={index}/>)}</span>
}
export function RecipeStarterPicker({layout,onLayout,disabled,t}:{layout:Layout;onLayout:(layout:Layout)=>void;disabled:boolean;t:(key:any)=>string}){
 return <section className="pwb-starter-picker" aria-label={t('recipeStarterTitle')}><h3>{t('recipeStarterTitle')}</h3><p>{t('recipeStarterHelp')}</p><div className="pwb-template-grid">{starterLayouts.map(value=><button key={value} type="button" data-pwb-button aria-label={t('recipeStarter'+value)} aria-pressed={layout===value} disabled={disabled} onClick={()=>onLayout(value)}><LayoutThumbnail layout={value}/><strong>{t('recipeStarter'+value)}</strong><small>{t('recipeStarterHelp'+value)}</small></button>)}</div></section>
}
