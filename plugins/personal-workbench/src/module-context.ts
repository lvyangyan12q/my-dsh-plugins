import type { RecipeModuleProps } from './recipe-view.tsx'
import type { TaskContext } from './task-api.ts'
export type RecipeModuleContext = { phase: 'ready'; context: readonly TaskContext[] } | { phase: 'unavailable'; reason: string }
/** Installed code reads already-owned module state. Providers never ensure or send Sessions. */
export type RecipeModuleContextProvider = (props: RecipeModuleProps) => RecipeModuleContext
const providers = new Map<string, RecipeModuleContextProvider>()
export function registerRecipeModuleContextProvider(type: string, provider: RecipeModuleContextProvider): () => void {
 if (providers.has(type)) throw new Error('Duplicate module context provider')
 providers.set(type, provider)
 return () => { if (providers.get(type) === provider) providers.delete(type) }
}
/** Snapshot only at the user's prepare action. Bound installed extensions before task admission. */
export function captureRecipeModuleContext(props: RecipeModuleProps): readonly TaskContext[] {
 const provider = providers.get(props.module.type)
 if (!provider) throw new Error(`${props.t('taskContextUnavailable')}: ${props.module.type}`)
 const result = provider(props)
 if (result.phase === 'unavailable') throw new Error(result.reason)
 const requested=[...result.context]
 if(typeof props.module.config.taskContext==='string'&&props.module.config.taskContext)requested.push({id:props.module.id+'.configured',label:props.t('taskConfiguredContext'),source:props.pageId+'/'+props.module.id,text:props.module.config.taskContext})
 const context: TaskContext[] = []; let remaining = 15900
 for (const chunk of requested.slice(0, 19)) {
  if (!chunk.id || typeof chunk.text !== 'string') throw new Error(props.t('taskContextUnavailable'))
  if (remaining <= 0) break
  const limit = Math.min(4000, remaining), truncated = chunk.text.length > limit
  const text = truncated ? chunk.text.slice(0, Math.max(0, limit - 80)) + '\n[' + props.t('taskContextTruncated').slice(0, 60) + ']' : chunk.text
  context.push({ id: chunk.id.slice(0, 200), label: chunk.label.slice(0, 200), source: chunk.source.slice(0, 500), text }); remaining -= text.length
 }
 if (requested.length > context.length) context.push({id:props.module.id+'.omitted',label:props.t('taskContextTruncated'),source:props.module.title,text:String(requested.length-context.length)+' context chunks omitted'})
 return context
}
