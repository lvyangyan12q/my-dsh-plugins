import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {LegacyRecipeService} from './legacy-contract.ts'
import {requireProtocol} from 'dsh-worktable/sdk'
import type { IncomingMessage, ServerResponse } from 'node:http'
export const name = 'reading-statistics'
export const inject = ['webServer']
export function apply(ctx: Context) {
  let handler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/reading-statistics/data', handler: (req, res) => { if (handler) { void handler(req, res); return } res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Reading data unavailable' })) } }), 'reading statistics route')
  ctx.inject(['storageDomain', 'connection'], child => child.effect(async function* () { const { installReading } = await import('./reading-host.ts'); const owner = await installReading(child); handler = owner.handle;
    child.inject(['worktableResources','worktableProtocol'], resourceCtx => resourceCtx.effect(() => { const resources=resourceCtx.get('worktableResources');if(!resources)throw Error('Worktable resources unavailable');requireProtocol(resourceCtx.worktableProtocol.describe(),['resource-reference-v1']);return resources.register(owner.resource) }, 'reading data resource'));
    yield async () => { handler = undefined; await owner.dispose() } }, 'reading statistics own data'))
  ctx.inject(['personalWorkbenchRecipes'], child => child.effect(() => installLegacyReading(child as unknown as {personalWorkbenchRecipes:LegacyRecipeService}), 'reading legacy recipe adapter'))
  ctx.inject(['worktableApplications','worktableProtocol'], child => child.effect(async function* () {
    const applications=child.get('worktableApplications');if(!applications)throw Error('Worktable applications unavailable');requireProtocol(child.worktableProtocol.describe(),['application-registration-v1']);const dispose = await applications.contribute({ id: 'reading-statistics', title: '阅读统计', version: '0.2.3-rc.3.2', protocolVersion: 1, kind: 'deep', views: [{ id: 'page', title: '完整阅读页' }, { id: 'stats', title: '统计' }, { id: 'list', title: '列表' }] })
    yield dispose
  }, 'reading deep application'))
  ctx.inject(['worktableRoles','profileContext'], child => child.effect(() => { const roles=child.get('worktableRoles'),profile=child.get('profileContext');if(!roles||!profile)throw Error('Reading role context unavailable');return roles.contribute('reading-statistics', [{ id: 'assistant', title: '阅读助手', agent: { kind: 'agent', source: 'managed', id: 'reading-helper' }, creation: { cwd: profile.cwd } }]) }, 'reading optional role'))
}
export function installLegacyReading(ctx: {personalWorkbenchRecipes:LegacyRecipeService}) {
  const disposers: (() => void)[] = []
  try {
    disposers.push(ctx.personalWorkbenchRecipes.registerDataSource({ appId: 'reading-statistics', resource: 'reading-records' }))
    disposers.push(ctx.personalWorkbenchRecipes.registerModule({ id: 'reading-record-editor', validate: (_module, recipe) => recipe.appId === 'reading-statistics' ? [] : ['Reading editor belongs to reading-statistics'] }))
  } catch (error) { for (const dispose of disposers.reverse()) dispose(); throw error }
  return () => { for (const dispose of disposers.reverse()) dispose() }
}
