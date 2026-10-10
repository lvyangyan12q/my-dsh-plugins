import { aggregateStatistic } from './display-statistics.ts'
import type { DisplayRecord, DisplaySource, DisplayValue } from './display-api.ts'
import type { DisplayStore } from './display-store.ts'
import type { RecipeModuleProps } from './recipe-view.tsx'
import type { RecipeModuleContext } from './module-context.ts'
import type { TaskContext } from './task-api.ts'
const bounded = (value: string, limit: number) => value.length > limit ? value.slice(0, limit) + '…' : value
function recordContext(record: DisplayRecord, sample = false) {
 const limit = sample ? 4 : 12, entries = Object.entries(record.fields)
 const scalar = (value: DisplayValue) => typeof value === 'string' ? bounded(value, sample ? 80 : 160) : value
 return { id: bounded(record.id, 120), title: bounded(record.title, sample ? 160 : 300), ...(record.subtitle ? { subtitle: bounded(record.subtitle, sample ? 120 : 300) } : {}), fields: Object.fromEntries(entries.slice(0, limit).map(([field, value]) => [bounded(field, sample ? 40 : 60), scalar(value)])), omittedFields: Math.max(0, entries.length - limit) }
}
/** Reads the exact shared connection store; never sends full datasets or creates a Session. */
export function displayModuleContext(props: RecipeModuleProps, store: DisplayStore, source: DisplaySource): RecipeModuleContext {
 const state = store.getSnapshot(), { module, t } = props
 if (state.phase !== 'ready') return { phase: 'unavailable', reason: state.phase === 'loading' ? t('displayLoading') : `${t('displayFailed')}: ${state.error ?? t('displayUnavailable')}` }
 const records = store.filteredRecords(), selected = records.find(record => record.id === state.selectedId)
 const origin = `${source.label} (${props.appId}/${props.instanceId}/${module.connectionId}: ${source.resource})`
 const chunk = (suffix: string, label: string, value: unknown): TaskContext => ({ id: module.id + '.' + suffix, label: t(label), source: origin, text: JSON.stringify(value) })
 const context: TaskContext[] = [chunk('scope', 'taskDataScope', { appId: props.appId, instanceId: props.instanceId, connectionId: module.connectionId, resource: source.resource, search: bounded(state.search, 300), filters: Object.fromEntries(Object.entries(state.filters).slice(0, 20).map(([field, value]) => [bounded(field, 60), bounded(value, 100)])), matchedRecords: records.length, totalRecords: state.data.records.length, selectedId: state.selectedId ?? null })]
 if(module.type==='chart'||module.type==='map')context.push(chunk('mapping','displayFieldMapping',{type:module.type,...Object.fromEntries((module.type==='chart'?['valueField']:['latitudeField','longitudeField']).map(field=>[field,bounded(String(module.config[field]??''),120)]))}))
 if (selected) context.push(chunk('selection', 'taskSelectedRecord', recordContext(selected)))
 if (module.type === 'stats') {
  const statistics = []
  for (const stat of state.data.stats.slice(0, 10)) {
   const value = aggregateStatistic(records, stat)
   if (!Number.isFinite(value)) return { phase: 'unavailable', reason: t('displayStatisticOutOfRange') + ': ' + stat.label }
   statistics.push({ id: bounded(stat.id, 60), label: bounded(stat.label, 100), operation: stat.operation, field: stat.field ? bounded(stat.field, 60) : undefined, value })
  }
  context.push(chunk('statistics', 'taskCurrentStatistics', { statistics, omittedStatistics: Math.max(0, state.data.stats.length - 10) }))
 } else if (!selected && module.type !== 'filter') {
  if (!records.length) return { phase: 'unavailable', reason: t(state.data.records.length ? 'displayNoMatches' : 'displayEmpty') }
  if (module.type === 'detail') return { phase: 'unavailable', reason: t('displaySelect') }
  context.push(chunk('records', 'taskRecordSample', { sampled: true, records: records.slice(0, 3).map(record => recordContext(record, true)), omittedRecords: Math.max(0, records.length - 3) }))
 }
 return { phase: 'ready', context }
}
