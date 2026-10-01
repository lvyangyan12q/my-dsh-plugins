import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-permission-presets/types'
import type {} from '@deepseek-ai/dsh-workspace'
import type { SkillSummary } from '@deepseek-ai/dsh-skill'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type { RoleBindingKey, RoleDefinition } from './role-binding-api.ts'
import type { ManagedRole, ManagedSkill, ManagementCatalog, SkillAssignment } from './management-api.ts'
import { bindingKey } from './role-bindings.ts'
import { managementDomain, managementRequest } from './management-domain.ts'
import { installAssignmentRuntime } from './management-runtime.ts'

/** Allowlisted projections only: never export arbitrary preset/provider configuration. */
export async function installManagement(ctx: Context) {
  const domain = await ctx.storageDomain.open(managementDomain)
  const assignments = domain.table('assignments')
  const pending = new Map<string, Promise<unknown>>()
  const requests = new Set<Promise<void>>()
  let closing = false
  const read = (key: RoleBindingKey): SkillAssignment => {
    const saved = assignments.get(bindingKey(key))
    if (saved && bindingKey(saved.key) !== bindingKey(key)) throw new Error('Stored assignment key mismatch')
    return saved ?? { version: 1, key, revision: 0, names: [] }
  }
  const declared = (key: RoleBindingKey) => {
    const definition = ctx.personalWorkbenchBindings.listRoles().find(row => bindingKey(row.key) === bindingKey(key))
    if (!definition) throw new Error('Role declaration unavailable')
    return definition
  }
  const projectSkill = (skill: SkillSummary): ManagedSkill => ({ name: skill.name, description: skill.description,
    source: skill.source, provider: skill.provider, userInvocable: skill.invocation.userInvocable,
    modelInvocable: skill.invocation.modelInvocable,
    appIds: [...new Set(ctx.personalWorkbenchBindings.listRoles().filter(row => row.teaching?.provider === skill.provider
      && row.teaching.skillName === skill.name).map(row => row.key.appId))] })
  const scoped = async <T>(definition: RoleDefinition, visit: (scope: ScopeKey, cwd: string | undefined) => Promise<T>) => {
    const preset = await ctx.agentPresets.resolve(definition.presetId)
    if (preset.broken) throw new Error('Role preset unavailable')
    const binding = await ctx.personalWorkbenchBindings.read(definition.key)
    if (binding && binding.presetId !== definition.presetId) throw new Error('Recorded role preset changed')
    if (binding?.phase === 'intent') throw new Error('Role Session creation is incomplete; retry the same ID')
    if (binding) {
      if (ctx.get('workspaceRegistry')?.archivedSessionIds.includes(binding.sessionId)) throw new Error('Role Session archived; restore it in DSH before assigning')
      const baseline = await ctx.sessionController.projections({ sessionId: binding.sessionId }, new AbortController().signal)
      if (!baseline || baseline.values.agentPreset !== definition.presetId) throw new Error('Role Session missing or preset changed; restore access or explicitly replace it')
      const inspection = await ctx.sessionController.inspect(binding.sessionId)
      if (!inspection) throw new Error('Role Session unavailable')
      const agent = ctx.agents.get(binding.sessionId)
      if (agent) return visit(agent, agent.session.header.cwd)
      const lease = await ctx.agentPresets.acquireScope(binding.presetId)
      try { return await visit(lease.key, inspection.meta.cwd) } finally { await lease[Symbol.asyncDispose]() }
    }
    if (!definition.creation?.cwd) throw new Error('Role creation cwd unavailable; configure the app or restore its existing Session')
    const lease = await ctx.agentPresets.acquireScope(definition.presetId)
    try { return await visit(lease.key, definition.creation?.cwd) } finally { await lease[Symbol.asyncDispose]() }
  }
  const role = async (definition: RoleDefinition): Promise<ManagedRole> => {
    const assignment = read(definition.key)
    const binding = await ctx.personalWorkbenchBindings.read(definition.key)
    const unavailable: ManagedRole = { key: definition.key, presetId: definition.presetId,
      name: definition.display?.name ?? definition.key.roleId, source: definition.display?.source ?? 'app-declaration',
      ...(definition.display?.bundleName ? { bundleName: definition.display.bundleName } : {}),
      available: false, binding, assignment, skills: [], missingNames: [...assignment.names], scope: 'preset', tools: [],
      model: null, permissions: { currentValue: null, sandboxMode: null, approvalPolicy: null, workspaceRoot: null, provenance: 'unavailable', sandboxOrigin: 'unavailable', approvalOrigin: 'unavailable' }, loaded: [] }
    try {
      return await scoped(definition, async (scope, cwd) => {
        const live = binding ? ctx.agents.get(binding.sessionId) : undefined
        const registry = live ? ctx.agentPresets.serviceFor(live, 'skills') ?? ctx.skills : ctx.skills
        const snapshot = await registry.snapshot({ scope, cwd })
        if (!snapshot.complete) throw new Error('Role Skill catalog is incomplete')
        const skills = snapshot.skills.map(projectSkill)
        const tools = live ? ctx.agentPresets.serviceFor(live, 'tools') ?? ctx.tools : ctx.tools
        const baseline = binding ? await ctx.sessionController.projections({ sessionId: binding.sessionId }, new AbortController().signal) : null
        const inspection = binding ? await ctx.sessionController.inspect(binding.sessionId) : null
        const loaded = inspection?.events.flatMap(event => {
          if (event.type !== 'user/message' || event.data.source.kind !== 'skill-invocation' || event.data.source.form !== 'instructions') return []
          if (!event.data.content.some(block => block.type === 'text' && block.text.trim())) return []
          return [{ name: event.data.source.name, seq: Number(event.seq) }]
        }) ?? []
        const sandbox = live ? ctx.agentPresets.serviceFor(live, 'sandboxPolicy') : undefined
        const approval = live ? ctx.agentPresets.serviceFor(live, 'approval') : undefined
        const policy = sandbox?.resolve({ session: live!.session })
        const currentValue = baseline?.values.permissions?.currentValue ?? null
        return { ...unavailable, available: true, scope: live ? 'live-agent' : 'preset', skills,
          missingNames: assignment.names.filter(name => !skills.some(skill => skill.name === name && skill.userInvocable)),
          tools: tools.schemas(scope).map(tool => ({ name: tool.name, description: tool.description })),
          model: baseline?.values.modelSelection ?? null, loaded,
          permissions: { currentValue, sandboxMode: policy?.mode ?? null, workspaceRoot: policy?.workspaceRoot ?? null,
            approvalPolicy: approval && live ? approval.overrideOf(live.session) ?? approval.config.policy ?? 'ask' : null,
            sandboxOrigin: sandbox && live ? sandbox.overrideOf(live.session) === undefined ? 'composition-default' : 'session-override' : 'unavailable',
            approvalOrigin: approval && live ? approval.overrideOf(live.session) === undefined ? 'composition-default' : 'session-override' : 'unavailable',
            provenance: policy || approval ? 'native-live-policy' : currentValue ? 'native-session-projection' : 'unavailable' } }
      })
    } catch (error) { return { ...unavailable, error: error instanceof Error ? error.message : 'Role catalog unavailable' } }
  }
  const catalog = async (): Promise<ManagementCatalog> => {
    const definitions = ctx.personalWorkbenchBindings.listRoles()
    const roles = await Promise.all(definitions.map(role))
    const owned = new Set(definitions.map(row => row.presetId))
    const presets = (await ctx.agentPresets.list()).filter(row => !owned.has(row.id)).map(row => ({ id: row.id,
      ...(row.name === undefined ? {} : { name: row.name }), ...(row.description === undefined ? {} : { description: row.description }),
      ...(row.broken === undefined ? {} : { broken: row.broken }) }))
    const global = await ctx.skills.snapshot()
    const skills = global.complete ? global.skills.map(projectSkill) : []
    // modelCatalog may perform provider IO. Expose saved Session selections here; native bundle navigation owns configuration.
    return { version: 1, roles, presets, skills, ...(global.complete ? {} : { globalSkillError: 'Global Skill catalog is incomplete' }), models: null, modelError: 'Model catalog requires native provider lookup; use native configuration.', runtimeAvailable: true }
  }
  const assign = (key: RoleBindingKey, expectedRevision: number, names: readonly string[]) => {
    const id = bindingKey(key)
    const previous = pending.get(id) ?? Promise.resolve()
    const task = previous.catch(() => {}).then(async () => {
      const definition = declared(key)
      const current = read(key)
      if (current.revision !== expectedRevision) throw new Error('Assignment changed; refresh before saving')
      await scoped(definition, async (scope, cwd) => {
        const binding = await ctx.personalWorkbenchBindings.read(key)
        const live = binding ? ctx.agents.get(binding.sessionId) : undefined
        const registry = live ? ctx.agentPresets.serviceFor(live, 'skills') ?? ctx.skills : ctx.skills
        const snapshot = await registry.snapshot({ scope, cwd })
        if (!snapshot.complete) throw new Error('Role Skill catalog is incomplete')
        for (const name of names) if (!snapshot.skills.some(skill => skill.name === name && skill.invocation.userInvocable)) throw new Error(`Skill unavailable for this role: ${name}`)
      })
      if (declared(key) !== definition) throw new Error('Role declaration changed during save')
      const value: SkillAssignment = { version: 1, key: { ...key }, revision: current.revision + 1, names: [...names] }
      await assignments.put(id, value)
      return value
    })
    pending.set(id, task)
    void task.finally(() => { if (pending.get(id) === task) pending.delete(id) }).catch(() => {})
    return task
  }
  const removeRuntime = installAssignmentRuntime(ctx, id => assignments.get(id))
  const dispatch = async (req: IncomingMessage, res: ServerResponse) => {
    const respond = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) }
    try {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) { respond(rejection, { error: 'Authenticated same-origin request required' }); return }
      if (req.method !== 'POST') { res.setHeader('allow', 'POST'); respond(405, { error: 'POST required' }); return }
      if (!req.headers['content-type']?.startsWith('application/json')) { respond(415, { error: 'JSON required' }); return }
      let size = 0
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += bytes.length
        if (size > 16384) { respond(413, { error: 'Management request too large' }); return }
        chunks.push(bytes)
      }
      let body: unknown
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { respond(400, { error: 'Invalid JSON' }); return }
      const parsed = managementRequest.safeParse(body)
      if (!parsed.success) { respond(400, { error: 'Invalid management request' }); return }
      const data = parsed.data
      if (data.action === 'catalog') respond(200, await catalog())
      else respond(200, { assignment: await assign(data.key, data.expectedRevision, data.names) })
    } catch (error) { respond(409, { error: error instanceof Error ? error.message : 'Management unavailable' }) }
  }
  return {
    handle: (req: IncomingMessage, res: ServerResponse) => {
      if (closing) { res.writeHead(503); res.end(); return Promise.resolve() }
      const task = dispatch(req, res)
      requests.add(task)
      void task.finally(() => requests.delete(task)).catch(() => {})
      return task
    },
    dispose: async () => { closing = true; await removeRuntime(); await Promise.allSettled([...requests, ...pending.values()]); await domain.close() },
  }
}
