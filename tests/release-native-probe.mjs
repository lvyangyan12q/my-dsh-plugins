// Public native pre-step fixture only; no provider/model/loop substitute and no committed-turn claim.
export const inject = ['personalWorkbenchBindings', 'agents', 'sessionController', 'webServer', 'connection']
export function apply(ctx, config) {
  let settingsChanged = false
  ctx.inject(['settings'], child => child.effect(() => child.webServer.register({ kind: 'exact', path: '/api/ticket11/settings', handler: async (req, res) => {
    const respond = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
    const denial = child.connection.requestRejection(req)
    if (denial !== undefined) { respond(denial, { error: 'Access denied' }); return }
    if (req.method !== 'POST') { respond(405, { error: 'POST required' }); return }
    let stage = 'describe'
    try {
      const before = child.settings.describe({ redactSecrets: true }).find(row => row.ns === 'kaogong')
      if (!before) throw Error('Native settings descriptor unavailable')
      stage = 'update'
      await child.settings.update('kaogong', { questionImageRoot: settingsChanged ? config.originalImageRoot : config.newImageRoot,
        mineru: { outputDir: settingsChanged ? config.originalOutputRoot : config.newOutputRoot, ...(settingsChanged ? {} : { token: 'TICKET11_SYNTHETIC_MARKER' }) } }, before.revision)
      settingsChanged = !settingsChanged
      stage = 'read-after'
      const after = child.settings.describe({ redactSecrets: true }).find(row => row.ns === 'kaogong')
      respond(200, { revisionChanged: after.revision > before.revision,
        tokenPreserved: child.settings.describe().find(row => row.ns === 'kaogong')?.value?.mineru?.token === 'TICKET11_SYNTHETIC_MARKER',
        credentialRedacted: !JSON.stringify(after).includes('TICKET11_SYNTHETIC_MARKER') })
    } catch { respond(409, { error: 'Native configuration update failed', stage }) }
  } })))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/ticket11/native', handler: async (req, res) => {
    const respond = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
    const denial = ctx.connection.requestRejection(req)
    if (denial !== undefined) { respond(denial, { error: 'Access denied' }); return }
    if (req.method !== 'POST') { respond(405, { error: 'POST required' }); return }
    try {
      const { agentEvents } = await import(config.agentModule)
      const { createUserMessage } = await import(config.llmModule)
      const binding = await ctx.personalWorkbenchBindings.ensure(config.key)
      const resolved = await ctx.sessionController.resolveAgent(binding.sessionId)
      const agent = resolved.agent
      if (!agent) throw Error('Native role Agent unavailable')
      const seq = agent.session.seq
      const messages = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic ordinary question' }] })]
      const decision = await agentEvents(ctx, agent).waterfall('agent/pre-step', { messages, turn: 1, step: 1, signal: new AbortController().signal }, async () => ({ kind: 'enter', messages }))
      const instructions = decision.kind === 'enter' ? decision.messages.filter(message => message.source.kind === 'skill-invocation') : []
      respond(200, { sessionId: binding.sessionId, nativeNames: instructions.map(message => message.source.name),
        canonicalBody: instructions.some(message => message.content.some(block => block.type === 'text' && block.text.includes('持久课堂与完成证据'))), durableSeqUnchanged: seq === agent.session.seq })
    } catch { respond(409, { error: 'Native pre-step failed' }) }
  } }))
}
