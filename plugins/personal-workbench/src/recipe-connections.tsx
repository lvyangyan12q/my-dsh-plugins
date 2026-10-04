import {isDataModuleType} from './content-catalog.ts'
import { useSyncExternalStore } from 'react'
import type { AppRecipe } from './recipe-api.ts'
import { displayCatalog, listDisplaySources } from './display-api.ts'

/** Only declared, installed adapters are selectable; no URL or private-app discovery. */
export function RecipeConnections({ recipe, change, t }: { recipe: AppRecipe; change: (update: (recipe: AppRecipe) => void) => void; t: (key: any) => string }) {
  useSyncExternalStore(displayCatalog.subscribe, displayCatalog.getSnapshot, displayCatalog.getSnapshot)
  const sources = listDisplaySources(recipe.appId)
  return <fieldset><legend>{t('recipeConnections')}</legend><p>{t('recipeConnectionHelp')}</p>
    <label>{t('recipeSource')}<select aria-label={t('recipeSource')} value="" onChange={event => {
      const source = sources.find(source => source.resource === event.target.value)
      if (source) change(copy => { if (!copy.connections.some(connection => connection.resource === source.resource && connection.sourceAppId === source.appId)) copy.connections.push({ id: 'data.' + crypto.randomUUID(), sourceAppId: source.appId, resource: source.resource }) })
    }}><option value="">{t('recipeAddConnection')}</option>{sources.map(source => <option key={source.resource} value={source.resource}>{source.label}</option>)}</select></label>
    {!sources.length && <p role="status">{t('displayUnavailable')}</p>}
    {recipe.connections.map(connection => <div className="pwb-recipe-connection-row" key={connection.id}><span>{connection.sourceAppId} / {connection.resource}</span><button data-pwb-button type="button" onClick={() => change(copy => { copy.connections = copy.connections.filter(item => item.id !== connection.id); for (const page of copy.pages) for (const module of page.modules) if (module.connectionId === connection.id) delete module.connectionId })}>{t('recipeRemoveConnection')}</button></div>)}
    {recipe.pages.flatMap((page, pageIndex) => page.modules.map((module, moduleIndex) => isDataModuleType(module.type) && <label key={page.id + '/' + module.id}>{page.label} / {module.title}<select aria-label={t('recipeModuleConnection') + ': ' + module.id} value={module.connectionId ?? ''} onChange={event => change(copy => { const target = copy.pages[pageIndex].modules[moduleIndex]; if (event.target.value) target.connectionId = event.target.value; else delete target.connectionId })}><option value="">{t('recipeEmptyModule')}</option>{recipe.connections.map(connection => <option key={connection.id} value={connection.id}>{connection.sourceAppId} / {connection.resource}</option>)}</select></label>))}
  </fieldset>
}
