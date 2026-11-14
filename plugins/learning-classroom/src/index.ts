import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const name = 'learning-classroom'
export const inject = ['webServer']
export const classroomRoute = '/api/learning-classroom'

/** The `connection` surface this route consults across supported host versions. */
export interface ConnectionService {
  /**
   * dsh 0.2.2-rc.1: returns the refusal status for an untrusted request.
   * Removed in 0.2.2-rc.3 in favour of {@link ConnectionService.admit}.
   */
  requestRejection?(req: IncomingMessage): number | undefined
  /**
   * dsh 0.2.2-rc.3: admits a request against the Web carrier's trust and
   * authentication fence, returning the peer it speaks for or a refusal.
   */
  admit?(req: IncomingMessage): { readonly rejection: 401 | 403 | 503 } | { readonly peer: unknown } | undefined
}

/** Translate either host rejection API into the status this route answers. */
export function requestRejection(connection: ConnectionService, req: IncomingMessage): number | undefined {
  if (typeof connection.requestRejection === 'function') return connection.requestRejection(req)
  const admission = connection.admit?.(req)
  return admission !== undefined && 'rejection' in admission ? admission.rejection : undefined
}

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
  // `connection.admit` (dsh 0.2.2-rc.3) resolves its authentication provider
  // through the calling Context, so the sub-service must be injected here too.
  ctx.inject(['storageDomain', 'connection', 'connection.authentication', 'tools'], child => child.effect(async function* () {
    const { openClassroomStateStore } = await import('./state.ts')
    const { installClassroom } = await import('./host.ts')
    const { createTeacherTools } = await import('./teacher-tools.ts')
    const store = await openClassroomStateStore(child)
    const connection = (child as unknown as { connection: ConnectionService }).connection
    const app = installClassroom({ store, rejection: req => requestRejection(connection, req) })
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
