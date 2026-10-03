import {useEffect,useState,useSyncExternalStore} from 'react'
import {RecipeConnections} from './recipe-connections.tsx'
import {displayCatalog,listRecipeTemplates} from './display-api.ts'
import {isRecipeForm} from './recipe-form.ts'
import {RecipeRolesEditor} from './recipe-role-editor.tsx'
import type {AppRecipe,RecipeRecord,RecipeRequest} from './recipe-api.ts'
import {RecipePage} from './recipe-view.tsx'
import {GenerationEditor} from './generation-editor.tsx'
import {recipeEditorStyles} from './recipe-editor-styles.ts'
import {RecipeStarterPicker,LayoutThumbnail} from './recipe-starters.tsx'
import {createCanvasRecipe,RecipeCanvas} from './recipe-canvas.tsx'

export async function recipeRequest(request:RecipeRequest){
 const response=await fetch('/api/personal-workbench/recipes',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(request)})
 const value=await response.json();if(!response.ok)throw new Error(value.error??'Recipe request failed')
 return value as {recipes?:RecipeRecord[];record?:RecipeRecord;recipe?:AppRecipe;workspaces?:string[]}
}
export function RecipeEditor({t,refresh}:{t:(key:any)=>string;refresh:()=>Promise<void>}){
 useSyncExternalStore(displayCatalog.subscribe,displayCatalog.getSnapshot,displayCatalog.getSnapshot)
 const [records,setRecords]=useState<RecipeRecord[]>([]),[selected,setSelected]=useState(''),[text,setText]=useState(''),[preview,setPreview]=useState<AppRecipe|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[previewPage,setPreviewPage]=useState(''),[generating,setGenerating]=useState(false),[starterLayout,setStarterLayout]=useState<AppRecipe['pages'][number]['layout']>('grid')
 const [workspaces,setWorkspaces]=useState<string[]>([]),[workspaceError,setWorkspaceError]=useState('')
 const locked=busy||generating,row=records.find(record=>record.appId===selected)
 const load=async()=>{const data=await recipeRequest({action:'catalog'});setRecords(data.recipes??[])}
 useEffect(()=>{void load().catch(error=>setError(String(error.message)))},[])
 useEffect(()=>{let live=true;void recipeRequest({action:'workspaces'}).then(data=>{if(live)setWorkspaces(data.workspaces??[])}).catch(error=>{if(live)setWorkspaceError(String(error.message))});return()=>{live=false}},[])
 let edited:AppRecipe|undefined;try{const parsed:unknown=JSON.parse(text);if(isRecipeForm(parsed))edited=parsed}catch{}
 const select=(recipe:AppRecipe)=>{setSelected(recipe.appId);setText(JSON.stringify(recipe,null,2));setPreview(null);setError('')}
 const change=(update:(recipe:AppRecipe)=>void)=>{if(!edited)return;const copy=structuredClone(edited);update(copy);setText(JSON.stringify(copy,null,2));setPreview(null)}
 const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action()}catch(error){setError(error instanceof Error?error.message:String(error))}finally{setBusy(false)}}
 const saved=!!row&&JSON.stringify(row.draft,null,2)===text
 const save=()=>run(async()=>{const recipe:unknown=JSON.parse(text);if(!isRecipeForm(recipe))throw new Error(t('recipeInvalidConfiguration'));if(recipe.appId!==selected)throw new Error(t('recipeIdentityFixed'));const data=await recipeRequest({action:'save',expectedRevision:row?.revision??0,recipe});setText(JSON.stringify(data.record!.draft,null,2));setPreview(null);await load()})
 const templateButtons=()=>listRecipeTemplates().map(template=><button className="pwb-plugin-template" data-pwb-button key={template.id} disabled={locked} onClick={()=>{void run(async()=>{const recipe=await template.create();const existing=records.find(record=>record.appId===recipe.appId);recipe.version=Math.max(recipe.version,(existing?.running?.version??0)+1);select(recipe)})}}><LayoutThumbnail layout="grid"/><span>{template.label}</span></button>)
 return <><style>{recipeEditorStyles}</style><details className="pwb-recipe-editor"><summary>{t('recipeEditor')}</summary><p className="pwb-recipe-help">{t('recipeDraftHelp')}</p>
 {!text&&<RecipeStarterPicker layout={starterLayout} onLayout={setStarterLayout} disabled={locked} t={t}/>}
 <div className="pwb-recipe-toolbar"><button data-pwb-button type="button" disabled={locked} onClick={()=>select(createCanvasRecipe('app.'+crypto.randomUUID(),starterLayout,t))}>{t('recipeCreate')}</button><select aria-label={t('recipeSelect')} value={selected} disabled={locked} onChange={event=>{const record=records.find(record=>record.appId===event.target.value);setSelected(event.target.value);setText(record?JSON.stringify(record.draft,null,2):'');setPreview(null);setError('')}}><option value="">{t('recipeSelect')}</option>{records.map(record=><option key={record.appId} value={record.appId}>{record.draft.name} · {record.revision}</option>)}</select></div>
 {listRecipeTemplates().length>0&&<details className="pwb-template-switch"><summary>{t('recipePluginTemplates')}</summary><div className="pwb-template-grid">{templateButtons()}</div></details>}
 <details className="pwb-generation-disclosure" open={!text||generating}><summary>{t('generationTitle')}</summary><GenerationEditor t={t} target={{appId:selected||'app.'+crypto.randomUUID(),version:Math.max(edited?.version??1,(row?.running?.version??0)+1),expectedRevision:row?.revision??0}} onBusy={setGenerating} onDraft={async record=>{select(record.draft);await load()}}/></details>
 {edited&&<fieldset className="pwb-canvas-editing" disabled={locked}><label>{t('recipeName')}<input aria-label={t('recipeName')} value={edited.name} onChange={event=>change(recipe=>{recipe.name=event.target.value})}/></label><label>{t('workspaceRoot')}<select aria-label={t('workspaceRoot')} value={edited.workspace??''} onChange={event=>change(recipe=>{if(event.target.value)recipe.workspace=event.target.value;else delete recipe.workspace})}><option value="">{t('canvasDefaultWorkspace')}</option>{edited.workspace&&!workspaces.includes(edited.workspace)&&<option value={edited.workspace}>{edited.workspace} · {t('displayUnavailable')}</option>}{workspaces.map(path=><option key={path} value={path}>{path}</option>)}</select></label>{workspaceError&&<p role="alert">{workspaceError}</p>}<small>{t('canvasWorkspaceHelp')}</small><RecipeCanvas key={selected} recipe={edited} change={change} t={t}/></fieldset>}
 {text&&<><details className="pwb-recipe-advanced"><summary>{t('recipeAdvanced')}</summary>
 {edited&&<fieldset disabled={locked}><label>{t('recipeDescription')}<input aria-label={t('recipeDescription')} value={edited.description} onChange={event=>change(recipe=>{recipe.description=event.target.value})}/></label><label>{t('recipeVersion')}<input type="number" min="1" aria-label={t('recipeVersion')} value={edited.version} onChange={event=>change(recipe=>{recipe.version=Number(event.target.value)})}/></label><details><summary>{t('recipeConnections')}</summary><RecipeConnections recipe={edited} change={change} t={t}/></details><details><summary>{t('recipeRolesStep')}</summary><RecipeRolesEditor recipe={edited} change={change} t={t}/></details></fieldset>}
 <label>{t('recipeConfiguration')}<textarea aria-label={t('recipeConfiguration')} style={{display:'block',width:'100%',minHeight:280}} value={text} disabled={locked} onChange={event=>{setText(event.target.value);setPreview(null)}}/></label></details>
 <nav className="pwb-recipe-navigation" aria-label={t('recipeStepNavigation')}><button data-pwb-button data-variant="primary" disabled={locked} onClick={()=>{void save()}}>{t('recipeSave')}</button><button data-pwb-button disabled={locked||!saved} onClick={()=>{void run(async()=>{const data=await recipeRequest({action:'preview',appId:selected,expectedRevision:row!.revision});setPreview(data.recipe!);setPreviewPage(data.recipe!.pages[0].id)})}}>{t('recipePreview')}</button><button data-pwb-button data-variant="primary" disabled={locked||!saved||!preview} onClick={()=>{void run(async()=>{await recipeRequest({action:'activate',appId:selected,expectedRevision:row!.revision});await load();await refresh();setPreview(null)})}}>{t('recipeActivate')}</button><span role="status">{t(saved?'canvasSaved':'canvasUnsaved')}</span></nav></>}
 {text&&!edited&&<p role="alert">{t('recipeInvalidConfiguration')}</p>}{error&&<p role="alert">{t('recipeError')}: {error}</p>}
 {preview&&<section aria-label={t('recipePreview')}><p>{t('recipePreviewHelp')}</p><nav>{preview.pages.map(page=><button data-pwb-button key={page.id} aria-pressed={previewPage===page.id} onClick={()=>setPreviewPage(page.id)}>{page.label}</button>)}</nav><RecipePage recipe={preview} appId={preview.appId} instanceId={'preview.'+selected} pageId={previewPage} preview t={t}/></section>}
 </details></>
}
