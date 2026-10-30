import { randomUUID } from 'node:crypto'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain, DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

const profile = z.object({ id: z.string().min(1), kind: z.enum(['learner', 'library']), title: z.string().min(1), revision: z.number().int().positive(), projectId: z.string().nullable().optional() }).passthrough()
const view = z.object({ id: z.string().min(1), profileId: z.string().min(1) }).passthrough()
export const studyWorkspaceDomain = defineDomain({
  name: 'kaogong_study_workspace', version: 1,
  global: { schema: z.object({ profiles: z.array(profile), views: z.array(view), lastProfileId: z.string().nullable() }), initial: { profiles: [], views: [], lastProfileId: null } },
  tables: {
    bindings: domainTable(z.object({ instanceId: z.string(), roleId: z.string(), sessionId: z.string(), presetId: z.string(), phase: z.enum(['intent', 'ready']), revision: z.number().int().positive(), creation: z.object({ cwd: z.string() }), previousSessionIds: z.array(z.string()) }).passthrough()),
    grants: domainTable(z.object({ id: z.string(), ownerInstanceId: z.string(), consumerInstanceId: z.string(), resourceId: z.enum(['question-bank', 'materials']), status: z.enum(['active', 'revoked']), revision: z.number().int().positive() }).passthrough()),
    teaching: domainTable(z.object({ id: z.string(), instanceId: z.string(), roleId: z.string(), sessionId: z.string(), status: z.string(), revision: z.number().int().positive() }).passthrough()),
    handoffs: domainTable(z.unknown()),
  },
})
export type StudyProfile = z.infer<typeof profile>
export type StudyView = z.infer<typeof view>
export type StudyWorkspaceDomain = Domain<typeof studyWorkspaceDomain>
const application = (kind: StudyProfile['kind']) => ({ id: kind === 'library' ? 'kaogong-library' : 'kaogong', title: kind === 'library' ? '考公资料库' : '考公学习', kind: 'deep' as const, enabled: true })

/** Only study profiles and their registered browser contexts live here. It does
 * not discover applications, run migrations, or open an old global domain. */
export class StudyWorkspace {
  private pending: Promise<unknown> = Promise.resolve()
  private stopped = false
  constructor(readonly domain: StudyWorkspaceDomain) {}
  static async open(facility: Pick<DomainFacility, 'open'>) { return new StudyWorkspace(await facility.open(studyWorkspaceDomain)) }
  change<T>(operation: (state: ReturnType<StudyWorkspaceDomain['global']['get']>) => T) {
    if (this.stopped) return Promise.reject(Error('考公档案已关闭'))
    const task = this.pending.then(async () => {
      const state = structuredClone(this.domain.global.get())
      const result = operation(state)
      await this.domain.global.set(state)
      return structuredClone(result)
    })
    this.pending = task.catch(() => {})
    return task
  }
  async list() { await this.pending; return structuredClone(this.domain.global.get()) }
  async create(title: unknown, kind: unknown, confirmed: unknown) {
    if (confirmed !== true || typeof title !== 'string' || !title.trim() || title.length > 100 || !['learner', 'library'].includes(String(kind))) throw Error('请明确确认备考档案名称和类型')
    return this.change(state => {
      const row: StudyProfile = { id: randomUUID(), kind: kind as StudyProfile['kind'], title: title.trim(), revision: 1 }
      const context: StudyView = { id: randomUUID(), profileId: row.id }
      state.profiles.push(row); state.views.push(context)
      if (kind === 'learner') state.lastProfileId = row.id
      return { profile: row, view: context }
    })
  }
  async open(id: unknown) {
    return this.change(state => {
      const row = state.profiles.find(row => row.id === id)
      if (!row) throw Error('备考档案不存在')
      let context = state.views.find(row => row.profileId === id)
      if (!context) { context = { id: randomUUID(), profileId: row.id }; state.views.push(context) }
      if (row.kind === 'learner') state.lastProfileId = row.id
      return { profile: row, view: context }
    })
  }
  async assertProfile(id: string) {
    for (const [, value] of this.domain.table('handoffs').entries()) {
      const receipt=value as {status?:unknown;profiles?:{id:string}[]} | null
      if(receipt&&['applying','unknown'].includes(String(receipt.status))&&receipt.profiles?.some(row=>row.id===id))throw Error('当前档案承接结果待核对，原记录保留')
    }
    const state = await this.list(), row = state.profiles.find(row => row.id === id)
    if (!row || id === 'default') throw Error('需要明确的备考档案')
    return row
  }
  async resolveView(id: string) {
    const state = await this.list(), context = state.views.find(row => row.id === id)
    if (!context) throw Error('学习视图未登记')
    const row = state.profiles.find(row => row.id === context.profileId)
    if (!row) throw Error('学习视图所属档案不可用')
    await this.assertProfile(row.id)
    const app = application(row.kind)
    return { profile: row, application: app, instance: { ...row, appId: app.id, projectId: row.projectId ?? null }, view: { ...context, instanceId: row.id, type: 'page' } }
  }
  async snapshot() {
    const state = await this.list()
    return { applications: [application('learner'), application('library')], instances: state.profiles.map(row => ({ ...row, appId: application(row.kind).id, projectId: row.projectId ?? null })), views: state.views.map(row => ({ ...row, instanceId: row.profileId, type: 'page' })) }
  }
  async close() { this.stopped = true; await this.pending; await this.domain.close() }
}
