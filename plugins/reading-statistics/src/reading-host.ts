import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { readingAppId, readingResource } from './reading-api.ts'
import type { ReadingInstance, ReadingRecord } from './reading-api.ts'
const identity = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.-]+$/)
const recordSchema = z.object({ id: identity, title: z.string().max(200), author: z.string().max(200), category: z.string().max(100), status: z.enum(['reading', 'finished']), minutes: z.number().int().min(0).max(1000000), notes: z.string().max(4000) }).strict()
export const readingDomain = defineDomain({ name: 'reading_statistics', version: 1, tables: { instances: domainTable<string, ReadingInstance>(z.object({ instanceId: identity, initialized: z.boolean(), records: z.array(recordSchema).max(2000) }).strict()) } })
/** Public-domain example titles. This application's initializer owns these records. */
const examples = (): ReadingRecord[] => [
  { id: 'walden', title: 'Walden / 瓦尔登湖', author: 'Henry David Thoreau', category: '文学 Literature', status: 'finished', minutes: 120, notes: '观察自然与日常生活。' },
  { id: 'origin', title: 'On the Origin of Species / 物种起源', author: 'Charles Darwin', category: '科学 Science', status: 'reading', minutes: 60, notes: '整理自然选择的例子。' },
  { id: 'pride', title: 'Pride and Prejudice / 傲慢与偏见', author: 'Jane Austen', category: '文学 Literature', status: 'reading', minutes: 30, notes: '关注人物视角。' },
]
export async function installReading(ctx: Context) {
  const domain = await ctx.storageDomain.open(readingDomain), table = domain.table('instances')
  let unregister: () => void
  try { unregister = ctx.personalWorkbenchRecipes.registerDataSource({ appId: readingAppId, resource: readingResource }) } catch (error) { await domain.close(); throw error }
  let closing = false, tail = Promise.resolve()
  const requests = new Set<Promise<void>>()
  const read = (instanceId: string): ReadingInstance => structuredClone(table.get(identity.parse(instanceId)) ?? { instanceId, initialized: false, records: [] })
  const initialize = (instanceId: string, seed: 'examples' | 'empty' = 'examples') => {
    identity.parse(instanceId)
    const task = tail.catch(() => {}).then(async () => { if (closing) throw new Error('Reading data unavailable'); const existing = table.get(instanceId); if (existing?.initialized) return structuredClone(existing); const row: ReadingInstance = { instanceId, initialized: true, records: seed === 'examples' ? examples() : [] }; await table.put(instanceId, row); return structuredClone(row) })
    tail = task.then(() => {}, () => {}); return task
  }
  const dispatch = async (req: IncomingMessage, res: ServerResponse) => {
    const respond = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) }
    try {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) { respond(rejection, { error: 'Authenticated same-origin request required' }); return }
      if (req.method !== 'POST') { res.setHeader('allow', 'POST'); respond(405, { error: 'POST required' }); return }
      if (!req.headers['content-type']?.startsWith('application/json')) { respond(415, { error: 'JSON required' }); return }
      let size = 0; const chunks: Buffer[] = []
      for await (const chunk of req) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 8192) { respond(413, { error: 'Request too large' }); return } chunks.push(bytes) }
      let input: unknown
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { respond(400, { error: 'Invalid JSON' }); return }
      const parsed = z.object({ action: z.enum(['read', 'initialize']), instanceId: identity, preview: z.boolean().default(false), seed: z.enum(['examples', 'empty']).optional() }).strict().safeParse(input)
      if (!parsed.success) { respond(400, { error: 'Invalid reading request' }); return }
      const data = parsed.data
      if (data.action === 'initialize' && data.preview) { respond(409, { error: 'Preview cannot initialize data' }); return }
      respond(200, { version: 1, instance: data.action === 'read' ? read(data.preview ? 'default' : data.instanceId) : await initialize(data.instanceId, data.seed) })
    } catch (error) { respond(409, { error: error instanceof Error ? error.message : 'Reading request failed' }) }
  }
  return { read, initialize, handle: (req: IncomingMessage, res: ServerResponse) => { if (closing) { res.writeHead(503); res.end(); return Promise.resolve() } const task = dispatch(req, res); requests.add(task); void task.finally(() => requests.delete(task)).catch(() => {}); return task }, dispose: async () => { closing = true; unregister(); await Promise.allSettled([...requests, tail]); await domain.close() } }
}
