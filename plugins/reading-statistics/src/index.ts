import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-personal-workbench'
import type { IncomingMessage, ServerResponse } from 'node:http'
export const name = 'reading-statistics'
export const inject = ['webServer']
export function apply(ctx: Context) {
  let handler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/reading-statistics/data', handler: (req, res) => { if (handler) { void handler(req, res); return } res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Reading data unavailable' })) } }), 'reading statistics route')
  ctx.inject(['storageDomain', 'connection', 'personalWorkbenchRecipes'], child => child.effect(async function* () { const { installReading } = await import('./reading-host.ts'); const owner = await installReading(child); handler = owner.handle; yield async () => { handler = undefined; await owner.dispose() } }, 'reading statistics own data'))
}
