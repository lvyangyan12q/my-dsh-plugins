import * as React from 'react'
import {createPresentation} from 'dsh-worktable/sdk'
const {Stats:DisplayStats,List:DisplayList,Detail:DisplayDetail,Filters:DisplayFilters}=createPresentation(React)
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReadingRecord } from './reading-api.ts'
import { requestReading, subscribeReading, notifyReading, type DataConnection } from './reading-data-client.ts'
import { ReadingSharing } from './reading-sharing.tsx'
import { ReadingRecordEditor } from './reading-record-editor.tsx'

type Props = { application: { id: string }; instance: { id: string }; view: { id: string }; tasks?: { prepare(input: {roleId: string; text: string; contexts?: unknown[]}): Promise<unknown> } }
type Preferences = { category: string; status: string; search: string; selected: string }
type Snapshot = Preferences & { records: ReadingRecord[]; phase: 'loading' | 'ready' | 'error'; error: string; preferenceWarning: string; revision?: string; connection?: DataConnection | null }
const emptyPreferences = (): Preferences => ({ category: '', status: '', search: '', selected: '' })
// Only presentation preferences are browser-owned. Business records remain in the reading domain.
const memoryPreferences = new Map<string, Preferences>()
function preferences(id: string): Preferences {
  const cached = memoryPreferences.get(id)
  if (cached) return cached
  try {
    const value = JSON.parse(window.localStorage.getItem('reading-statistics:deep:1:' + id) ?? 'null')
    if (value && ['category', 'status', 'search', 'selected'].every(key => typeof value[key] === 'string' && value[key].length <= 400)) return { category: value.category, status: value.status, search: value.search, selected: value.selected }
  } catch { /* A restricted browser still supports this mounted instance. */ }
  return emptyPreferences()
}
class InstanceState {
  snapshot: Snapshot
  listeners = new Set<() => void>()
  controller?: AbortController
  unsubscribe?: () => void
  generation = 0
  preferenceKey: string
  constructor(readonly id: string, readonly viewId: string, readonly idle: () => void) { this.preferenceKey = id; this.snapshot = { ...preferences(id), records: [], phase: 'loading', error: '', preferenceWarning: '' } }
  getSnapshot = () => this.snapshot
  publish(next: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...next }; for (const listener of this.listeners) listener() }
  set(next: Partial<Preferences>) {
    this.publish(next)
    const { category, status, search, selected } = this.snapshot
    memoryPreferences.delete(this.preferenceKey); memoryPreferences.set(this.preferenceKey, { category, status, search, selected })
    if (memoryPreferences.size > 64) memoryPreferences.delete(memoryPreferences.keys().next().value!)
    try { window.localStorage.setItem('reading-statistics:deep:1:' + this.preferenceKey, JSON.stringify({ category, status, search, selected })) } catch { this.publish({ preferenceWarning: '浏览器无法保存偏好，偏好仅在本次运行内保留；刷新后可能丢失。' }) }
  }
  reload = async () => {
    this.controller?.abort(); const controller = this.controller = new AbortController(), generation = ++this.generation
    this.publish({ phase: this.snapshot.phase === 'ready' ? 'ready' : 'loading', error: '' })
    try {
      const row = await requestReading({ action: 'read', instanceId: this.id, viewId: this.viewId }, controller.signal)
      if (!controller.signal.aborted && generation === this.generation) {
        const preferenceKey = row.connection ? this.id + ':' + row.connection.id : this.id
        const changed = preferenceKey !== this.preferenceKey
        this.preferenceKey = preferenceKey
        this.publish({ ...(changed ? preferences(preferenceKey) : {}), records: row.records, revision: row.revision, connection: row.connection, phase: 'ready' })
      }
    } catch (error) { if (!controller.signal.aborted && generation === this.generation) this.publish({ records: [], phase: 'error', error: error instanceof Error ? error.message : String(error) }) }
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) { this.unsubscribe = subscribeReading({ instanceId: this.id, preview: false }, this.reload); void this.reload() }
    return () => { this.listeners.delete(listener); if (!this.listeners.size) { this.release(); void Promise.resolve().then(() => { if (!this.listeners.size) { this.snapshot = { ...this.snapshot, records: [], phase: 'loading' }; this.idle() } }) } }
  }
  release() { this.generation++; this.controller?.abort(); this.controller = undefined; this.unsubscribe?.(); this.unsubscribe = undefined }
}
export function createReadingViews() {
  const states = new Map<string, InstanceState>()
  function ReadingView({ application, instance, view, kind, tasks }: Props & { kind: 'page' | 'stats' | 'list' }) {
    const [taskError, setTaskError] = useState(''), [preparing, setPreparing] = useState(false)
    let state = states.get(instance.id)
    if (!state) { state = new InstanceState(instance.id, view.id, () => states.delete(instance.id)); states.set(instance.id, state) }
    const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot)
    const actionKey = application.id + ':' + instance.id + ':' + view.id
    const actionOwner = useRef({ key: actionKey, active: false })
    if (actionOwner.current.key !== actionKey) { actionOwner.current.active = false; actionOwner.current = { key: actionKey, active: false } }
    useEffect(() => { const owner = { key: actionKey, active: true }; actionOwner.current = owner; return () => { owner.active = false } }, [actionKey])
    if (application.id !== 'reading-statistics') return <p role="alert">阅读视图属于阅读统计应用。</p>
    const records = snapshot.records.filter(record => (!snapshot.category || record.category === snapshot.category) && (!snapshot.status || record.status === snapshot.status) && (!snapshot.search || (record.title + ' ' + record.author).toLocaleLowerCase().includes(snapshot.search.toLocaleLowerCase())))
    const selected = records.find(record => record.id === snapshot.selected)
    return <section data-reading-view={view.id} data-reading-instance={instance.id} aria-busy={snapshot.phase === 'loading'} style={{ display: 'grid', gap: 12, padding: 12, minWidth: 0 }}>
      {kind === 'page' && <ReadingSharing instanceId={instance.id} viewId={view.id}/>}
      <button onClick={() => notifyReading()}>刷新资料与权限</button>
      {tasks && <button disabled={preparing || snapshot.phase !== 'ready'} onClick={async () => { const owner = actionOwner.current; setPreparing(true); setTaskError(''); try { await tasks.prepare({ roleId: 'assistant', text: selected ? '请分析所选阅读记录，给出下一步阅读建议。' : '请分析当前筛选的阅读记录，给出下一步阅读建议。', contexts: [{ resourceId: 'reading-records', selection: { ids: selected ? [selected.id] : [], filter: { category: snapshot.category, status: snapshot.status, search: snapshot.search } } }] }) } catch (error) { if (owner.active) setTaskError(error instanceof Error ? error.message : String(error)) } finally { if (owner.active) setPreparing(false) } }}>准备阅读AI任务</button>}
      {taskError && <p role="alert">{taskError}</p>}
      {snapshot.connection && <p role="status">资料来源：{snapshot.connection.ownerInstanceId} · {snapshot.connection.allowedActions.includes('update') ? '已授权编辑' : '只读共享'}</p>}
      {snapshot.preferenceWarning && <p role="status">{snapshot.preferenceWarning}</p>}
      {snapshot.phase === 'loading' && <p role="status">正在加载阅读记录…</p>}
      {snapshot.phase === 'error' && <div role="alert">{snapshot.error}<button onClick={() => void state.reload()}>重试加载阅读视图</button></div>}
      {kind === 'page' && <><h2>阅读统计</h2><DisplayFilters values={{search:snapshot.search,category:snapshot.category,status:snapshot.status}} onChange={values=>state.set(values)} fields={[
        {id:'search',label:'搜索阅读记录'},
        {id:'category',label:'分类筛选',options:[{value:'',label:'全部分类'},...[...new Set(snapshot.records.map(record=>record.category))].filter(Boolean).map(category=>({value:category,label:category||'未分类'}))]},
        {id:'status',label:'状态筛选',options:[{value:'',label:'全部状态'},{value:'reading',label:'正在阅读'},{value:'finished',label:'已读完'}]}
      ]}/></>}
      {snapshot.phase==='ready' && kind !== 'list' && <DisplayStats records={records} phase={snapshot.phase} error={snapshot.error} metrics={[{id:'books',label:'书籍',aggregate:'count'},{id:'minutes',label:'阅读分钟',aggregate:'sum',field:'minutes'}]}/>}
      {snapshot.phase==='ready' && kind !== 'stats' && <><DisplayList records={records} mapping={{id:'id',title:'title',description:'author'}} selectedId={snapshot.selected} onSelect={id=>state.set({selected:id})} phase={snapshot.phase} error={snapshot.error} emptyText="尚无匹配的阅读记录。"/>{selected&&<article data-reading-selection><h3>{selected.title}</h3><DisplayDetail record={selected} fields={[{label:'作者',field:'author'},{label:'笔记',field:'notes'}]}/></article>}</>}
      {kind === 'page' && snapshot.phase === 'ready' && <><button disabled={!!snapshot.connection} onClick={() => { const owner = actionOwner.current, generation = state.generation; void requestReading({ action: 'initialize', instanceId: instance.id, viewId: view.id, expectedRevision: snapshot.revision, expectedConnectionRevision: snapshot.connection?.revision, seed: 'examples' }).catch(error => { if (owner.active && actionOwner.current === owner && generation === state.generation) state.publish({ phase: 'error', error: String(error) }) }) }}>初始化示例记录</button><ReadingRecordEditor key={instance.id} appId={application.id} instanceId={instance.id} preview={false} viewId={view.id} readOnly={!!snapshot.connection && !snapshot.connection.allowedActions.includes('update')} standalone/></>}
    </section>
  }
  const Page = (props: Props) => <ReadingView {...props} kind="page"/>
  const Stats = (props: Props) => <ReadingView {...props} kind="stats"/>
  const List = (props: Props) => <ReadingView {...props} kind="list"/>
  return { views: { page: Page, stats: Stats, list: List }, dispose: () => { for (const state of states.values()) state.release(); states.clear() } }
}
