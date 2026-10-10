import type { Context } from '@deepseek-ai/cordis'
import { registerDisplaySource, registerRecipeTemplate } from '@deepseek-ai/dsh-personal-workbench/client'
import type { AppRecipe, DisplayData } from '@deepseek-ai/dsh-personal-workbench/client'
import { readingAppId, readingResource } from './reading-api.ts'
import type { ReadingInstance } from './reading-api.ts'
export const inject = ['personalWorkbench']
async function request(body: object, signal?: AbortSignal): Promise<ReadingInstance> {
  const response = await fetch('/api/reading-statistics/data', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  const data = await response.json()
  if (!response.ok || data.version !== 1 || !data.instance || !Array.isArray(data.instance.records)) throw new Error(data.error ?? 'Reading data unavailable')
  return data.instance
}
export function toDisplayData(instance: ReadingInstance): DisplayData {
  return { records: instance.records.map(record => ({ id: record.id, title: record.title, subtitle: record.author, fields: { category: record.category, status: record.status, minutes: record.minutes, notes: record.notes } })), filters: [{ field: 'category', label: '分类 / Category' }, { field: 'status', label: '状态 / Status' }], stats: [{ id: 'books', label: '书籍 / Books', operation: 'count' }, { id: 'minutes', label: '阅读分钟 / Minutes', operation: 'sum', field: 'minutes' }, { id: 'average', label: '平均分钟 / Average minutes', operation: 'average', field: 'minutes' }] }
}
export function readingRecipe(): AppRecipe {
  return { schemaVersion: 1, appId: readingAppId, version: 1, name: '阅读统计 / Reading statistics', description: '独立阅读记录。示例数据由阅读应用初始化；浏览与筛选不使用 AI。', pages: [{ id: 'library', label: '阅读 / Reading', layout: 'grid', modules: (['filter', 'stats', 'list', 'detail'] as const).map(type => ({ id: 'reading.' + type, type, title: ({ filter: '筛选 / Filter', stats: '统计 / Statistics', list: '书籍 / Books', detail: '详情 / Detail' })[type], connectionId: 'reading-data', config: {} })) }], connections: [{ id: 'reading-data', sourceAppId: readingAppId, resource: readingResource }], roles: [] }
}
export function apply(ctx: Context) {
  ctx.effect(() => registerDisplaySource({ appId: readingAppId, resource: readingResource, label: '阅读应用自有记录 / Reading app records', load: async ({ instanceId, preview, signal }) => toDisplayData(await request({ action: 'read', instanceId, preview }, signal)) }), 'reading display adapter')
  ctx.effect(() => registerRecipeTemplate({ id: readingAppId, label: '阅读统计应用 / Reading statistics app', create: async () => { await request({ action: 'initialize', instanceId: 'default', seed: 'examples' }); return readingRecipe() } }), 'reading draft template')
}
