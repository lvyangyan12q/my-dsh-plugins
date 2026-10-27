import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, rm, lstat, readdir, realpath, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { mountKaogong } from '../src/production-host.ts'

const native = process.env.DSH_SOURCE ?? 'D:/programming/workspace/deepseek-harness'
const require = createRequire(resolve(native, 'packages/client/ui-renderer/package.json'))
const { Context } = require('@deepseek-ai/cordis')
const load = file => import(pathToFileURL(resolve(native, file)).href)
const { default: Storage } = await load('packages/storage/storage/lib/index.js')
const { JsonStorageBackend } = await load('packages/storage/storage-json/lib/index.js')
const { DomainFacility } = await load('packages/storage/storage-domain/lib/index.js')

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'kaogong-standalone-'))
  const context = new Context()
  await context.plugin(Storage)
  const backend = new JsonStorageBackend(join(root, 'storage'))
  context.storage.backend.register('json', backend)
  const facility = new DomainFacility(context, { backend: 'json' })
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
    await writeFile(join(source, 'kaogong_bank.json'), JSON.stringify({ unit: { name: 'kaogong_bank', version: 2 }, global: null, tables: { questions: { first: question } } }))
    await writeFile(join(source, 'kaogong_knowledge.json'), JSON.stringify({ unit: { name: 'kaogong_knowledge', version: 1 }, global: null, tables: { entries: {} } }))
  }
  const stop = await mountKaogong(ctx, { questionImageRoot: { get: () => undefined }, mineru: { get: () => undefined }, ...(options.source ? { materialSourceHome: join(root, 'source') } : {}) })
  const request = async (path, body, auth = true) => {
    const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
    Object.assign(req, { url: path, method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, auth })
    const res = { status: 0, headersSent: false, writeHead(status) { this.status = status; this.headersSent = true }, end(value) { this.value = JSON.parse(value) } }
    const route = routes.get('exact:' + path.split('?')[0])
    assert.ok(route, path)
    await route.handler(req, res)
    return res
  }
  return { request, tools, async close() {
    await stop(); await backend.close(); await context.fiber.dispose()
    const actual = await realpath(root), base = await realpath(tmpdir())
    assert.ok(actual.toLowerCase().startsWith((base + '/').replaceAll('/', '\\').toLowerCase()) || actual.startsWith(base + '/'))
    assert.ok(actual.includes('kaogong-standalone-'))
    const scan = async file => { const stat = await lstat(file); assert.equal(stat.isSymbolicLink(), false); if (stat.isDirectory()) for (const name of await readdir(file)) await scan(join(file, name)) }
    await scan(actual)
    await rm(actual, { recursive: true })
  } }
}
test('plan HTTP uses the existing authenticated Host view gate and saves only explicitly confirmed previews',async()=>{
 const app=await fixture()
 try{
  const made=await app.request('/api/kaogong/study',{action:'create',title:'计划档案',kind:'learner',confirmed:true}),view=made.value.view.id
  assert.equal((await app.request('/api/kaogong/plan?viewId='+view,undefined,false)).status,403)
  assert.equal((await app.request('/api/kaogong/plan?viewId=foreign')).status,403)
  const empty=await app.request('/api/kaogong/plan?viewId='+view);assert.equal(empty.value.goal,null)
  const preview=await app.request('/api/kaogong/plan?viewId='+view,{action:'preview',operation:'append',baseRevision:0,task:{subject:'行测-资料分析',kind:'learn',title:'阅读总结',requirePractice:false}})
  assert.equal(preview.status,200);assert.equal((await app.request('/api/kaogong/plan?viewId='+view)).value.tasks.length,0)
  const confirmed=await app.request('/api/kaogong/plan?viewId='+view,{action:'confirm',id:preview.value.id,revision:0,confirmed:true});assert.equal(confirmed.value.tasks.length,1)
  const taskId=confirmed.value.tasks[0].id,start=await app.request('/api/kaogong/plan/start?viewId='+view,{id:taskId,revision:1})
  assert.equal(start.status,200)
  const retry=await app.request('/api/kaogong/plan/start?viewId='+view,{id:taskId,revision:1});assert.equal(retry.value.lesson.lesson.request.lessonId,start.value.lesson.lesson.request.lessonId)
  const lessonId=start.value.lesson.lesson.request.lessonId
  await app.request('/api/kaogong/lesson/summary?viewId='+view,{lessonId,notes:'手动阅读总结已保存'})
  assert.equal((await app.request('/api/kaogong/plan?viewId='+view)).value.tasks[0].status,'in-progress')
  assert.equal((await app.request('/api/kaogong/lesson/confirm?viewId='+view,{lessonId,confirmed:true})).status,200)
  assert.equal((await app.request('/api/kaogong/plan?viewId='+view)).value.tasks[0].status,'completed')
 }finally{await app.close()}
})

test('without Worktable, Host lists an empty study space and creates a profile only after authenticated learner confirmation', async () => {
  const app = await fixture()
  try {
    assert.equal((await app.request('/api/kaogong/study', undefined, false)).status, 401)
    assert.deepEqual((await app.request('/api/kaogong/study')).value.profiles, [])
    assert.equal((await app.request('/api/kaogong/study', { action: 'create', title: '备考档案', kind: 'learner' })).status, 409)
    const created = await app.request('/api/kaogong/study', { action: 'create', title: '备考档案', kind: 'learner', confirmed: true })
    assert.equal(created.status, 200)
    assert.equal(created.value.profile.title, '备考档案')
    assert.notEqual(created.value.profile.id, 'default')
    const view = created.value.view.id
    assert.equal((await app.request('/api/kaogong/dashboard?viewId=' + view)).status, 200)
    assert.equal((await app.request('/api/kaogong/dashboard?viewId=' + view + '&instanceId=other')).status, 403)
    assert.equal(await app.tools.get('kaogong_list_questions').options.when({ agent: { session: { id: 'ordinary-native-session' } } }), false)
  } finally { await app.close() }
})

test('a confirmed local library import can be granted and revoked without Worktable, while original question scoring remains Host-owned', async () => {
  const app = await fixture({ source: true })
  try {
    const create = async kind => (await app.request('/api/kaogong/study', { action: 'create', title: kind, kind, confirmed: true })).value
    const library = await create('library'), learner = await create('learner')
    const preview = await app.request('/api/kaogong/material-import', { action: 'prepare', viewId: library.view.id })
    assert.equal(preview.status, 200)
    assert.equal(preview.value.counts.bank, 1)
    const applied = await app.request('/api/kaogong/material-import', { action: 'apply', viewId: library.view.id, id: preview.value.id, fingerprint: preview.value.fingerprint, confirmed: true })
    assert.equal(applied.status, 200)
    const shared = await app.request('/api/kaogong/study', { action: 'source-share', viewId: learner.view.id, ownerViewId: library.view.id, resourceId: 'question-bank' })
    assert.equal(shared.status, 200)
    const issued = await app.request('/api/kaogong/practice/start?viewId=' + learner.view.id, { subject: '行测-资料分析', limit: 1 })
    assert.equal(issued.status, 200)
    assert.equal(JSON.stringify(issued.value).includes('correctAnswer'), false)
    const scored = await app.request('/api/kaogong/practice/submit?viewId=' + learner.view.id, { roundId: issued.value.roundId, answers: [{ id: 'first', answer: 'B' }] })
    assert.equal(scored.status, 200)
    assert.equal(scored.value.correctCount, 1)
    const revoked = await app.request('/api/kaogong/study', { action: 'source-revoke', viewId: learner.view.id, id: shared.value.id, revision: shared.value.revision })
    assert.equal(revoked.status, 200)
    const empty = await app.request('/api/kaogong/practice/start?viewId=' + learner.view.id, { subject: '行测-资料分析', limit: 1 })
    assert.equal(empty.status, 403)
    assert.equal((await app.request('/api/kaogong/practice/read?viewId=' + learner.view.id, { roundId: issued.value.roundId })).status, 403)
    assert.equal((await app.request('/api/kaogong/study', { action: 'source-share', viewId: learner.view.id, ownerViewId: library.view.id, resourceId: 'question-bank' })).status, 200)
    const preserved = await app.request('/api/kaogong/practice/read?viewId=' + learner.view.id, { roundId: issued.value.roundId })
    assert.equal(preserved.value.result.correctCount, 1)
  } finally { await app.close() }
})
