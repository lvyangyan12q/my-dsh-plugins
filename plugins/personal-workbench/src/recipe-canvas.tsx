import {PageTemplates} from './page-template-view.tsx'
import {ColumnDivider} from './column-divider.tsx'
import {useState} from 'react'
import {CanvasPaneHeader} from './canvas-pane-header.tsx'
import {Globe,MessageSquare,Folder,Film,Sparkles,BarChart3,Settings,Expand,ArrowLeft,ArrowRight,X,Plus} from 'lucide-react'
import type {AppRecipe,RecipeModule} from './recipe-api.ts'
import {RecipeModuleEditor} from './recipe-module-editor.tsx'
import {recipeCanvasStyles} from './recipe-canvas-styles.ts'

type Change=(update:(recipe:AppRecipe)=>void)=>void
const choices=[['website',Globe],['custom',Sparkles],['role-chat',MessageSquare],['resources',Folder],['animation',Film],['stats',BarChart3],['chart',BarChart3],['map',Globe]] as const
export function emptyModule():RecipeModule{return{id:'module.'+crypto.randomUUID(),type:'empty',title:'',config:{}}}
export function createCanvasRecipe(appId:string,layout:AppRecipe['pages'][number]['layout'],t:(key:any)=>string):AppRecipe{
 return{schemaVersion:1,appId,version:1,name:t('recipeNewName'),description:'',pages:[{id:'home',label:t('recipeHome'),layout,modules:Array.from({length:layout==='grid'?4:layout==='stack'?3:2},emptyModule)}],connections:[],roles:[]}
}
export function RecipeCanvas({recipe,change,t}:{recipe:AppRecipe;change:Change;t:(key:any)=>string}){
 const [selectedPage,setPage]=useState(recipe.pages[0]?.id),[selected,setSelected]=useState<string|null>(null),[focused,setFocused]=useState<string|null>(null),[pageSettings,setPageSettings]=useState(false)
 const pageIndex=Math.max(0,recipe.pages.findIndex(page=>page.id===selectedPage)),page=recipe.pages[pageIndex]
 if(!page)return null
 const choose=(moduleId:string,type:string)=>{change(copy=>{const module=copy.pages[pageIndex].modules.find(m=>m.id===moduleId)!;module.type=type;module.title=t('recipeModule'+type);module.config=type==='custom'?{mode:'generate'}:{};delete module.connectionId;delete module.roleId});setSelected(moduleId)}
 const move=(moduleId:string,direction:number)=>change(copy=>{const modules=copy.pages[pageIndex].modules,index=modules.findIndex(m=>m.id===moduleId),next=index+direction;if(next>=0&&next<modules.length)[modules[index],modules[next]]=[modules[next],modules[index]]})
 const clear=(moduleId:string)=>{change(copy=>{const module=copy.pages[pageIndex].modules.find(m=>m.id===moduleId)!;module.type='empty';module.title='';module.config={};delete module.connectionId;delete module.roleId});setSelected(null)}
 const closeSettings=()=>{setSelected(null);setFocused(null)}
 const card=(module:RecipeModule,index:number)=>{
  const Icon=choices.find(([type])=>type===module.type)?.[1]??BarChart3,open=selected===module.id
  return <section key={module.id} className={'pwb-canvas-pane'+(open?' is-selected':'')+(focused===module.id?' is-focused':'')} data-module-id={module.id}>
   <CanvasPaneHeader identity={JSON.stringify([recipe.appId,page.id])} moduleId={module.id} onMove={target=>change(copy=>{const modules=copy.pages[pageIndex].modules,start=modules.findIndex(m=>m.id===module.id),end=modules.findIndex(m=>m.id===target);if(start>=0&&end>=0&&start!==end){const [item]=modules.splice(start,1);modules.splice(end,0,item)}})}><strong>{module.title||t('modulePane')+' '+(index+1)}</strong><div className="pwb-canvas-pane-actions">
    <button data-pwb-button type="button" title={t('canvasMoveBefore')} aria-label={t('canvasMoveBefore')+': '+module.id} disabled={index===0} onClick={()=>move(module.id,-1)}><ArrowLeft size={14}/></button>
    <button data-pwb-button type="button" title={t('canvasMoveAfter')} aria-label={t('canvasMoveAfter')+': '+module.id} disabled={index===page.modules.length-1} onClick={()=>move(module.id,1)}><ArrowRight size={14}/></button>
    {module.type!=='empty'&&<><button data-pwb-button type="button" title={t('canvasChangeContent')} aria-label={t('canvasChangeContent')+': '+module.id} onClick={()=>clear(module.id)}><Plus size={14}/></button><button data-pwb-button type="button" title={t('canvasConfigure')} aria-label={t('canvasConfigure')+': '+module.id} aria-expanded={open} onClick={()=>setSelected(open?null:module.id)}><Settings size={14}/></button></>}
    <button data-pwb-button type="button" title={t('canvasFocus')} aria-label={t('canvasFocus')+': '+module.id} aria-pressed={focused===module.id} onClick={()=>{setFocused(focused===module.id?null:module.id);setSelected(module.id)}}><Expand size={14}/></button>
    <button data-pwb-button type="button" title={t('moduleRemove')} aria-label={t('moduleRemove')+': '+module.id} onClick={()=>{change(copy=>{copy.pages[pageIndex].modules=copy.pages[pageIndex].modules.filter(m=>m.id!==module.id)});if(open)closeSettings()}}><X size={14}/></button>
   </div></CanvasPaneHeader>
   {module.type==='empty'?<div className="pwb-canvas-picker"><p>{t('canvasChooseContent')}</p><div>{choices.map(([type,ChoiceIcon])=><button data-pwb-button key={type} type="button" aria-label={t('recipeModule'+type)+': '+module.id} onClick={()=>choose(module.id,type)}><ChoiceIcon size={22}/><span>{t('recipeModule'+type)}</span></button>)}</div></div>:<>
    <div className="pwb-canvas-summary"><Icon size={25}/><strong>{t('recipeModule'+module.type)}</strong><span>{String(module.config.url??module.config.path??module.config.basePath??module.config.requirement??'')||t('canvasConfigureHelp')}</span>
     {module.connectionId&&<small>{t('recipeSource')}: {recipe.connections.find(c=>c.id===module.connectionId)?.resource}</small>}{module.roleId&&<small>{t('recipeTaskRole')}: {recipe.roles.find(r=>r.id===module.roleId)?.name}</small>}
    </div>
    {open&&<div className="pwb-canvas-settings"><RecipeModuleEditor recipe={recipe} pageIndex={pageIndex} moduleId={module.id} change={change} t={t}/><button data-pwb-button data-variant="primary" type="button" aria-label={t('canvasDone')+': '+module.id} onClick={closeSettings}>{t('canvasDone')}</button></div>}
   </>}
  </section>
 }
 return <section className="pwb-recipe-canvas" aria-label={t('canvasTitle')}><style>{recipeCanvasStyles}</style>
  <div className="pwb-canvas-toolbar"><nav aria-label={t('canvasPages')}>{recipe.pages.map(p=><button data-pwb-button type="button" key={p.id} aria-pressed={p.id===page.id} onClick={()=>{setPage(p.id);closeSettings();setPageSettings(false)}}>{p.label}</button>)}<button data-pwb-button type="button" onClick={()=>{const id='page.'+crypto.randomUUID();change(copy=>copy.pages.push({id,label:t('recipeHome')+' '+(copy.pages.length+1),layout:'split',modules:[emptyModule(),emptyModule()]}));setPage(id);closeSettings()}}><Plus size={14}/>{t('recipeAddPage')}</button></nav><button data-pwb-button type="button" aria-expanded={pageSettings} onClick={()=>setPageSettings(!pageSettings)}>{t('canvasPageSettings')}</button></div>
  {pageSettings&&<div className="pwb-canvas-page-settings"><label>{t('recipePageLabel')}<input aria-label={t('recipePageLabel')+': '+page.id} value={page.label} onChange={event=>change(copy=>{copy.pages[pageIndex].label=event.target.value})}/></label><label>{t('recipeLayout')}<select aria-label={t('recipeLayout')+': '+page.id} value={page.layout} onChange={event=>change(copy=>{copy.pages[pageIndex].layout=event.target.value as typeof page.layout})}>{(['grid','split','stack'] as const).map(layout=><option key={layout} value={layout}>{t('recipeLayout'+layout)}</option>)}</select></label></div>}
  <PageTemplates key={page.id} recipe={recipe} page={page} change={change} onPage={id=>{setPage(id);closeSettings()}} t={t}/>
  <p className="pwb-canvas-help">{t('canvasHelp')}</p>
  <div style={{position:'relative'}}>
  {page.layout!=='stack'&&page.modules.length>1&&<ColumnDivider label={t('canvasResizeColumns')} value={page.splitPercent??50} onChange={value=>change(copy=>{copy.pages[pageIndex].splitPercent=value})}/>}
  <div className="pwb-canvas-grid" data-layout={page.layout} style={{gridTemplateColumns:page.layout==='stack'?undefined:(page.splitPercent??50)+'fr '+(100-(page.splitPercent??50))+'fr'}}>{page.modules.map(card)}</div></div><button className="pwb-canvas-add" data-pwb-button type="button" onClick={()=>change(copy=>{copy.pages[pageIndex].modules.push(emptyModule())})}><Plus size={18}/>{t('moduleAdd')}</button>
 </section>
}
