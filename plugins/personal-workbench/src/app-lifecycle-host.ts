import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { AppLifecycleState, PersonalWorkbenchApps } from './app-lifecycle-api.ts'
const id = z.string().min(1).max(200)
const revision = z.number().int().nonnegative()
export const appLifecycleRecord = z.object({ appId: id, enabled: z.boolean(), revision }).strict()
export const appLifecycleRequest = z.discriminatedUnion('action', [z.object({ action: z.literal('catalog') }).strict(), z.object({ action: z.literal('set-enabled'), appId: id, enabled: z.boolean(), expectedRevision: revision }).strict()])
export const appLifecycleDomain = defineDomain({ name: 'personal_workbench_apps', version: 1, tables: { states: domainTable<string, AppLifecycleState>(appLifecycleRecord) } })
export async function installAppLifecycle(ctx: Context) {
 const domain = await ctx.storageDomain.open(appLifecycleDomain)
 const table = domain.table('states'); const writes = new Map<string, Promise<unknown>>(); const requests = new Set<Promise<void>>(); let closing = false
 const service: PersonalWorkbenchApps = {
 read: appId => { id.parse(appId); const row = table.get(appId); if(row && row.appId !== appId) throw new Error('Application state identity mismatch'); return row ?? { appId, enabled: true, revision: 0 } },
 list: () => ({ version: 1, states: [...table.entries()].map(([key]) => service.read(key)) }),
 setEnabled: async (appId, enabled, expectedRevision) => {
 appLifecycleRequest.parse({ action: 'set-enabled', appId, enabled, expectedRevision }); if(closing) throw new Error('Application lifecycle unavailable')
 const task = (writes.get(appId) ?? Promise.resolve()).catch(() => {}).then(async () => {
 const current = service.read(appId); if(current.revision !== expectedRevision) throw new Error('Application availability changed; refresh and retry')
 const row = { appId, enabled, revision: current.revision + 1 }; await table.put(appId, row); return row
 }); writes.set(appId, task); try { return await task } finally { if(writes.get(appId) === task) writes.delete(appId) }
 },
 }
 const remove = ctx.reflect.provide('personalWorkbenchApps', service)
 const dispatch = async (req: IncomingMessage, res: ServerResponse) => {
 const respond = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) }
 try {
 const rejection = ctx.connection.requestRejection(req); if(rejection !== undefined) { respond(rejection, {error:'Authenticated same-origin request required'}); return }
 if(req.method !== 'POST') { res.setHeader('allow','POST'); respond(405,{error:'POST required'}); return }
 if(!req.headers['content-type']?.startsWith('application/json')) { respond(415,{error:'JSON required'}); return }
 let size=0; const chunks: Buffer[]=[]
 for await(const chunk of req) { const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk); size+=bytes.length; if(size>16384) {respond(413,{error:'Request too large'});return}; chunks.push(bytes) }
 let input: unknown; try {input=JSON.parse(Buffer.concat(chunks).toString('utf8'))} catch {respond(400,{error:'Invalid JSON'});return}
 const parsed=appLifecycleRequest.safeParse(input); if(!parsed.success) {respond(400,{error:'Invalid application lifecycle request'});return}
 const data=parsed.data; if(data.action==='catalog') {respond(200,service.list());return}
 respond(200,{state:await service.setEnabled(data.appId,data.enabled,data.expectedRevision)})
 } catch(error) {respond(409,{error:error instanceof Error?error.message:'Application lifecycle failed'})}
 }
 return {service,handle:(req:IncomingMessage,res:ServerResponse)=>{if(closing){res.writeHead(503);res.end();return Promise.resolve()};const task=dispatch(req,res);requests.add(task);void task.finally(()=>requests.delete(task)).catch(()=>{});return task},dispose:async()=>{closing=true;remove();await Promise.allSettled([...requests,...writes.values()]);await domain.close()}}
}
