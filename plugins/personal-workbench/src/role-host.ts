import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SkillDefinition } from '@deepseek-ai/dsh-skill'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RoleBinding, RoleBindingKey, RoleDefinition } from './role-binding-api.ts'
import { roleBindingsDomain } from './role-domain.ts'
import { RoleBindings } from './role-bindings.ts'
import { roleRequest, teachingPrompt } from './role-request.ts'


/** Activate only under optional authorities; no Agent or model is created at registration. */
export async function installRoles(ctx: Context) {
  const domain = await ctx.storageDomain.open(roleBindingsDomain)
  try {
    const readTeachingSkill = async (definition: RoleDefinition, presetId = definition.presetId): Promise<SkillDefinition | undefined> => {
      const preset = await ctx.agentPresets.resolve(presetId)
      if (preset.broken) throw new Error('Role preset is unavailable')
      if (!definition.teaching) return
      const { skillName, provider } = definition.teaching
      const lease = await ctx.agentPresets.acquireScope(presetId)
      try {
        const catalog = await ctx.skills.list({scope:lease.key})
        if (!catalog.some(skill=>skill.name===skillName&&skill.provider===provider)) throw new Error('Packaged role Skill not discovered')
        const skill = await ctx.skills.get(skillName, {scope: lease.key})
        if (!skill || skill.provider !== provider || !skill.content.trim() || !skill.invocation.userInvocable) throw new Error('Packaged role Skill body unavailable for user invocation')
        return skill
      } finally { await lease[Symbol.asyncDispose]() }
    }
    const loadSkill = async (definition: RoleDefinition) => {
      await ctx.agentPresets.resolve(definition.presetId).then(row => { if(row.broken)throw new Error('Role preset is unavailable') })
      try { return (await readTeachingSkill(definition))?.content } catch(error) {
        const declared = bindings.declaredDefinition(definition.key)
        if (declared.presetId === definition.presetId) throw error
        // The application owns teaching rules; changing the reusable Agent does not erase them.
        return (await readTeachingSkill(definition,declared.presetId))?.content
      }
    }
    const validateExisting = async (record: RoleBinding) => {
      if (record.presetId !== bindings.definition(record.key).presetId) throw new Error('Recorded role preset unavailable')
      const baseline = await ctx.sessionController.projections({ sessionId: record.sessionId }, new AbortController().signal)
      if (!baseline) throw new Error('Teacher Session missing; retry the same ID or explicitly create a replacement')
      if (baseline.values.agentPreset !== record.presetId) throw new Error('Teacher Session preset changed; explicit replacement required')
    }
    const bindings = new RoleBindings(domain.table('bindings'), {
      validate: async definition => { await loadSkill(definition) },
      validateExisting,
      create: async record => {
        // Old 06 intents lack a location: adopt only a proven existing native Session.
        let cwd = record.creation?.cwd
        if (!cwd) {
          const existing = await ctx.sessionController.inspect(record.sessionId)
          if (!existing) throw new Error('Legacy intent has no creation location; explicitly replace it')
          cwd = existing.meta.cwd
          if (!cwd) throw new Error('Legacy Session creation location unavailable')
        }
        const value = await ctx.sessionController.create({ sessionId: record.sessionId, agentPreset: record.presetId, cwd })
        if (value.agentPreset !== record.presetId) throw new Error('Native teacher preset identity mismatch')
        if (value.sessionId !== record.sessionId) throw new Error('Native Session identity mismatch')
        // Native blank Sessions are lazy: ready requires a public header durability barrier.
        // The service-wide barrier also drains other active native write handles, without creating turns.
        await ctx.sessionPersistence.flush()
        return value.sessionId
      },
    })
    const attached = new WeakMap<Agent,Promise<void>>()
    const attachTeaching = (agent: Agent) => {
      const previous = attached.get(agent); if(previous)return previous
      const task = (async()=>{
        const definitions = bindings.listRoles()
        for(const definition of definitions){
          const binding = await bindings.read(definition.key)
          if(binding?.sessionId!==agent.id || !binding.selectedPreset || !definition.teaching)continue
          const source = bindings.declaredDefinition(definition.key)
          const skill = await readTeachingSkill(definition,source.presetId)
          if(!skill)continue
          // Scope this vetted, packaged contribution to the application's role Session only.
          await agent.ctx.plugin({inject:['skills'],apply:child=>{child.skills.register(skill)}})
        }
      })(); attached.set(agent,task);return task
    }
    const removeAttach = ctx.on('agent/created',async({agent})=>{await attachTeaching(agent)})
    const removeService = ctx.reflect.provide('personalWorkbenchBindings', bindings)
    const requests = new Set<Promise<void>>()
    let closing = false
    const dispatch = async (req: IncomingMessage, res: ServerResponse) => {
      const respond = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) }
      let failedKey: RoleBindingKey | undefined
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
          if (size > 131072) { respond(413, { error: 'Lesson evidence too large' }); return }
          chunks.push(bytes)
        }
        let input: unknown
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { respond(400, { error: 'Invalid JSON' }); return }
        const parsed = roleRequest.safeParse(input)
        if (!parsed.success) { respond(400, { error: 'Invalid role request' }); return }
        const data = parsed.data
        failedKey = data.key
        if (data.action === 'read') {
          const binding = await bindings.read(data.key)
          if (binding?.phase === 'ready') { await loadSkill(bindings.definition(data.key)); await validateExisting(binding) }
          respond(200, { binding }); return
        }
        if (data.action === 'retry' || data.action === 'replace') { respond(200, { binding: await bindings[data.action](data.key, data.expectedSessionId as SessionId) }); return }
        if (data.action === 'ensure') { respond(200, { binding: await bindings.ensure(data.key) }); return }
        const definition = bindings.definition(data.key)
        if (!definition.teaching) throw new Error('Teaching is not declared for this role')
        if (data.key.subject !== undefined && data.key.subject !== data.evidence.context.subject) throw new Error('Teaching subject does not match binding')
        await loadSkill(definition)
        const binding = await bindings.ensure(data.key)
        respond(200, { binding, prompt: teachingPrompt(data.evidence, definition.teaching.skillName), skill: { name: definition.teaching.skillName, provider: definition.teaching.provider, preflightBodyReadable: true } })
      } catch (error) {
        const binding = failedKey ? await bindings.read(failedKey).catch(() => null) : null
        respond(409, { error: error instanceof Error ? error.message : 'Teacher operation failed', binding })
      }
    }
    const handle = (req: IncomingMessage, res: ServerResponse) => {
      if (closing) { res.writeHead(503); res.end(); return Promise.resolve() }
      const task = dispatch(req, res)
      requests.add(task)
      void task.finally(() => requests.delete(task)).catch(() => {})
      return task
    }
    return { handle, dispose: async () => { closing = true; removeAttach(); removeService(); await Promise.allSettled([...requests]); await bindings.dispose(); await domain.close() } }
  } catch (error) { await domain.close(); throw error }
}
