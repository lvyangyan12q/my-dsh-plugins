import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, rm, lstat, readdir, realpath, mkdir, writeFile, readFile, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { mountKaogong } from '../src/production-host.ts'
import { materialsSourceFixture } from './materials-source-fixture.mjs'
import { inspectMaterials, materialEvidenceSnapshot } from '../src/materials-inspection.mjs'
import { inspectLegacyMaterialEvidence } from '../src/legacy-material-evidence.mjs'

const native = process.env.DSH_SOURCE ?? 'D:/programming/workspace/deepseek-harness'
const require = createRequire(resolve(native, 'packages/client/ui-renderer/package.json'))
const { Context } = require('@deepseek-ai/cordis')
const load = file => import(pathToFileURL(resolve(native, file)).href)
const { default: Storage } = await load('packages/storage/storage/lib/index.js')
const { JsonStorageBackend } = await load('packages/storage/storage-json/lib/index.js')
const { DomainFacility } = await load('packages/storage/storage-domain/lib/index.js')

export async function fixture(options = {}) {
  const root = options.root ?? await mkdtemp(join(tmpdir(), 'kaogong-standalone-'))
  const context = new Context()
  await context.plugin(Storage)
  const backend = new JsonStorageBackend(join(root, 'storage'))
  context.storage.backend.register('json', backend)
  const facility = new DomainFacility(context, { backend: 'json' })
  if (options.storageFault || options.globalFault) {
    const open = facility.open.bind(facility)
    facility.open = async spec => {
      const domain = await open(spec), table = domain.table.bind(domain)
      if(options.globalFault&&spec.global){const set=domain.global.set.bind(domain.global);domain.global.set=async value=>{options.globalFault(spec.name,value);await set(value)}}
      domain.table = name => {
        const value = table(name), put = value.put.bind(value)
        return new Proxy(value,{get(target,key){if(key==='put')return async(id,row)=>{await put(id,row);options.storageFault?.(spec.name,name,row)};const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v}})
      }
      return domain
    }
  }
  const routes = new Map(), tools = new Map()
  const ctx = {
    storageDomain: facility,
    connection: { admit: req => req.auth ? { peer: {} } : { rejection: 401 } },
    webServer: { register: route => { routes.set(route.kind + ':' + route.path, route); return () => routes.delete(route.kind + ':' + route.path) } },
    tools: { register: (tool, options) => { tools.set(tool.name, { tool, options }); return () => tools.delete(tool.name) } },
    on: () => () => {},
  }
  if (options.source) {
    const source = join(root, 'source', 'storages')
    await mkdir(source, { recursive: true })
    const question = { subject: '行测-资料分析', knowledgePoint: '直接读取', questionType: '单选', stem: '数列第一项为2，直接读取第一项是多少？', options: ['A. 1', 'B. 2'], correctAnswer: 'B', explanation: '第一项为2。', difficulty: 'easy', source: '合成边界题', origin: 'local', reviewStatus: 'approved', reviewNotes: '', tags: [], createdAt: '2026-10-26', reviewedAt: '2026-10-26' }
    await writeFile(join(source, 'kaogong_bank.json'), JSON.stringify({ unit: { name: 'kaogong_bank', version: 2 }, global: null, tables: { questions: options.source === true ? { first: question } : Object.fromEntries(Array.from({length:options.source},(_,i)=>["q"+i,{...question,knowledgePoint:i<5?"直接读取":"增长率"}])) } }))
    await writeFile(join(source, 'kaogong_knowledge.json'), JSON.stringify({ unit: { name: 'kaogong_knowledge', version: 1 }, global: null, tables: { entries: {} } }))
  }
  const stop = await mountKaogong(ctx, { questionImageRoot: { get: () => undefined }, mineru: { get: () => undefined }, ...(options.source || options.sourceHome ? { materialSourceHome: options.sourceHome ?? join(root, 'source') } : {}), ...options.config })
  const request = async (path, body, auth = true) => {
    const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
    Object.assign(req, { url: path, method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, auth })
    const res = { status: 0, headersSent: false, writeHead(status) { this.status = status; this.headersSent = true }, end(value) { this.value = Buffer.isBuffer(value) ? value : value === undefined ? null : JSON.parse(value) } }
    const route = routes.get('exact:' + path.split('?')[0])
    assert.ok(route, path)
    await route.handler(req, res)
    return res
  }
  return { request, tools, root, async duplicateHistoricalRound(instanceId,id) {
    const {instanceDomainSpecs}=await import('../src/domain.ts')
    const domain=await facility.open(instanceDomainSpecs(instanceId).practice),table=domain.table('rounds')
    const old=table.get(id),copy=structuredClone(old),next=crypto.randomUUID()
    copy.context.title='第二轮历史依据';await table.put(next,copy);await domain.close();return next
  }, async seedKnowledge(instanceId, rows) { const {instanceDomainSpecs}=await import('../src/domain.ts'); const domain=await facility.open(instanceDomainSpecs(instanceId).knowledge); for(const [id,row] of Object.entries(rows)){if(row===null)await domain.table('entries').delete(id);else await domain.table('entries').put(id,row);} await domain.close(); }, async suspend() { await stop(); await backend.close(); await context.fiber.dispose(); return root }, async close() {
    await stop(); await backend.close(); await context.fiber.dispose()
    const actual = await realpath(root), base = await realpath(tmpdir())
    assert.ok(actual.toLowerCase().startsWith((base + '/').replaceAll('/', '\\').toLowerCase()) || actual.startsWith(base + '/'))
    assert.ok(actual.includes('kaogong-standalone-'))
    const scan = async file => { const stat = await lstat(file); assert.equal(stat.isSymbolicLink(), false); if (stat.isDirectory()) for (const name of await readdir(file)) await scan(join(file, name)) }
    await scan(actual)
    await rm(actual, { recursive: true })
  } }
}

