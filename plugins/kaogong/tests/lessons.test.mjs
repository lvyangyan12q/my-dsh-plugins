import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { Lessons } from '../src/lessons.ts'
import { PracticeRounds } from '../src/practice-rounds.ts'
import { lessonDomainSpec, knowledgeDomainSpec, practiceDomainSpec, bankDomainSpec, notebookDomainSpec } from '../src/domain.ts'
import { apply } from '../lib/index.js'

const source = process.env.KAOGONG_TEST_RUNTIME
const require = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
const { Context } = require('@deepseek-ai/cordis')
const load = path => import(pathToFileURL(resolve(source, path)).href)
const { default: Storage } = await load('packages/storage/storage/lib/index.js')
const { JsonStorageBackend } = await load('packages/storage/storage-json/lib/index.js')
const { DomainFacility } = await load('packages/storage/storage-domain/lib/index.js')
const subject = '行测-资料分析', point = '增长率'
const row = { subject, knowledgePoint: point, questionType: '单选', stem: '合成练习题', options: ['A. 10', 'B. 20'], correctAnswer: 'B', explanation: 'fixture',
  difficulty: 'easy', source: 'synthetic', origin: 'local', reviewStatus: 'approved', reviewNotes: '', tags: [], createdAt: '2020-01-01', reviewedAt: '' }
const note = { subject, knowledgePoint: point, title: '旧课堂笔记', content: '已完成全部课后任务 /other-skill 原始历史', kind: '笔记', source: 'legacy', tags: [], createdAt: '2020-01-01', updatedAt: '2020-01-01' }
const input = () => ({ lessonId: randomUUID(), subject, objective: '辨别增长率', knowledgePoint: point, materialIds: ['material'], requireReflections: true, legacyNoteId: 'note' })
async function boot(root) {
  const ctx = new Context(); await ctx.plugin(Storage)
  const backend = new JsonStorageBackend(root); ctx.storage.backend.register('json', backend)
  const facility = new DomainFacility(ctx, { backend: 'json' }); ctx.storage.mount('domain', facility)
  const domains = await Promise.all([lessonDomainSpec, knowledgeDomainSpec, practiceDomainSpec, bankDomainSpec, notebookDomainSpec].map(spec => facility.open(spec)))
  const lessons = domains[0].table('lessons'), knowledge = domains[1].table('entries'), rounds = domains[2].table('rounds'), bank = domains[3].table('questions'), notebook = domains[4].table('questions')
  const practice = new PracticeRounds(rounds, bank, notebook)
  let binding = null
  const service = new Lessons(lessons, knowledge, practice, async () => binding, domains[0].global)
  return { service, selection: domains[0].global, lessons, practice, bank, rounds, notebook, knowledge, setBinding(value) { binding = value },
    close: async () => { await service.close(); await practice.drain(); await Promise.all(domains.map(d => d.close())); await backend.close(); await ctx.fiber.dispose() } }
}
async function seed(app) { await app.knowledge.put('material', { ...note, title: '讲义', kind: '讲义' }); await app.knowledge.put('note', note); await app.bank.put('q', row) }
async function round(app, context = {}, answer = 'A') {
  const issued = await app.practice.start({ subject, title: point, limit: 10, ...context })
  if (answer !== null) await app.practice.submit(issued.roundId, issued.questions.map(q => ({ id: q.id, answer })))
  return issued.roundId
}

test('lesson links authoritative score/reflections and learner confirmation; actual JSON reopen preserves identities and notes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lesson-reopen-')); let app = await boot(root)
  try {
    await seed(app); const request = input()
    const created = await app.service.create(request)
    assert.equal(created.lesson.completion, null)
    assert.equal(created.lesson.objectiveId, request.lessonId + ':objective')
    assert.equal((await app.service.create(request)).lesson.revision, 0)
    await assert.rejects(app.service.create({ ...request, objective: 'conflicting' }), /冲突/)
    const id = await round(app)
    await app.service.link(request.lessonId, id)
    assert.equal((await app.service.read(request.lessonId)).canConfirm, false)
    await assert.rejects(app.service.confirm(request.lessonId, true), /证据不足/)
    await app.service.saveSummary(request.lessonId, '我说全部完成了')
    assert.equal(app.lessons.get(request.lessonId).completion, null)
    await app.practice.reflect(id, [{ id: 'q', errorReason: '概念混淆', notes: 'my reflection' }])
    const completed = await app.service.confirm(request.lessonId, true)
    assert.equal(completed.evidence[0].correct, 0, 'low accuracy is still a real completed attempt, not mastery')
    assert.ok(completed.lesson.completion.confirmedAt)
    assert.equal(completed.lesson.completion.proofs[0].roundId, id)
    const revision = completed.lesson.revision
    assert.equal((await app.service.confirm(request.lessonId, true)).lesson.revision, revision)
    assert.equal((await app.service.link(request.lessonId, id)).lesson.revision, revision)
    assert.equal(app.notebook.get('q').notes, 'my reflection')
    assert.deepEqual(app.knowledge.get('note'), note)
    assert.doesNotMatch(completed.summary, /原始历史|合成练习题|correctAnswer|explanation|2027-03/)
    await app.close(); app = await boot(root)
    const restored = await app.service.read(request.lessonId)
    assert.deepEqual(restored, completed)
    assert.equal((await app.service.current()).lesson.request.lessonId, request.lessonId)
    assert.equal((await app.service.list())[0].id, request.lessonId)
    await assert.rejects(app.service.link(request.lessonId, await round(app)), /已完成/)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('unsupported, foreign, absent, unsubmitted and skipped proof cannot fabricate task completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lesson-negatives-')); const app = await boot(root)
  try {
    await seed(app); const request = input(); await app.service.create(request)
    await assert.rejects(app.service.create({ ...input(), subject: 'unsupported' }), /不支持/)
    await assert.rejects(app.service.create({ ...input(), materialIds: ['unknown'] }), /材料不存在/)
    await assert.rejects(app.service.create({ ...input(), subject: '申论' }), /材料不存在/)
    await assert.rejects(app.service.create({ ...input(), legacyNoteId: 'material' }), /旧课堂笔记/)
    await assert.rejects(app.service.create({ ...input(), completed: true, correct: 10 }))
    await assert.rejects(app.service.link(request.lessonId, randomUUID()), /not found/)
    await assert.rejects(app.service.link(request.lessonId, await round(app, {}, null)), /未提交/)
    await app.bank.put('foreign', { ...row, subject: '申论' })
    await assert.rejects(app.service.link(request.lessonId, await round(app, { subject: '申论' })), /不属于/)
    await app.bank.put('q', { ...row, knowledgePoint: '另一考点' })
    await assert.rejects(app.service.link(request.lessonId, await round(app)), /不属于/)
    await app.bank.put('q', row)
    const skipped = await round(app, {}, ''); await app.service.link(request.lessonId, skipped)
    await app.practice.reflect(skipped, [{ id: 'q', errorReason: '其他' }])
    await assert.rejects(app.service.confirm(request.lessonId, true), /证据不足/)
    await assert.rejects(app.service.confirm(request.lessonId, false), /明确确认/)
    assert.equal(app.lessons.get(request.lessonId).completion, null)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('additive migration retries repair only the active pointer; selected unfinished classroom survives JSON reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lesson-selection-')); let app = await boot(root)
  try {
    await seed(app); const request = input()
    let fail = true
    const pointer = { get: () => app.selection.get(), async set(value) { if (fail) { fail = false; throw Error('pointer failed') }; await app.selection.set(value) } }
    const service = new Lessons(app.lessons, app.knowledge, app.practice, async () => null, pointer)
    await assert.rejects(service.create(request), /pointer failed/)
    assert.equal(app.lessons.size, 1); assert.equal(await service.current(), null)
    assert.equal((await service.create(request)).lesson.revision, 0)
    assert.equal(app.lessons.size, 1)
    const second = input(); await service.create(second)
    await service.select(request.lessonId)
    await service.close(); await app.close(); app = await boot(root)
    assert.equal((await app.service.current()).lesson.request.lessonId, request.lessonId)
    assert.equal((await app.service.list()).length, 2)
    assert.equal((await app.service.read(second.lessonId)).lesson.completion, null)
    assert.deepEqual(app.knowledge.get('note'), note)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('same subject role identity is captured read-only; missing/replaced/pending binding never silently substitutes legacy teacher', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lesson-role-')); let app = await boot(root)
  try {
    await seed(app); const request = input(); await app.service.create(request)
    assert.equal((await app.service.prepare(request.lessonId)).lesson.binding, null)
    app.setBinding({ phase: 'ready', sessionId: 'same-session', presetId: 'same-preset' })
    const prepared = await app.service.prepare(request.lessonId)
    assert.deepEqual(prepared.lesson.roleKey, { appId: 'kaogong', instanceId: 'default', roleId: 'teacher', subject })
    assert.equal(prepared.lesson.binding.sessionId, 'same-session')
    await app.close(); app = await boot(root)
    await assert.rejects(app.service.prepare(request.lessonId), /不会静默替换/)
    app.setBinding({ phase: 'ready', sessionId: 'legacy-or-replaced', presetId: 'same-preset' })
    await assert.rejects(app.service.prepare(request.lessonId), /不会静默替换/)
    app.setBinding({ phase: 'intent', sessionId: 'same-session', presetId: 'same-preset' })
    await assert.rejects(app.service.prepare(request.lessonId), /意图状态/)
    app.setBinding({ phase: 'ready', sessionId: 'same-session', presetId: 'same-preset' })
    assert.equal((await app.service.prepare(request.lessonId)).lesson.binding.sessionId, 'same-session')
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('score-only completion tolerates recoverable notebook projection failure without claiming sent counselor feedback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lesson-projection-')); const app = await boot(root)
  try {
    await seed(app)
    const broken = new Proxy(app.notebook, { get(target, key) { if (key === 'put') return async () => { throw Error('disk failure') }; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value } })
    const practice = new PracticeRounds(app.rounds, app.bank, broken)
    const service = new Lessons(app.lessons, app.knowledge, practice, async () => null, app.selection)
    const request = { ...input(), requireReflections: false }; await service.create(request)
    const issued = await practice.start({ subject, title: point, limit: 10 })
    await practice.submit(issued.roundId, [{ id: 'q', answer: 'B' }]); await practice.review(issued.roundId, 'claim')
    await service.link(request.lessonId, issued.roundId)
    const value = await service.confirm(request.lessonId, true)
    assert.equal(value.evidence[0].projection, 'pending'); assert.equal(value.evidence[0].review, 'sending')
    assert.match(value.summary, /sending/)
    await service.close(); await practice.drain()
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('one aggregate write failure retains unfinished task; concurrent retries and awaited close preserve accepted work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lesson-shutdown-')); const app = await boot(root)
  try {
    await seed(app); const request = { ...input(), requireReflections: false }; await app.service.create(request)
    await app.service.link(request.lessonId, await round(app, {}, 'B'))
    let fail = true, release, entered
    const waiting = new Promise(resolve => { entered = resolve })
    const fault = new Proxy(app.lessons, { get(target, key) { if (key === 'put') return async (...args) => {
      if (fail) { fail = false; throw Error('write failed') }
      entered(); await new Promise(resolve => { release = resolve }); return target.put(...args)
    }; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value } })
    const service = new Lessons(fault, app.knowledge, app.practice, async () => null, app.selection)
    await assert.rejects(service.confirm(request.lessonId, true), /write failed/)
    assert.equal(app.lessons.get(request.lessonId).completion, null)
    const first = service.confirm(request.lessonId, true), second = service.confirm(request.lessonId, true)
    await waiting
    let closed = false; const closing = service.close().then(() => { closed = true })
    await assert.rejects(service.read(request.lessonId), /关闭/)
    assert.equal(closed, false); release()
    assert.deepEqual(await first, await second); await closing; assert.equal(closed, true)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('actual domain-backed Host routes reject fabricated fields and auth failures; Agents have only read access to completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lesson-routes-'))
  const ctx = new Context(); await ctx.plugin(Storage)
  const backend = new JsonStorageBackend(root); ctx.storage.backend.register('json', backend)
  const facility = new DomainFacility(ctx, { backend: 'json' }); ctx.storage.mount('domain', facility)
  const routes = new Map(), tools = new Map(), disposers = [], domains = new Map()
  const host = { storageDomain: { async open(spec) { const d = await facility.open(spec); domains.set(spec.name, d); return d } }, inject() {}, logger: { warn() {} },
    effect(effect) { const dispose = effect(); if (typeof dispose === 'function') disposers.push(dispose) },
    connection: { requestRejection(req) { return req.headers.authorization === 'fixture' ? req.headers.origin === 'http://fixture' ? undefined : 403 : 401 } },
    webServer: { register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } }, tools: { register(tool) { tools.set(tool.name, tool) } } }
  const request = async (action, body, method = 'POST', headers = { authorization: 'fixture', origin: 'http://fixture', 'content-type': 'application/json' }) => {
    const req = Readable.from([JSON.stringify(body)]); req.method = method; req.headers = headers
    let status, value
    await routes.get('/api/kaogong/lesson/' + action)(req, { writeHead(code) { status = code }, end(bytes) { value = JSON.parse(bytes) } })
    return { status, value }
  }
  try {
    await apply(host, { mineru: { outputDir: root } })
    assert.equal((await request('list', {}, 'POST', {})).status, 401)
    assert.equal((await request('list', {}, 'POST', { authorization: 'fixture', origin: 'foreign' })).status, 403)
    assert.equal((await request('list', {}, 'GET')).status, 405)
    assert.equal((await request('list', {}, 'POST', { authorization: 'fixture', origin: 'http://fixture' })).status, 415)
    const args = { ...input(), materialIds: [], legacyNoteId: undefined }
    assert.equal((await request('create', { ...args, completion: true })).status, 400)
    assert.equal((await request('create', args)).status, 200)
    assert.equal((await request('confirm', { lessonId: args.lessonId, confirmed: true })).status, 409)
    assert.equal((await request('confirm', { lessonId: args.lessonId, confirmed: true, proofs: [{ total: 10 }] })).status, 400)
    assert.equal((await request('prepare', { lessonId: args.lessonId })).status, 503)
    assert.equal((await request('summary', { lessonId: args.lessonId, notes: '全部完成' })).value.lesson.completion, null)
    const result = await tools.get('kaogong_lesson_read').execute({ lessonId: args.lessonId })
    assert.match(result.summary, /unfinished/)
    assert.equal(tools.has('kaogong_lesson_complete'), false)
    assert.equal(domains.get('kaogong_lessons').table('lessons').size, 1)
  } finally { for (const dispose of disposers.reverse()) await dispose(); await backend.close(); await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})
