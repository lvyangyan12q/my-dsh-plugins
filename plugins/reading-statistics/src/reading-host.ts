import { randomUUID, createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { readingIdentityMaxLength, readingIdentityPattern } from './reading-api.ts'
import type { ReadingInstance, ReadingRecord } from './reading-api.ts'
const identity = z.string().min(1).max(readingIdentityMaxLength).regex(readingIdentityPattern)
const recordSchema = z.object({ id: identity, title: z.string().max(200), author: z.string().max(200), category: z.string().max(100), status: z.enum(['reading', 'finished']), minutes: z.number().int().min(0).max(1000000), notes: z.string().max(4000) }).strict()
export const readingDomain = defineDomain({ name: 'reading_statistics', version: 1, tables: { instances: domainTable<string, ReadingInstance>(z.object({ instanceId: identity, initialized: z.boolean(), records: z.array(recordSchema).max(2000) }).strict()) } })
const revisionDomain = defineDomain({ name: 'reading_statistics_revisions', version: 1, tables: { instances: domainTable<string, { revision: number }>(z.object({ revision: z.number().int().min(0) }).strict()) } })
/** Public-domain example titles. This application's initializer owns these records. */
const examples = (): ReadingRecord[] => [
  { id: 'walden', title: 'Walden / 瓦尔登湖', author: 'Henry David Thoreau', category: '文学 Literature', status: 'finished', minutes: 120, notes: '观察自然与日常生活。' },
  { id: 'origin', title: 'On the Origin of Species / 物种起源', author: 'Charles Darwin', category: '科学 Science', status: 'reading', minutes: 60, notes: '整理自然选择的例子。' },
  { id: 'pride', title: 'Pride and Prejudice / 傲慢与偏见', author: 'Jane Austen', category: '文学 Literature', status: 'reading', minutes: 30, notes: '关注人物视角。' },
]
export async function installReading(ctx: Context) {
  const domain = await ctx.storageDomain.open(readingDomain), table = domain.table('instances')
  let revisions: Awaited<ReturnType<typeof ctx.storageDomain.open<typeof revisionDomain>>>
  try { revisions = await ctx.storageDomain.open(revisionDomain) } catch (error) { await domain.close(); throw error }
  const revisionTable = revisions.table('instances')
  let closing = false, tail = Promise.resolve(), disposePromise: Promise<void> | undefined
  const requests = new Set<Promise<void>>()
  const read = (instanceId: string): ReadingInstance => {
    const row = structuredClone(table.get(identity.parse(instanceId)) ?? { instanceId, initialized: false, records: [] })
    return { ...row, revision: `${revisionTable.get(instanceId)?.revision ?? 0}:${createHash('sha256').update(JSON.stringify(row)).digest('hex')}` }
  }
  const commit = async (instanceId: string, row: ReadingInstance, authorize?: () => Promise<void>) => {
    // Save conflict metadata first. Its failure prevents business writes; a failed business write only invalidates stale editors.
    await revisionTable.put(instanceId, { revision: (revisionTable.get(instanceId)?.revision ?? 0) + 1 })
    await authorize?.()
    const { revision: _revision, ...business } = row
    await table.put(instanceId, business)
    return read(instanceId)
  }
  const initialize = (instanceId: string, seed: 'examples' | 'empty' = 'examples', expectedRevision?: string, authorize?: () => Promise<void>) => {
    identity.parse(instanceId)
    const task = tail.catch(() => {}).then(async () => { if (closing) throw new Error('Reading data unavailable'); await authorize?.(); const existing = table.get(instanceId); if (authorize && expectedRevision !== read(instanceId).revision) throw new Error('阅读资料已更新，请刷新后重新编辑。'); if (existing?.initialized) return read(instanceId); const row: ReadingInstance = { instanceId, initialized: true, records: seed === 'examples' ? examples() : [] }; return commit(instanceId, row, authorize) })
    tail = task.then(() => {}, () => {}); return task
  }
  const mutate = (data: { action: string; instanceId: string; record?: Omit<ReadingRecord, 'id'>; recordId?: string; confirmed?: boolean }, expectedRevision?: string, authorize?: () => Promise<void>) => {
    const task = tail.catch(() => {}).then(async () => {
      if (closing) throw new Error('Reading data unavailable')
      await authorize?.()
      const row = read(data.instanceId)
      if (authorize && expectedRevision !== row.revision) throw new Error('阅读资料已更新，请刷新后重新编辑。')
      if (data.action === 'create') {
        if (!data.record || !data.record.title.trim()) throw new Error('A reading title is required')
        if (row.records.length >= 2000) throw new Error('Reading record limit reached')
        row.records.push({ id: randomUUID(), ...data.record })
      } else {
        const index = row.records.findIndex(record => record.id === data.recordId)
        if (index < 0) throw new Error('Reading record not found in this instance')
        if (data.action === 'delete') { if (data.confirmed !== true) throw new Error('Confirm deletion first'); row.records.splice(index, 1) }
        else { if (!data.record || !data.record.title.trim()) throw new Error('A reading title is required'); row.records[index] = { id: row.records[index]!.id, ...data.record } }
      }
      row.initialized = true
      return commit(data.instanceId, row, authorize)
    })
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
      const parsed = z.object({ action: z.enum(['read', 'initialize', 'create', 'update', 'delete']), instanceId: identity, preview: z.boolean().default(false), seed: z.enum(['examples', 'empty']).optional(), record: recordSchema.omit({ id: true }).optional(), recordId: identity.optional(), confirmed: z.boolean().optional() }).strict().safeParse(input)
      if (!parsed.success) { respond(400, { error: 'Invalid reading request' }); return }
      respond(403, { code: 'instance-context-required', error: '任意实例ID数据入口已关闭，请从工作台已登记视图访问资料。' }); return
    } catch (error) { respond(409, { error: error instanceof Error ? error.message : 'Reading request failed' }) }
  }
  const withTaskLease = <T,>(operation: () => Promise<T>) => { const task = tail.catch(() => {}).then(async () => { if (closing) throw new Error('Reading data unavailable'); return operation() }); tail = task.then(() => {}, () => {}); return task }
  return { resource: { withTaskLease, taskContext: (value: ReadingInstance, selection: unknown) => {
    const chosen = z.object({ ids: z.array(identity).max(50), filter: z.object({ category: z.string().max(400), status: z.string().max(400), search: z.string().max(400) }).strict() }).strict().parse(selection);
    const matching = value.records.filter(record => (!chosen.filter.category || record.category === chosen.filter.category) && (!chosen.filter.status || record.status === chosen.filter.status) && (!chosen.filter.search || (record.title + ' ' + record.author).toLocaleLowerCase().includes(chosen.filter.search.toLocaleLowerCase())));
    if (chosen.ids.some(id => !matching.some(record => record.id === id))) throw new Error('所选阅读记录已变化，请重新选择。');
    const records = chosen.ids.length ? matching.filter(record => chosen.ids.includes(record.id)) : matching.slice(0, 20);
    return { title: '阅读记录与筛选', text: JSON.stringify({ filter: chosen.filter, selectedIds: chosen.ids, records, truncated: !chosen.ids.length && matching.length > 20 }, null, 2) };
  }, appId: 'reading-statistics', resourceId: 'reading-records', actions: ['initialize', 'create', 'update', 'delete'], read, mutate: (instanceId: string, action: string, payload: unknown, revision: string, authorize: () => Promise<void>) => {
    const parsed = z.object({ seed: z.enum(['examples','empty']).optional(), record: recordSchema.omit({id:true}).optional(), recordId: identity.optional(), confirmed: z.boolean().optional() }).strict().parse(payload ?? {});
    if (typeof revision !== 'string' || !/^[0-9]+:[a-f0-9]{64}$/.test(revision)) throw new Error('写入需要当前资料版本，请刷新。');
    if (action === 'initialize') return initialize(instanceId, parsed.seed, revision, authorize);
    if (!['create','update','delete'].includes(action)) throw new Error('不支持此阅读动作。');
    return mutate({ ...parsed, instanceId, action }, revision, authorize)
  } }, read, initialize, handle: (req: IncomingMessage, res: ServerResponse) => { if (closing) { res.writeHead(503); res.end(); return Promise.resolve() } const task = dispatch(req, res); requests.add(task); void task.finally(() => requests.delete(task)).catch(() => {}); return task }, dispose: () => { if (!disposePromise) { closing = true; disposePromise = (async () => { await Promise.allSettled([...requests, tail]); const closed = await Promise.allSettled([domain.close(), revisions.close()]); const failures = closed.filter((result): result is PromiseRejectedResult => result.status === 'rejected'); if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Reading storage cleanup failed; both handles were processed') })() } return disposePromise } }
}
