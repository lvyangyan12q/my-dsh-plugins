import {DataVisual} from './data-visual.tsx'
import { aggregateStatistic } from './display-statistics.ts'
import { displayModuleContext } from './display-context.ts'
import { registerRecipeModuleContextProvider } from './module-context.ts'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { DisplayRecord, DisplaySource } from './display-api.ts'
import { displayCatalog, getDisplaySource } from './display-api.ts'
import { DisplayStore } from './display-store.ts'
import type { RecipeModuleProps } from './recipe-view.tsx'
import { registerRecipeModuleRenderer } from './recipe-view.tsx'

type Translate = (key: any) => string
const owners = new Map<string, { source: DisplaySource; store: DisplayStore }>()
function owner(props: RecipeModuleProps, source: DisplaySource) {
  const key = JSON.stringify([props.appId, props.instanceId, props.preview, props.module.connectionId])
  let entry = owners.get(key)
  if (entry?.source !== source) { entry?.store.dispose(); entry = { source, store: new DisplayStore(source, props) }; owners.set(key, entry); void entry.store.reload() }
  return entry!.store
}
export function DisplayModule({ type, store, t, renderDetail,config={} }: { type: 'stats' | 'list' | 'detail' | 'filter' | 'chart' | 'map'; config?:import('./recipe-api.ts').RecipeModule['config']; store: DisplayStore; t: Translate; renderDetail?: (record: DisplayRecord) => ReactNode }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  if (state.phase === 'loading') return <p role="status">{t('displayLoading')}</p>
  if (state.phase === 'error') return <div role="alert"><p>{t('displayFailed')}: {state.error}</p><button data-pwb-button onClick={() => { void store.reload() }}>{t('retry')}</button></div>
  const records = store.filteredRecords()
  if (type === 'filter') return <div className="pwb-display-filter"><label>{t('displaySearch')}<input aria-label={t('displaySearch')} value={state.search} onChange={event => store.setSearch(event.target.value)} /></label>{state.data.filters.map(filter => <label key={filter.field}>{filter.label}<select aria-label={filter.label} value={state.filters[filter.field] ?? ''} onChange={event => store.setFilter(filter.field, event.target.value)}><option value="">{t('displayAll')}</option>{[...new Set(state.data.records.map(record => String(record.fields[filter.field] ?? '')))].filter(Boolean).sort().map(value => <option key={value}>{value}</option>)}</select></label>)}</div>
  if (!records.length) return <p role="status">{t(state.data.records.length ? 'displayNoMatches' : 'displayEmpty')}</p>
  if(type==='chart'||type==='map')return <DataVisual type={type} config={config} records={records} selectedId={state.selectedId} select={store.select} t={t}/>
  if (type === 'stats') return <dl className="pwb-display-stats" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>{state.data.stats.map(stat => {
   const value = aggregateStatistic(records, stat)
    return <div key={stat.id}><dt>{stat.label}</dt><dd data-stat={stat.id}>{value}</dd></div>
  })}</dl>
  if (type === 'list') return <ul className="pwb-display-list">{records.map(record => <li key={record.id}><button data-pwb-button aria-pressed={state.selectedId === record.id} onClick={() => store.select(record.id)}>{record.title}</button>{record.subtitle && <span> · {record.subtitle}</span>}</li>)}</ul>
  const record = records.find(record => record.id === state.selectedId)
  return record && renderDetail ? <>{renderDetail(record)}</> : record ? <article className="pwb-display-detail"><h4>{record.title}</h4><p>{record.subtitle}</p><dl>{Object.entries(record.fields).map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{String(value ?? '')}</dd></div>)}</dl></article> : <p role="status">{t('displaySelect')}</p>
}
export function DisplayModules({ store, t }: { store: DisplayStore; t: Translate }) { return <>{(['filter', 'stats', 'list', 'detail'] as const).map(type => <section key={type}><h3>{t('recipeModule' + type)}</h3><DisplayModule type={type} store={store} t={t} /></section>)}</> }
export function RecipeDisplayModule(props: RecipeModuleProps & { t?: Translate }) {
  useSyncExternalStore(displayCatalog.subscribe, displayCatalog.getSnapshot, displayCatalog.getSnapshot)
  const t = props.t ?? ((key: string) => key)
  const connection = props.recipe.connections.find(connection => connection.id === props.module.connectionId)
  const source = connection?.sourceAppId === props.appId ? getDisplaySource(connection.sourceAppId, connection.resource) : undefined
  if (!connection) return <p role="status">{t('recipeEmptyModule')}</p>
  if (!source) return <p role="alert">{t('displayUnavailable')}: {connection.resource}</p>
  return <DisplayModule type={props.module.type as 'stats' | 'list' | 'detail' | 'filter' | 'chart' | 'map'} config={props.module.config} store={owner(props, source)} t={t} />
}
export function installDisplayModules() {
  const removes = ['stats', 'list', 'filter', 'detail', 'chart', 'map'].flatMap(type => [registerRecipeModuleRenderer(type, RecipeDisplayModule),registerRecipeModuleContextProvider(type,props=>{
    const connection=props.recipe.connections.find(c=>c.id===props.module.connectionId),source=connection?.sourceAppId===props.appId?getDisplaySource(connection.sourceAppId,connection.resource):undefined
    if(!connection||!source)return {phase:'unavailable',reason:props.t('displayUnavailable')+': '+(connection?.resource??props.module.id)}
    return displayModuleContext(props,owner(props,source),source)
  })])
  const unsubscribe = displayCatalog.subscribe(() => { for (const [key, entry] of owners) if (getDisplaySource(entry.source.appId, entry.source.resource) !== entry.source) { entry.store.dispose(); owners.delete(key) } })
  return () => { unsubscribe(); for (const remove of removes.reverse()) remove(); for (const entry of owners.values()) entry.store.dispose(); owners.clear() }
}
