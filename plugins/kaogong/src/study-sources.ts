import { createHash, randomUUID } from 'node:crypto'
import type { StudyWorkspace } from './study-workspace.ts'
import type { StudySourceReader, StudySourceOwner, SourceRows } from './study-contracts.ts'

const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const resourceIds = new Set(['question-bank', 'materials', 'teaching'])
/** A fixed study source boundary: libraries can grant only bank/material reads.
 * Private teaching context is never catalogued or shared. */
export class StudySources implements StudySourceReader {
  private owners = new Map<string, StudySourceOwner>()
  private pending: Promise<unknown> = Promise.resolve()
  constructor(private workspace: StudyWorkspace) {}
  withGrantLease<T>(operation: () => Promise<T>) { const task = this.pending.then(operation); this.pending = task.catch(() => {}); return task }
  register<T extends SourceRows>(owner: StudySourceOwner<T>) {
    if (!['kaogong', 'kaogong-library'].includes(owner.appId) || !resourceIds.has(owner.resourceId) || owner.actions.length || owner.resourceId === 'teaching' && owner.appId !== 'kaogong') throw Error('未知考公资料读取者')
    const key = JSON.stringify([owner.appId, owner.resourceId])
    if (this.owners.has(key)) throw Error('资料读取者重复')
    this.owners.set(key, owner as StudySourceOwner)
    return () => { if (this.owners.get(key) === owner) this.owners.delete(key) }
  }
  async call<T extends SourceRows = SourceRows>(input: { viewId: string; resourceId: string; action: 'read' }) {
    if (input.action !== 'read' || !resourceIds.has(input.resourceId)) throw Error('资料仅可只读访问')
    const context = await this.workspace.resolveView(input.viewId)
    const connections = [...this.workspace.domain.table('grants').entries()].map(([, row]) => row).filter(row => row.consumerInstanceId === context.instance.id && row.resourceId === input.resourceId)
    const grant = connections.find(row => row.status === 'active')
    if (!grant && connections.length) throw Error('资料授权已撤销，请明确重新授权')
    if (input.resourceId === 'teaching' && grant) throw Error('私有课堂不可共享')
    const ownerId = grant?.ownerInstanceId ?? context.instance.id
    const profile = await this.workspace.assertProfile(ownerId)
    const appId = profile.kind === 'library' ? 'kaogong-library' : 'kaogong'
    const owner = this.owners.get(JSON.stringify([appId, input.resourceId]))
    if (!owner || grant && owner.shareable === false) throw Error('资料来源不可用')
    const before = grant ? fingerprint(grant) : null
    const value = await owner.read(ownerId)
    if (grant && fingerprint(this.workspace.domain.table('grants').get(grant.id)) !== before) throw Error('资料授权已变化')
    return { value: value as T, connection: grant ? structuredClone(grant) : null, committed: false as const }
  }
  share(input: { ownerViewId: string; consumerInstanceId: string; resourceId: string }) { return this.withGrantLease(async () => {
    if (!['question-bank', 'materials'].includes(input.resourceId)) throw Error('私有课堂不能共享')
    const owner = await this.workspace.resolveView(input.ownerViewId), consumer = await this.workspace.assertProfile(input.consumerInstanceId)
    if (owner.profile.kind !== 'library' || consumer.kind !== 'learner' || owner.instance.id === consumer.id) throw Error('只能从资料库授权给备考档案')
    const table = this.workspace.domain.table('grants')
    const active = [...table.entries()].map(([, row]) => row).find(row => row.consumerInstanceId === consumer.id && row.resourceId === input.resourceId && row.status === 'active')
    if (active && active.ownerInstanceId !== owner.instance.id) throw Error('请先撤销原资料来源')
    if (active) return active
    const row = { id: randomUUID(), ownerInstanceId: owner.instance.id, consumerInstanceId: consumer.id, resourceId: input.resourceId as 'question-bank' | 'materials', status: 'active' as const, revision: 1 }
    await table.put(row.id, row)
    return row
  }) }
  revoke(id: string, revision: number) { return this.withGrantLease(async () => {
    const table = this.workspace.domain.table('grants'), row = table.get(id)
    if (!row || row.revision !== revision) throw Error('资料授权已更新')
    const next = { ...row, status: 'revoked' as const, revision: row.revision + 1 }
    await table.put(id, next); return next
  }) }
  async capture(viewId: string, references: { resourceId: string; selection?: unknown }[]) {
    if (!Array.isArray(references) || references.length > 8) throw Error('资料上下文过多')
    const result = []
    for (const reference of references) {
      const read = await this.call({ viewId, resourceId: reference.resourceId, action: 'read' })
      const context = await this.workspace.resolveView(viewId)
      const ownerId = read.value.ownerInstanceId ?? context.instance.id, profile = await this.workspace.assertProfile(ownerId)
      const owner = this.owners.get(JSON.stringify([profile.kind === 'library' ? 'kaogong-library' : 'kaogong', reference.resourceId]))
      if (!owner?.taskContext) throw Error('资料不支持课堂上下文')
      const value = await owner.taskContext(read.value, reference.selection)
      result.push({ id: randomUUID(), ...value, reference: structuredClone(reference), fingerprint: fingerprint({ value: read.value, connection: read.connection, reference }) })
    }
    return result
  }
}
