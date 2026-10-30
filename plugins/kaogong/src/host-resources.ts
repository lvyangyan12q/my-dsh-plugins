import { createHash } from 'node:crypto'
import type { StudyWorkspace as ApplicationDirectory } from './study-workspace.ts'
import type { StudySources as ResourceDirectory } from './study-sources.ts'
import type { StudySourceOwner as ResourceOwner } from './study-contracts.ts'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { BankQuestionRecord, KnowledgeEntryRecord } from './domain.ts'
import type { KaogongInstanceState } from './instance-state.ts'
import type { KaogongHost } from './instance-host.ts'
const revision = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export type Rows<T> = { revision: string; rows: [string, T][]; ownerInstanceId?: string }
export async function instanceView(applications: ApplicationDirectory, instanceId: string) {
  const snapshot = await applications.snapshot()
  const view = snapshot.views.find(row => row.instanceId === instanceId)
  if (!view) throw new Error('Instance has no registered view')
  return view.id
}
/** Readonly external rows are overlaid without importing or rewriting their owner. */
export function overlay<T>(own: KvTable<string, T>, external: [string, T][]): KvTable<string, T> {
  const shared = new Map(external)
  const entries = () => new Map([...shared, ...own.entries()])
  const writable = (id: string) => { if (!own.get(id) && shared.has(id)) throw new Error('Shared source is read-only') }
  return {
    get size() { return entries().size }, get: id => own.get(id) ?? shared.get(id), entries: () => entries().entries(), keys: () => entries().keys(),
    put: (id, value) => { writable(id); return own.put(id, value) }, update: (id, operation) => { writable(id); return own.update(id, operation) },
    delete: id => { writable(id); return own.delete(id) }, deleteMany: ids => { for (const id of ids) writable(id); return own.deleteMany(ids) },
  }
}
export function readonlyRows<T>(values:[string,T][]):KvTable<string,T>{
 const rows=new Map(values),deny=async()=>{throw Error('Source library is read-only')}
 return {get size(){return rows.size},get:id=>rows.get(id),entries:()=>rows.entries(),keys:()=>rows.keys(),put:deny,update:deny,delete:deny,deleteMany:deny}
}
export async function sourceRows<T>(resources: ResourceDirectory, viewId: string, resourceId: string) {
  return (await resources.call<Rows<T>>({ viewId, resourceId, action: 'read' })).value.rows
}
/** Private teaching contexts cannot be catalogued or granted to another instance. */
export function registerResources(host: KaogongHost, applications: ApplicationDirectory, resources: ResourceDirectory, privateKnowledge:(instanceId:string,id:string)=>boolean=()=>false) {
  const remove: (() => void | Promise<void>)[] = []
  const withTaskLease = <T>(operation: () => Promise<T>) => host.gate.run(operation)
  for (const appId of ['kaogong', 'kaogong-library']) {
    const bank: ResourceOwner<Rows<BankQuestionRecord>> = {
      appId, resourceId: 'question-bank', descriptor: { title: '题库', recordsField: 'rows' }, actions: [], withTaskLease,
      read: instanceId => host.state(instanceId, async state => { const rows = [...state.bankQuestions.entries()]; return {revision: revision(rows), rows, ownerInstanceId:instanceId} }),
    }
    const materials: ResourceOwner<Rows<KnowledgeEntryRecord>> = {
      appId, resourceId: 'materials', descriptor: { title: '原始学习资料', recordsField: 'rows' }, actions: [], withTaskLease,
      read: instanceId => host.state(instanceId, async state => {
        const rows = [...state.knowledgeEntries.entries()].filter(([id, row]) => row.kind !== '笔记'&&!privateKnowledge(instanceId,id))
        return {revision: revision(rows), rows, ownerInstanceId:instanceId}
      }),
      taskContext(value, selection) {
        const ids = (selection as { ids?: unknown })?.ids
        if (!Array.isArray(ids) || ids.length > 8 || ids.some(id => typeof id !== 'string')) throw new Error('Select source material IDs')
        const selected = ids.map(id => { const row = value.rows.find(([key]) => key === id); if (!row) throw new Error('Source material unavailable'); return row })
        return {title: '学习资料', text: JSON.stringify(selected)}
      },
    }
    remove.push(resources.register(bank), resources.register(materials))
  }
  remove.push(resources.register({ appId: 'kaogong', resourceId: 'teaching', shareable: false, actions: [], withTaskLease,
    read: instanceId => host.state(instanceId, async state => {
      const viewId = await instanceView(applications, instanceId)
      const shared = await sourceRows<KnowledgeEntryRecord>(resources, viewId, 'materials')
      const rows = [...overlay(state.knowledgeEntries, shared).entries()]
      return {revision: revision(rows), rows, ownerInstanceId:instanceId}
    }),
    taskContext(value: Rows<KnowledgeEntryRecord>, selection) {
      const selected = selection as {kind?: unknown; id?: unknown; context?: unknown}
      if (selected?.kind === 'material' && typeof selected.id === 'string') {
        const row = value.rows.find(([id]) => id === selected.id)
        if (!row) throw new Error('Material unavailable')
        return {title: row[1].title, text: JSON.stringify({id: row[0], ...row[1]})}
      }
      if(selected?.kind==='materials'&&Array.isArray((selected as {ids?:unknown}).ids)){
        const ids=(selected as unknown as {ids:unknown[]}).ids
        if(ids.length>8||ids.some(id=>typeof id!=='string'))throw Error('Invalid private materials selection')
        const rows=ids.map(id=>{const row=value.rows.find(([key])=>key===id);if(!row)throw Error('Material unavailable');return row})
        return {title:'课堂资料',text:JSON.stringify(rows)}
      }
      if (selected?.kind === 'objective' && selected.context && JSON.stringify(selected.context).length <= 4096) return {title: '学习目标', text: JSON.stringify(selected.context)}
      throw new Error('Teaching context selection invalid')
    },
  }))
  return async () => { for (const disposer of remove.reverse()) await disposer() }
}
