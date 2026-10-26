import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-skill'
import type { StudyWorkspace } from './study-workspace.ts'
import { kaogongRoleDefinitions, kaogongRolePresets, teachingSkillProvider } from './role-definitions.ts'
import { kaogongRoleScopeOwner } from './role-session-scope.ts'
import type { StudyRoleScopeOwner } from './study-contracts.ts'

type RoleBinding = { instanceId: string; roleId: string; sessionId: string; presetId: string; phase: 'intent' | 'ready'; revision: number; creation: { cwd: string }; previousSessionIds: string[]; creationAttempt?: string; [key: string]: unknown }
const keyOf = (instanceId: string, roleId: string) => JSON.stringify([instanceId, roleId])
const identity = (row: RoleBinding) => JSON.stringify([row.instanceId, row.roleId, row.sessionId, row.presetId, row.creation.cwd, row.revision])
const canonicalPath = async (file: string) => { try { return (await realpath(file)).toLowerCase() } catch { return resolve(file).toLowerCase() } }

/** Owns only Kaogong standard Native Sessions. A durable intent precedes creation;
 * uncertain results never create a replacement identity or resend a prompt. */
export class StudyRoles {
  private owner?: StudyRoleScopeOwner
  private operations: Promise<unknown> = Promise.resolve()
  private catalogOperations: Promise<unknown> = Promise.resolve()
  private live = new Map<string, { agent: Agent; identity: string; active: boolean; remove(): void | Promise<void> }>()
  private removers: (() => void)[] = []
  private stopped = false
  constructor(private ctx: Context, private workspace: StudyWorkspace, private cwd?: string) {}
  async install() {
    this.owner = kaogongRoleScopeOwner(this.ctx, await kaogongRolePresets())
    this.removers.push(this.ctx.on('agent/created', async ({ agent }) => { await this.mountNative(agent) }))
    this.removers.push(this.ctx.on('agent/pre-step', async ({ agent }, next) => { await this.assertNative(agent); return next() }))
    return () => this.close()
  }
  private rows() { return [...this.workspace.domain.table('bindings').entries()].map(([, row]) => row as RoleBinding) }
  private async profile(instanceId: string) { const row = await this.workspace.assertProfile(instanceId); if (row.kind !== 'learner') throw Error('资料库不能创建学习角色'); return row }
  private definition(roleId: string, binding?: Pick<RoleBinding, 'creation'> | null) {
    const cwd = binding?.creation.cwd ?? this.cwd
    if (!cwd || !isAbsolute(cwd)) throw Error('请配置并登记考公角色的绝对工作目录')
    const definition = kaogongRoleDefinitions(cwd).find(row => row.id === roleId)
    if (!definition) throw Error('应用未声明此角色。')
    return definition
  }
  private async registered(cwd: string) {
    const actual = await canonicalPath(cwd)
    for (const row of this.ctx.workspaceRegistry.list()) if (await canonicalPath(row.path) === actual) return row
    throw Error('请先在原生DSH登记角色工作目录')
  }
  private catalog<T>(operation: () => Promise<T>) {
    const task = this.catalogOperations.then(operation); this.catalogOperations = task.catch(() => {}); return task
  }
  private serial<T>(operation: () => Promise<T>) {
    if (this.stopped) return Promise.reject(Error('考公角色已停止'))
    const task = this.operations.then(operation); this.operations = task.catch(() => {}); return task
  }
  private async validateSkill(scope: object, cwd: string) {
    const snapshot = await this.ctx.skills.snapshot({ scope, cwd })
    if (!snapshot.complete) throw Error('角色Skills目录不完整')
    const skill = await this.ctx.skills.get('kaogong-teach', { scope, cwd })
    if (!skill || skill.provider !== teachingSkillProvider || !skill.invocation.modelInvocable || !skill.invocation.userInvocable) throw Error('考公私有Skill来源或调用许可无效')
  }
  private async validateRole(roleId: string, cwd: string) {
    this.definition(roleId, { creation: { cwd } }); await this.registered(cwd)
    if (!this.owner) throw Error('考公私有角色尚未安装')
    await this.catalog(async () => {
      const preset = await this.ctx.agentPresets.resolve('standard')
      if (preset.broken) throw Error('原生standard预设不可用')
      const base = await this.ctx.agentPresets.acquireScope('standard')
      let privateScope: Awaited<ReturnType<StudyRoleScopeOwner['prepare']>> | undefined
      try { privateScope = await this.owner!.prepare({ capabilityId: roleId, cwd, baseScope: base.key }); await this.validateSkill(privateScope.scope, cwd) }
      finally { await privateScope?.dispose(); await base[Symbol.asyncDispose]() }
    })
  }
  private async validateStored(row: RoleBinding) {
    const stored = await this.ctx.sessionPersistence.stat(row.sessionId as never)
    if (!stored || stored.header.id !== row.sessionId || stored.formatStatus !== 'current' || typeof stored.header.cwd !== 'string') throw Error('原生角色会话缺失或格式需原生迁移')
    const projection = await this.ctx.sessionController.projections({ sessionId: row.sessionId as never }, new AbortController().signal)
    if (!projection || projection.kind !== 'sequenced' || projection.values.agentPreset !== row.presetId || row.presetId !== 'standard') throw Error('原生角色预设与持久绑定不一致')
    if (await canonicalPath(stored.header.cwd) !== await canonicalPath(row.creation.cwd)) throw Error('原生角色工作目录已变化')
    const workspace = await this.registered(row.creation.cwd)
    if (!workspace.sessionIds.includes(row.sessionId as never)) throw Error('角色会话不在登记的原生工作区中')
  }
  async read(instanceId: string, roleId: string) {
    await this.profile(instanceId)
    const binding = this.rows().find(row => row.instanceId === instanceId && row.roleId === roleId) ?? null
    this.definition(roleId, binding)
    if (binding?.phase === 'ready') await this.validateStored(binding)
    return { binding: structuredClone(binding) }
  }
  ensure(instanceId: string, roleId: string, viewId?: string) {
    return this.serial(async () => {
      await this.profile(instanceId)
      if (viewId && (await this.workspace.resolveView(viewId)).instance.id !== instanceId) throw Error('学习视图不属于角色档案')
      const table = this.workspace.domain.table('bindings'), key = keyOf(instanceId, roleId)
      let row = table.get(key) as RoleBinding | undefined
      const definition = this.definition(roleId, row)
      await this.validateRole(roleId, definition.creation.cwd)
      if (row?.phase === 'ready') { await this.validateStored(row); if (viewId && row.viewId !== viewId) { row = { ...row, viewId }; await table.put(key, row) }; return structuredClone(row) }
      if (row) throw Error('原生创建结果未确认，请核对原会话；不会自动重试或创建替代会话')
      row = { key, appId: 'kaogong', instanceId, roleId, sessionId: randomUUID(), presetId: 'standard', revision: 1, phase: 'intent', creationAttempt: 'not-started', creation: definition.creation, previousSessionIds: [], sessionScoped: true, agent: definition.agent, ...(viewId ? { viewId } : {}) }
      await table.put(key, row)
      row = { ...row, creationAttempt: 'started' }; await table.put(key, row)
      const workspace = await this.registered(row.creation.cwd)
      if (await this.ctx.sessionPersistence.stat(row.sessionId as never)) throw Error('预留原生Session已存在，请核对后恢复')
      let created
      try { created = await this.ctx.sessionController.create({ sessionId: row.sessionId as never, agentPreset: 'standard', workspaceId: workspace.id }) }
      catch (error) { throw new Error('原生角色创建结果未知，原意图已保留；不会自动重发', { cause: error }) }
      if (created.sessionId !== row.sessionId || created.agentPreset !== row.presetId) throw Error('原生创建返回身份不一致')
      await this.ctx.sessionPersistence.flush(); await this.validateStored(row)
      row = { ...row, phase: 'ready', revision: row.revision + 1 }; await table.put(key, row)
      const live = this.live.get(row.sessionId); if (live) live.identity = identity(row)
      return structuredClone(row)
    })
  }
  async open(instanceId: string, roleId: string, sessionId: string, revision: number) {
    const { binding } = await this.read(instanceId, roleId)
    if (!binding || binding.phase !== 'ready' || binding.sessionId !== sessionId || binding.revision !== revision) throw Error('角色绑定已变化，请刷新后打开')
    return { sessionId }
  }
  async sessionContext(instanceId: string, sessionId: string) {
    await this.profile(instanceId)
    const row = this.rows().find(row => row.instanceId === instanceId && row.sessionId === sessionId && row.phase === 'ready')
    if (!row) throw Error('此原生会话不是当前备考档案的有效角色')
    await this.validateStored(row)
    return { roleId: row.roleId }
  }
  async restoredSessionContext(sessionId: string) {
    const bindings = this.rows().filter(row => row.sessionId === sessionId && row.phase === 'ready')
    if (bindings.length !== 1) throw Error('原生会话没有唯一有效的考公角色绑定')
    const row = bindings[0]!, state = await this.workspace.list()
    const views = state.views.filter(view => view.profileId === row.instanceId && (typeof row.viewId !== 'string' || view.id === row.viewId))
    if (views.length !== 1) throw Error('原生角色没有唯一已登记的学习视图，请从考公总览重新打开')
    const context = await this.workspace.resolveView(views[0]!.id)
    return { profile: context.profile, view: { id: context.view.id, profileId: context.instance.id }, ...await this.sessionContext(context.instance.id, sessionId) }
  }
  private bound(agent: Agent) {
    if (agent.id !== agent.session.id) throw Error('Native Agent身份不一致')
    const rows = this.rows(), binding = rows.find(row => row.sessionId === agent.session.id)
    if (!binding && rows.some(row => row.previousSessionIds.includes(agent.session.id))) throw Error('旧角色会话为只读历史')
    return binding
  }
  private async nativeIdentity(binding: RoleBinding, agent: Agent) {
    await this.profile(binding.instanceId); this.definition(binding.roleId, binding)
    if (typeof agent.session.header.cwd !== 'string' || this.ctx.agentPresets.presetForSession(agent.session) !== binding.presetId || await canonicalPath(agent.session.header.cwd) !== await canonicalPath(binding.creation.cwd)) throw Error('Native角色身份、预设或目录已变化')
    if (binding.phase === 'ready') await this.validateStored(binding)
  }
  private async mountNative(agent: Agent) {
    const binding = this.bound(agent)
    if (!binding) return
    if (this.stopped || !this.owner || binding.phase !== 'ready' && binding.creationAttempt !== 'started') throw Error('考公角色作用域不可用')
    await this.nativeIdentity(binding, agent)
    await this.catalog(async () => {
      const existing = this.live.get(agent.id)
      if (existing) { if (!existing.active || existing.agent !== agent) throw Error('考公角色作用域已变化'); return }
      const remove = await this.owner!.mount({ capabilityId: binding.roleId, cwd: binding.creation.cwd, context: agent.ctx })
      try { await this.validateSkill(agent, binding.creation.cwd) } catch (error) { await remove(); throw error }
      const record = { agent, identity: identity(binding), active: true, remove }; this.live.set(agent.id, record)
      // This guard belongs to the Agent, surviving plugin unload until it leaves.
      agent.ctx.on('agent/pre-step', async ({ agent: current }, next) => {
        if (current !== agent || !record.active || this.stopped) throw Error('考公角色已停用，请重新打开原生会话')
        await this.assertNative(agent); return next()
      })
      agent.ctx.effect(() => async () => { record.active = false; if (this.live.get(agent.id) === record) this.live.delete(agent.id); await this.catalog(() => Promise.resolve(record.remove())) }, 'kaogong private role scope')
    })
  }
  private async assertNative(agent: Agent) {
    const binding = this.bound(agent)
    if (!binding) return
    const record = this.live.get(agent.id)
    if (this.stopped || binding.phase !== 'ready' || !record?.active || record.agent !== agent || record.identity !== identity(binding)) throw Error('考公角色作用域或绑定不可用')
    await this.nativeIdentity(binding, agent); await this.catalog(() => this.validateSkill(agent, binding.creation.cwd))
  }
  async resolveSession(_appId: string, sessionId: string, _options?: { access: 'read' | 'write' }) {
    const binding = this.rows().find(row => row.sessionId === sessionId), record = this.live.get(sessionId)
    if (!binding || !record) throw Error('Native会话未绑定考公档案或私有角色未挂载')
    await this.assertNative(record.agent)
    return { appId: 'kaogong', instanceId: binding.instanceId, roleId: binding.roleId, sessionId }
  }
  async close() {
    if (this.stopped) return
    this.stopped = true; for (const remove of this.removers.splice(0)) remove(); await this.operations
    const records = [...this.live.values()]; this.live.clear(); for (const record of records) record.active = false
    await this.catalog(async () => { for (const record of records) await record.remove() })
  }
}
