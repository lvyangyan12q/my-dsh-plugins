import { useEffect, useSyncExternalStore } from 'react'
import { DisplayModule, DisplayStore } from '@deepseek-ai/dsh-personal-workbench/client'
import type { DisplayData, DisplayRecord, DisplaySource } from '@deepseek-ai/dsh-personal-workbench/client'
import { useBusinessState, useRequestOwner } from './view-state.tsx'
import { DocumentMarkdown } from './document-markdown.tsx'

export type Entry = { id: string; title: string; subject: string; kind: string; source: string; content: string; tags?: string[] }
export function knowledgeDisplayData(entries: Entry[]): DisplayData {
  return { records: entries.map(entry => ({ id: entry.id, title: entry.title, subtitle: `${entry.subject} · ${entry.kind}`, fields: { 科目: entry.subject, 类型: entry.kind, 来源: entry.source ?? '', 正文: entry.content ?? '', 标签: entry.tags?.join(' ') ?? '' } })),
    filters: [{ field: '科目', label: '科目' }, { field: '类型', label: '资料类型' }], stats: [{ id: 'materials', label: '条资料', operation: 'count' }] }
}
export const knowledgeSource: DisplaySource = { appId: 'kaogong', resource: 'knowledge', label: '考公自有知识库', load: async ({ instanceId, signal }) => {
  if (instanceId !== 'default') throw new Error('考公当前仅支持默认学习实例。')
  const response = await fetch('/api/kaogong/knowledge?q=&display=1', { credentials: 'same-origin', signal })
  if (!response.ok) throw new Error('知识库加载失败')
  const value = await response.json()
  if (!Array.isArray(value.entries)) throw new Error('知识库返回了无法识别的数据')
  return knowledgeDisplayData(value.entries)
} }
const labels: Record<string, string> = { displaySearch: '搜索知识库', displayAll: '全部', displayLoading: '正在加载资料…', displayFailed: '知识库加载失败', retry: '重试', displayNoMatches: '没有匹配资料', displayEmpty: '暂无资料', displaySelect: '请选择资料查看正文' }
const t = (key: string) => labels[key] ?? key
const entryOf = (record: DisplayRecord): Entry => ({ id: record.id, title: record.title, subject: String(record.fields.科目), kind: String(record.fields.类型), source: String(record.fields.来源), content: String(record.fields.正文) })

/** Public display state owns filtering and selection; only the application renders its document body. */
export function KnowledgeLibrary({ active = true }: { active?: boolean }) {
  const owner = useRequestOwner()
  const [store, setStore] = useBusinessState('reader.store', null)
  useEffect(() => {
    if (!active || store) return
    const next = new DisplayStore(knowledgeSource, { appId: 'kaogong', instanceId: 'default', preview: false })
    next.setSearch(owner.cell('reader.query', '').value)
    setStore(next)
  }, [active, store, owner, setStore])
  return store ? <KnowledgeModules active={active} store={store} /> : null
}
function KnowledgeModules({ active, store }: { active: boolean; store: DisplayStore }) {
  const owner = useRequestOwner()
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useEffect(() => {
    if (!active) return
    void store.reload()
    const interval = setInterval(() => { void store.reload() }, 15000)
    return () => clearInterval(interval)
  }, [active, store])
  useEffect(() => {
    owner.cell('reader.query', '').set(state.search)
    if (state.phase !== 'ready') return
    const record = store.filteredRecords().find(row => row.id === state.selectedId)
    owner.cell('reader.selected', '').set(record?.id ?? '')
    owner.cell('reader.entry', null).set(record ? entryOf(record) : null)
  }, [state, store, owner])
  return <div aria-label="考公资料公共模块">
    <DisplayModule type="filter" store={store} t={t} />
    <DisplayModule type="stats" store={store} t={t} />
    <DisplayModule type="list" store={store} t={t} />
    {state.selectedId && <button data-pwb-button type="button" onClick={store.clearSelection}>返回资料列表</button>}
    <DisplayModule type="detail" store={store} t={t} renderDetail={record => {
      const entry = entryOf(record)
      return <article><h3>{entry.title}</h3><p>{entry.subject} · {entry.kind} · {entry.source}</p><DocumentMarkdown content={entry.content} /></article>
    }} />
  </div>
}
