import type { AppRecipe } from './recipe-api.ts'

export type DisplayValue = string | number | boolean | null
export interface DisplayRecord { id: string; title: string; subtitle?: string; fields: Record<string, DisplayValue> }
export interface DisplayData {
  records: DisplayRecord[]
  filters: { field: string; label: string }[]
  stats: { id: string; label: string; operation: 'count' | 'sum' | 'average'; field?: string }[]
}
export interface DisplayScope { appId: string; instanceId: string; preview: boolean }
export interface DisplaySource {
  appId: string; resource: string; label: string
  load(scope: DisplayScope & { signal: AbortSignal }): Promise<DisplayData>
}
export interface RecipeTemplate { id: string; label: string; create(): Promise<AppRecipe> }
const sources = new Map<string, DisplaySource>(), templates = new Map<string, RecipeTemplate>()
const sourceKey = (appId: string, resource: string) => JSON.stringify([appId, resource])
const listeners = new Set<() => void>()
let revision = 0
const changed = () => { revision++; for (const listener of listeners) listener() }
export const displayCatalog = { subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }, getSnapshot: () => revision }
export function registerDisplaySource(source: DisplaySource): () => void {
  const key = sourceKey(source.appId, source.resource)
  if (sources.has(key)) throw new Error('Duplicate display source')
  sources.set(key, source); changed()
  return () => { if (sources.get(key) === source) { sources.delete(key); changed() } }
}
export const getDisplaySource = (appId: string, resource: string) => sources.get(sourceKey(appId, resource))
export const listDisplaySources = (appId: string) => [...sources.values()].filter(source => source.appId === appId)
export const listRecipeTemplates = () => [...templates.values()]
export function registerRecipeTemplate(template: RecipeTemplate): () => void {
  if (templates.has(template.id)) throw new Error('Duplicate recipe template')
  templates.set(template.id, template); changed()
  return () => { if (templates.get(template.id) === template) { templates.delete(template.id); changed() } }
}
