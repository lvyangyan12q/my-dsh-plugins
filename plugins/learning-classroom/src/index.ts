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
  ctx.inject(['storageDomain', 'connection'], child => child.effect(async function* () {
    const { openClassroomStateStore } = await import('./state.ts')
    const { installClassroom } = await import('./host.ts')
    const store = await openClassroomStateStore(child)
    const connection = (child as unknown as { connection: { requestRejection(req: IncomingMessage): number | undefined } }).connection
    const app = installClassroom({ store, rejection: req => connection.requestRejection(req) })
    handler = (req, res) => app.handle(req, res)
    yield async () => { handler = undefined; await app.close() }
  }, 'learning classroom host'))
}
