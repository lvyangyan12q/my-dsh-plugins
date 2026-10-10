import type { Context, Events } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { SkillAssignment } from './management-api.ts'
import { bindingKey } from './role-bindings.ts'

/** Only the native tool-skill loader produces instruction bodies. This adapter supplies gestures. */
export function installAssignmentRuntime(ctx: Context, read: (key: string) => SkillAssignment | undefined, agentSkills: (presetId: string) => readonly string[] = () => []): () => Promise<void> {
  const admitted = new WeakMap<Agent, number>()
  const tasks = new Set<Promise<PreStepDecision>>()
  const run = async ({ agent, messages, turn, step, signal }: Parameters<Events['agent/pre-step']>[0], next: () => Promise<PreStepDecision>): Promise<PreStepDecision> => {
    if (step !== 1 || admitted.get(agent) === turn || !messages.some(message => message.source.kind === 'user')) return next()
    const definitions = ctx.personalWorkbenchBindings.listRoles()
    const candidates = await Promise.all(definitions.map(async definition => ({ definition, binding: await ctx.personalWorkbenchBindings.read(definition.key) })))
    const matches = candidates.filter(row => row.binding?.phase === 'ready' && row.binding.sessionId === agent.id)
    const presetId = ctx.agentPresets.composedPreset?.(agent.ctx)
    const reusableNames = presetId ? agentSkills(presetId) : []
    if (!matches.length && !reusableNames.length) return next()
    if (matches.length > 1) throw new Error('Ambiguous role Session assignment')
    const match = matches[0]
    if (match) {
      if (match.binding!.presetId !== match.definition.presetId) throw new Error('Assigned role preset changed')
      const baseline = await ctx.sessionController.projections({ sessionId: agent.id }, signal)
      if (!baseline || baseline.values.agentPreset !== match.definition.presetId) throw new Error('Assigned role Session preset unavailable')
    }
    const names = [...new Set([...reusableNames, ...(match ? [...(match.definition.skillNames ?? []), ...(read(bindingKey(match.definition.key))?.names ?? [])] : [])])]
    if (!names.length) { admitted.set(agent, turn); return next() }
    const registry = ctx.agentPresets.serviceFor(agent, 'skills') ?? ctx.skills
    const snapshot = await registry.snapshot({ cwd: agent.session.header.cwd, scope: agent, signal })
    if (!snapshot.complete) throw new Error('Assigned role Skill catalog is incomplete')
    const catalog = snapshot.skills
    for (const name of names) {
      if (!catalog.some(skill => skill.name === name && skill.invocation.userInvocable)) throw new Error(`Assigned Skill unavailable: ${name}`)
    }
    signal.throwIfAborted()
    const index = messages.findIndex(message => message.source.kind === 'user')
    const original = messages[index]!
    // The public waterfall shares the claimed batch with native listeners and the loop terminal.
    // Keep the explicit assigned gestures in the admitted user record for transcript provenance.
    messages[index] = { ...original, content: [...original.content, { type: 'text', text: names.map(name => `/${name}`).join(' ') }] }
    try {
      const decision = await next()
      if (decision.kind === 'reject') return decision
      signal.throwIfAborted()
      for (const name of names) {
        if (!decision.messages.some(message => message.source.kind === 'skill-invocation' && message.source.name === name
          && message.content.some(block => block.type === 'text' && block.text.trim()))) {
          throw new Error(`Native Skill loader did not admit assigned Skill: ${name}`)
        }
      }
      admitted.set(agent, turn)
      return decision
    } finally { messages[index] = original }
  }
  const remove = ctx.on('agent/pre-step', (payload, next) => {
    const task = run(payload, next)
    tasks.add(task)
    void task.finally(() => tasks.delete(task)).catch(() => {})
    return task
  }, { prepend: true })
  return async () => { remove(); await Promise.allSettled([...tasks]) }
}
