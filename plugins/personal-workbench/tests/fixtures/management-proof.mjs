// Synthetic declaration for the offline installed-Host resolution check, never a product catalog entry.
export const inject = ['agentPresets', 'personalWorkbenchBindings', 'agents', 'sessionController', 'webServer', 'connection']
export function apply(ctx, config) {
  ctx.effect(async function* () {
    const { agentEvents } = await import(config.agentModule)
    const { createUserMessage } = await import(config.llmModule)
    const removePreset = await ctx.agentPresets.register({ id: 'ticket09.proof', plugins: [
      { name: '@deepseek-ai/dsh-skill-filesystem', config: { providerName: 'ticket09-proof', includeDefaultRoots: false, bundledSkillDir: config.skillRoot, watch: false } },
      { name: '@deepseek-ai/dsh-tool-skill' },
    ] })
    const removeRole = ctx.personalWorkbenchBindings.registerRole({ key: { appId: 'ticket09-proof', instanceId: 'default', roleId: 'proof' }, presetId: 'ticket09.proof', creation: { cwd: config.skillRoot } })
    const removeRoute = ctx.webServer.register({ kind: 'exact', path: '/api/ticket09-proof/pre-step', handler: async (req, res) => {
      const respond = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) }
      const denial = ctx.connection.requestRejection(req)
      if (denial !== undefined) { respond(denial, { error: 'Authentication required' }); return }
      if (req.method !== 'POST') { respond(405, { error: 'POST required' }); return }
      try {
        const binding = await ctx.personalWorkbenchBindings.ensure({ appId: 'ticket09-proof', instanceId: 'default', roleId: 'proof' })
        const agent = ctx.agents.get(binding.sessionId)
        if (!agent) throw new Error('Native role Agent unavailable')
        const seq = agent.session.seq
        const messages = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Ordinary synthetic question' }] })]
        const decision = await agentEvents(ctx, agent).waterfall('agent/pre-step', { messages, turn: 1, step: 1, signal: new AbortController().signal },
          async () => ({ kind: 'enter', messages }))
        const native = decision.kind === 'enter' ? decision.messages.filter(message => message.source.kind === 'skill-invocation') : []
        respond(200, { sessionId: binding.sessionId, presetId: binding.presetId, phase: binding.phase,
          nativeNames: native.map(message => message.source.name), canonicalBody: native.some(message => message.content.some(block => block.type === 'text' && block.text.includes('These instructions exist only for the offline ticket09 package test.'))),
          durableSeqUnchanged: seq === agent.session.seq })
      } catch (error) { respond(409, { error: error instanceof Error ? error.message : 'Pre-step probe failed' }) }
    } })
    yield async () => { removeRoute(); removeRole(); await removePreset() }
  })
}
