import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { StudyWorkspace } from './study-workspace.ts'
import type { StudyRoles } from './study-roles.ts'
import type { StudySources } from './study-sources.ts'
import type { TeachingOwner, TeachingTask } from './study-contracts.ts'

type Reference = { resourceId: string; selection?: unknown }
type CapturedContext = { id: string; title: string; text: string; reference: Reference; fingerprint: string }
type Draft = Omit<TeachingTask, 'preparation'> & { revision: number; text: string; contexts: CapturedContext[]; bindingRevision: number; source: { viewId: string }; instanceRevision: number; preparation?: TeachingTask['preparation']; notice?: string; [key: string]: unknown }
const textOf = (value: unknown) => { if (typeof value !== 'string' || !value.trim() || value.length > 24000) throw Error('请输入最多24000字的教学任务'); return value }

/** Preparation, Native admission and business finalization are distinct durable
 * facts. No model loop is awaited here and unknown admission never resends. */
export class StudyTeaching {
  private owners = new Map<string, TeachingOwner>()
  private pending: Promise<unknown> = Promise.resolve()
  private stopped = false
  constructor(private ctx: Context, private workspace: StudyWorkspace, private roles: StudyRoles, private sources: StudySources) {}
  register(kind: 'lesson' | 'review', owner: TeachingOwner) {
    if (this.owners.has(kind)) throw Error('教学记录所有者重复')
    this.owners.set(kind, owner); return () => { if (this.owners.get(kind) === owner) this.owners.delete(kind) }
  }
  private serial<T>(operation: () => Promise<T>) { if (this.stopped) return Promise.reject(Error('教学任务已停止')); const task = this.pending.then(operation); this.pending = task.catch(() => {}); return task }
  private table() { return this.workspace.domain.table('teaching') }
  private row(id: string) { const row = this.table().get(id) as Draft | undefined; if (!row) throw Error('教学任务不存在'); return row }
  private async put(row: Draft) { await this.table().put(row.id, row); return structuredClone(row) }
  private present(row: Draft) { return structuredClone(row.status === 'submitting' ? { ...row, status: 'unknown', notice: '准入结果未确认，请查看原生会话；不会自动重发。' } : row.historicalHandoff&&row.status==='prepared'?{...row,notice:'保留的旧准备上下文仅供查看；请根据当前授权重新准备，不会重发旧请求。'}:row) }
  private owner(row: Draft) { const owner = row.preparation && this.owners.get(row.preparation.kind); if (!owner || owner.version !== row.preparation?.ownerVersion) throw Error('教学记录的可信所有者不可用'); return owner }
  async list(viewId: string) { const context = await this.workspace.resolveView(viewId); return [...this.table().entries()].map(([, row]) => row as Draft).filter(row => row.instanceId === context.instance.id).map(row => this.present(row)) }
  private async create(viewId: string, roleId: string, text: unknown, references: Reference[], preparation?: Draft['preparation']) {
    const context = await this.workspace.resolveView(viewId)
    if (context.profile.kind !== 'learner') throw Error('资料库不能准备学习任务')
    const { binding } = await this.roles.read(context.instance.id, roleId)
    if (!binding || binding.phase !== 'ready') throw Error('请先明确打开可用的学习角色')
    const contexts = await this.sources.capture(viewId, references)
    return this.put({ id: randomUUID(), revision: 1, status: 'prepared', appId: 'kaogong', instanceId: context.instance.id, instanceRevision: context.instance.revision, roleId, sessionId: binding.sessionId, bindingRevision: binding.revision, source: { viewId }, text: textOf(text), contexts, ...(preparation ? { preparation } : {}), createdAt: Date.now() })
  }
  prepare(viewId: string, input: { roleId: string; text: unknown; contexts?: Reference[] }) { return this.serial(() => this.create(viewId, input.roleId, input.text, input.contexts ?? [])) }
  prepareOwned(viewId: string, input: { roleId: string; kind: 'lesson' | 'review'; payload: unknown }) {
    return this.serial(async () => {
      const context = await this.workspace.resolveView(viewId), owner = this.owners.get(input.kind)
      if (!owner) throw Error('课堂或讲评记录不可用')
      const plan = await owner.prepare({ appId: 'kaogong', instanceId: context.instance.id, viewId, roleId: input.roleId }, input.payload)
      return this.create(viewId, input.roleId, plan.text, plan.contexts ?? [], { kind: input.kind, id: plan.id, ownerAppId: 'kaogong', ownerVersion: owner.version, token: plan.token })
    })
  }
  private async owned(viewId: string, id: string) { const context = await this.workspace.resolveView(viewId), row = this.row(id); if (row.instanceId !== context.instance.id) throw Error('教学任务不属于当前备考档案'); return row }
  edit(viewId: string, id: string, revision: number, text: unknown, contexts: { id: string; text: string }[]) {
    return this.serial(async () => {
      const row = await this.owned(viewId, id)
      if (row.historicalHandoff) throw Error('保留的旧准备上下文不可编辑发送，请根据当前授权重新准备')
      if (row.status !== 'prepared' || row.revision !== revision) throw Error('教学准备已变化，请刷新')
      if (!Array.isArray(contexts) || contexts.length > row.contexts.length || new Set(contexts.map(row => row.id)).size !== contexts.length || contexts.some(value => !row.contexts.some(row => row.id === value.id) || typeof value.text !== 'string' || value.text.length > 16000)) throw Error('只能编辑或移除已准备的资料上下文')
      return this.put({ ...row, revision: row.revision + 1, text: textOf(text), contexts: contexts.map(value => ({ ...row.contexts.find(row => row.id === value.id)!, text: value.text })) })
    })
  }
  discard(viewId: string, id: string, revision: number) { return this.serial(async () => { const row = await this.owned(viewId, id); if (row.status !== 'prepared' || row.revision !== revision) throw Error('教学准备已变化或已发送'); return this.put({ ...row, revision: row.revision + 1, status: 'discarded' }) }) }
  private async validate(row: Draft) {
    const context = await this.workspace.resolveView(row.source.viewId)
    if (context.instance.id !== row.instanceId || context.instance.revision !== row.instanceRevision) throw Error('备考档案已变化，请重新准备')
    await this.roles.open(row.instanceId, row.roleId, row.sessionId, row.bindingRevision)
    if (row.preparation) await this.owner(row).validate(row as TeachingTask)
    const current = await this.sources.capture(row.source.viewId, row.contexts.map(row => row.reference))
    if (current.length !== row.contexts.length || current.some((value, index) => value.fingerprint !== row.contexts[index]!.fingerprint)) throw Error('资料来源或授权已变化，请重新准备')
  }
  private async finalize(row: Draft) {
    if (!row.preparation) return row
    try { await this.owner(row).accepted(row as TeachingTask); return this.put({ ...row, ownerFinalization: 'done' }) }
    catch { return this.put({ ...row, ownerFinalization: 'pending', notice: 'Native已准入；业务回执待恢复，不会重发。' }) }
  }
  submit(viewId: string, id: string, revision: number) {
    return this.serial(async () => {
      let row = await this.owned(viewId, id)
      if (row.historicalHandoff) throw Error('保留的旧教学回执不可重发，请根据当前授权重新准备')
      if (row.status !== 'prepared' || row.revision !== revision) throw Error('教学任务已变化、已发送或结果未知；不会重发')
      row = { ...row, revision: row.revision + 1, status: 'submitting', requestId: randomUUID(), submittedAt: Date.now() }; await this.put(row)
      let attempted = false
      try {
        if (row.preparation) await this.owner(row).beforeSubmit(row as TeachingTask)
        const accepted = await this.sources.withGrantLease(async () => {
          await this.validate(row)
          const prompt = [row.text, ...row.contexts.map(context => context.title + '\n' + context.text)].join('\n\n')
          attempted = true
          const result = await this.ctx.sessionController.prompt({ sessionId: row.sessionId as never, requestId: row.requestId as never, mode: 'queue', content: [{ type: 'text', text: prompt }] }, AbortSignal.timeout(15000))
          if (result?.accepted !== true) throw Error('Native未返回准入回执')
          await this.ctx.sessionPersistence.flush()
          return this.put({ ...row, status: 'accepted', ownerFinalization: row.preparation ? 'pending' : 'done' })
        })
        return this.finalize(accepted)
      } catch (error) {
        const next: Draft = { ...row, status: attempted ? 'unknown' : 'failed', ...(attempted ? {} : { ownerRejection: 'pending' }), notice: attempted ? '准入结果未知，请查看原生会话；不会自动重发。' : 'Native发送尚未调用；请检查来源和恢复业务发送标记。', error: error instanceof Error ? error.message : '教学准入失败' }
        await this.put(next)
        if (!attempted && next.preparation) { try { await this.owner(next).notAdmitted?.(next as TeachingTask); return this.put({ ...next, ownerRejection: 'done' }) } catch {} }
        return next
      }
    })
  }
  recover(viewId: string, id: string) { return this.serial(async () => { const row = await this.owned(viewId, id); if (row.status === 'accepted') return this.finalize(row); if (row.status === 'failed' && row.ownerRejection && row.preparation) { await this.owner(row).notAdmitted?.(row as TeachingTask); return this.put({ ...row, ownerRejection: 'done' }) } throw Error('Native准入尚未知，不能恢复为可重发任务') }) }
  async close() { this.stopped = true; await this.pending; this.owners.clear() }
}
