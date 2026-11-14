import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const name = 'learning-classroom'
export const inject = ['webServer']
export const classroomRoute = '/api/learning-classroom'

/**
 * Host entry. The vault file operations and navigation state live on the Host
 * side; the browser only talks to this one HTTP endpoint.
 */
export function apply(ctx: Context) {
  let handler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: classroomRoute,
    handler: (req, res) => {
      if (handler) return handler(req, res)
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: '学习课堂暂不可用。', code: 'unavailable' }))
    },
  }), 'learning classroom route')
  ctx.inject(['storageDomain', 'connection', 'tools'], child => child.effect(async function* () {
    const { openClassroomStateStore } = await import('./state.ts')
    const { installClassroom } = await import('./host.ts')
    const { createTeacherTools } = await import('./teacher-tools.ts')
    const store = await openClassroomStateStore(child)
    const connection = (child as unknown as { connection: { requestRejection(req: IncomingMessage): number | undefined } }).connection
    const app = installClassroom({ store, rejection: req => connection.requestRejection(req) })
    const tools = (child as unknown as {
      tools: {
        register(
          definition: unknown,
          options?: { when?: (context: { agent: { id: string } }) => boolean },
        ): () => void
      }
    }).tools
    const disposers = createTeacherTools({
      hasBoundSession: sessionId => app.hasBoundSession(sessionId),
      writeGenerated: (sessionId, kind, draft, options) => app.writeGenerated(sessionId, kind, draft, options),
    }).map(entry => tools.register(entry.definition, {
      // A teacher tool is only declared to the exact Session bound to a space;
      // the execute path still re-resolves and rejects, never trusting the model.
      when: context => entry.visibleFor(context.agent.id),
    }))
    handler = (req, res) => app.handle(req, res)
    yield async () => {
      for (const dispose of disposers) dispose()
      handler = undefined
      await app.close()
    }
  }, 'learning classroom host'))
}
