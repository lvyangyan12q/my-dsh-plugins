import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-personal-workbench'
import type { IncomingMessage, ServerResponse } from 'node:http'
export const name = 'reading-statistics'
export const inject = ['webServer']
export function apply(ctx: Context) {
  let handler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/reading-statistics/data', handler: (req, res) => { if (handler) { void handler(req, res); return } res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Reading data unavailable' })) } }), 'reading statistics route')
  ctx.inject(['storageDomain', 'connection'], child => child.effect(async function* () { const { installReading } = await import('./reading-host.ts'); const owner = await installReading(child); handler = owner.handle;
    child.inject(['worktableResources'], resourceCtx => resourceCtx.effect(() => resourceCtx.get('worktableResources').register(owner.resource), 'reading data resource'));
    yield async () => { handler = undefined; await owner.dispose() } }, 'reading statistics own data'))
  ctx.inject(['personalWorkbenchRecipes'], child => child.effect(() => installLegacyReading(child), 'reading legacy recipe adapter'))
  ctx.inject(['worktableApplications'], child => child.effect(async function* () {
    const dispose = await child.get('worktableApplications').contribute({ id: 'reading-statistics', title: '阅读统计', version: '0.1.0', protocolVersion: 1, kind: 'deep', views: [{ id: 'page', title: '完整阅读页' }, { id: 'stats', title: '统计' }, { id: 'list', title: '列表' }] })
    yield dispose
  }, 'reading deep application'))
  ctx.inject(['worktableRoles','profileContext'], child => child.effect(() => child.get('worktableRoles').contribute('reading-statistics', [{ id: 'assistant', title: '阅读助手', agent: { kind: 'agent', source: 'managed', id: 'reading-helper' }, creation: { cwd: child.get('profileContext').cwd } }]), 'reading optional role'))
}
export function installLegacyReading(ctx: Context) {
  const disposers: (() => void)[] = []
  try {
    disposers.push(ctx.personalWorkbenchRecipes.registerDataSource({ appId: 'reading-statistics', resource: 'reading-records' }))
    disposers.push(ctx.personalWorkbenchRecipes.registerModule({ id: 'reading-record-editor', validate: (_module, recipe) => recipe.appId === 'reading-statistics' ? [] : ['Reading editor belongs to reading-statistics'] }))
  } catch (error) { for (const dispose of disposers.reverse()) dispose(); throw error }
  return () => { for (const dispose of disposers.reverse()) dispose() }
}
