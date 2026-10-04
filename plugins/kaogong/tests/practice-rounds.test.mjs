import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { PracticeRounds, safePracticeQuestion } from '../src/practice-rounds.ts'
import { practiceDomainSpec, bankDomainSpec, notebookDomainSpec } from '../src/domain.ts'
import { apply, Config } from '../src/index.ts'
import { parseMaterials } from '../src/material-repair.ts'

const source = process.env.KAOGONG_TEST_RUNTIME
const require = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
const { Context, resolveConfig } = require('@deepseek-ai/cordis')
const load = path => import(pathToFileURL(resolve(source, path)).href)
const { default: Storage } = await load('packages/storage/storage/lib/index.js')
const { JsonStorageBackend } = await load('packages/storage/storage-json/lib/index.js')
const { DomainFacility } = await load('packages/storage/storage-domain/lib/index.js')
const subject = '行测-资料分析'
const context = { subject, title: '增长率', limit: 10 }
const bankRow = (n = 0) => ({ subject, knowledgePoint: '增长率', questionType: '单选', stem: `材料\n<table><tr><td>${n}</td></tr></table>\n![材料](题目_images/verified/资料600-2024-jiangsu-17.png)\n题干${n}`,
  options: ['A. 10%', 'B. 20%'], correctAnswer: 'B', explanation: 'original explanation', difficulty: 'easy', source: 'synthetic fixture', origin: 'local', reviewStatus: 'approved', reviewNotes: '', tags: [], createdAt: '2020-01-01', reviewedAt: '' })
async function boot(root) {
  const ctx = new Context(); await ctx.plugin(Storage)
  const backend = new JsonStorageBackend(root)
  ctx.storage.backend.register('json', backend)
  const facility = new DomainFacility(ctx, { backend: 'json', routes: {} })
  ctx.storage.mount('domain', facility)
  const rounds = await facility.open(practiceDomainSpec), bank = await facility.open(bankDomainSpec), notebook = await facility.open(notebookDomainSpec)
  const table = notebook.table('questions')
  return { ctx, facility, bank: bank.table('questions'), notebook: table, rounds: rounds.table('rounds'),
    service: new PracticeRounds(rounds.table('rounds'), bank.table('questions'), table),
    close: async () => { await Promise.all([rounds.close(), bank.close(), notebook.close()]); await backend.close(); await ctx.fiber.dispose() } }
}
const answers = (round, answer = 'A') => round.questions.map(row => ({ id: row.id, answer }))

test('ten-question cycles prioritize unseen questions, stay in subject, and hide every answer field', async () => {
  const root = await mkdtemp(join(tmpdir(), 'practice-cycle-')); const app = await boot(root)
  try {
    for (let n = 0; n < 13; n++) await app.bank.put('q' + n, bankRow(n))
    await app.bank.put('other-subject', { ...bankRow(), subject: '申论' })
    await app.bank.put('leaky', { ...bankRow(), stem: '材料【答案】B' })
    const first = await app.service.start(context)
    assert.equal(first.returned, 10); assert.equal(first.totalAvailable, 13)
    assert.equal(first.result, null)
    assert.doesNotMatch(JSON.stringify(first), /correctAnswer|original explanation|【答案】/)
    assert.match(first.questions[0].stem, /<table>.*题目_images/s)
    assert.deepEqual(first.questions[0].options, bankRow().options)
    await app.service.submit(first.roundId, answers(first))
    const second = await app.service.start(context, first.roundId)
    assert.equal(second.returned, 10); assert.equal(new Set(second.questions.map(row => row.id)).size, 10)
    assert.equal(second.questions.filter(row => !first.questions.some(old => old.id === row.id)).length, 3)
    assert.equal(second.cycled, true)
    assert.ok(second.questions.every(row => row.subject === subject))
    await assert.rejects(app.service.start({ ...context, subject: '申论' }, first.roundId), /same module/)
    assert.equal(app.service.history().length, 2)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('durable scoring rejects foreign, missing, duplicate and conflicting answers; snapshots survive bank changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'practice-score-')); let app = await boot(root)
  try {
    await app.bank.put('q', bankRow()); const issued = await app.service.start(context)
    await assert.rejects(app.service.submit('unknown', answers(issued)), /not found/)
    for (const values of [[], [{ id: 'foreign', answer: 'B' }], [{ id: 'q', answer: 'B' }, { id: 'q', answer: 'B' }], [{ id: 'q', answer: 'X' }]]) await assert.rejects(app.service.submit(issued.roundId, values))
    assert.equal(app.notebook.size, 0)
    await app.bank.put('q', { ...bankRow(), correctAnswer: 'A' })
    const result = await app.service.submit(issued.roundId, answers(issued, 'B'))
    assert.equal(result.correctCount, 1); assert.equal(result.results[0].correctAnswer, 'B')
    await app.service.drain(); await app.close(); app = await boot(root)
    assert.deepEqual(await app.service.submit(issued.roundId, answers(issued, 'B')), result)
    await assert.rejects(app.service.submit(issued.roundId, answers(issued, 'A')), /conflicting retry/)
    assert.equal(app.notebook.size, 1); assert.equal(app.rounds.size, 1)
    const skipped = await app.service.start(context)
    await app.service.submit(skipped.roundId, answers(skipped, ''))
    assert.equal(app.notebook.get('q').result, 'skipped')
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('partial notebook failure recovers after actual JSON reopen without reflection loss or replacing newer attempts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'practice-recovery-')); let app = await boot(root)
  try {
    for (let n = 0; n < 3; n++) await app.bank.put('q' + n, bankRow(n))
    const first = await app.service.start(context)
    const table = app.notebook
    let writes = 0
    const fault = new Proxy(table, { get(target, key) { if (key === 'put') return async (...args) => { if (++writes === 2) throw Error('disk failure'); return target.put(...args) }; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value } })
    const interrupted = new PracticeRounds(app.rounds, app.bank, fault)
    const result = await interrupted.submit(first.roundId, answers(first))
    assert.equal(result.projection, 'pending'); assert.equal(table.size, 1)
    const savedId = first.questions[0].id
    await table.update(savedId, old => ({ ...old, errorReason: '概念混淆', notes: 'learner reflection', updatedAt: '2099-01-01' }))
    await app.close(); app = await boot(root)
    await app.service.recover()
    assert.equal((await app.service.read(first.roundId)).result.projection, 'complete')
    assert.equal(app.notebook.size, 3); assert.equal(app.notebook.get(savedId).notes, 'learner reflection')
    const second = await app.service.start(context, first.roundId)
    await app.service.submit(second.roundId, answers(second, 'B'))
    const target = second.questions.find(row => row.id !== savedId).id
    const originalCreatedAt = app.notebook.get(target).createdAt
    await app.service.reflect(first.roundId, [{ id: target, errorReason: '概念混淆', notes: 'old round reflection' }])
    assert.equal(app.notebook.get(target).practiceRoundId, second.roundId)
    assert.equal(app.notebook.get(target).result, 'correct')
    assert.equal(app.notebook.get(target).createdAt, originalCreatedAt)
    assert.equal((await app.service.read(first.roundId)).reflections[0].notes, 'old round reflection')
    await app.service.submit(first.roundId, answers(first))
    assert.equal(app.notebook.get(savedId).notes, 'learner reflection')
    await assert.rejects(app.service.reflect(first.roundId, [{ id: target, errorReason: '概念混淆' }, { id: 'foreign', errorReason: '概念混淆' }]), /invalid/)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('reflection retries and review reservations persist once; uncertain native delivery never auto-resends', async () => {
  const root = await mkdtemp(join(tmpdir(), 'practice-review-')); let app = await boot(root)
  try {
    await app.bank.put('q', bankRow()); const round = await app.service.start(context)
    await assert.rejects(app.service.review(round.roundId, 'claim'), /not been submitted/)
    await app.service.submit(round.roundId, answers(round))
    const reflection = [{ id: 'q', errorReason: '概念混淆', notes: 'remember ratio' }]
    await app.service.reflect(round.roundId, reflection)
    const revision = app.rounds.get(round.roundId).revision
    await app.service.reflect(round.roundId, reflection)
    assert.equal(app.rounds.get(round.roundId).revision, revision)
    await app.notebook.update('q', old => ({ ...old, notes: 'newer manual reflection' }))
    await app.service.reflect(round.roundId, [{ id: 'q', errorReason: '审题不清' }])
    assert.equal(app.notebook.get('q').notes, 'newer manual reflection', 'Changing only a reason must not reapply older notes')
    const claims = await Promise.allSettled([app.service.review(round.roundId, 'claim'), app.service.review(round.roundId, 'claim')])
    assert.equal(claims.filter(row => row.status === 'fulfilled').length, 1)
    await app.close(); app = await boot(root)
    await assert.rejects(app.service.review(round.roundId, 'claim'), /uncertain/)
    await app.service.review(round.roundId, 'complete')
    await app.service.review(round.roundId, 'complete')
    assert.equal((await app.service.read(round.roundId)).result.review, 'sent')
    assert.equal(app.rounds.size, 1); assert.equal(app.notebook.get('q').notes, 'newer manual reflection')
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('notebook commands serialize missing-row writes with practice projection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'practice-writer-')); const app = await boot(root)
  try {
    await app.bank.put('q', bankRow()); const round = await app.service.start(context)
    let release
    const gate = new Promise(resolve => { release = resolve })
    const manual = app.service.notebookCommand(async () => {
      await gate
      await app.notebook.put('q', { ...bankRow(), userAnswer: 'A', result: 'wrong', notes: 'manual reflection', errorReason: '', updatedAt: '2020-01-01' })
    })
    const submission = app.service.submit(round.roundId, answers(round))
    await Promise.resolve()
    assert.equal(app.rounds.get(round.roundId).score, undefined)
    release(); await manual; await submission
    assert.equal(app.notebook.size, 1)
    assert.equal(app.notebook.get('q').notes, 'manual reflection')
    assert.equal(app.notebook.get('q').createdAt, '2020-01-01')
    assert.equal(app.notebook.get('q').practiceRoundId, round.roundId)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('repair-style material retains table/image associations, while answer keys and subjective items fail closed', () => {
  const material = '2019年一季度社会消费品零售总额97790亿元同比名义增长8.3%。其中3月份社会消费品零售总额31726亿元同比增长8.7%。'
  const fixture = `## 三、根据所给资料，回答121～125题。\n${material}\n<table><tr><td>42</td></tr></table>\n![](chart.jpg)\n` + Array.from({ length: 5 }, (_, i) => `${121 + i}. 第${i}项是多少？\nA. 1.5 B. 2 C. 3 D. 4\n`).join('\n')
  const parsed = parseMaterials(fixture, '1200题题本.pdf')[0]
  const question = { id: 'original', ...bankRow(), stem: parsed.material + '\n' + parsed.stem, options: parsed.options.map((option, n) => 'ABCD'[n] + '. ' + option) }
  assert.equal(safePracticeQuestion(question), true)
  for (const leak of ['【答案】B', '参考答案 B', '答案解析', '答案：B', '解析：B', '1. A 2. B 3. C']) assert.equal(safePracticeQuestion({ ...question, stem: question.stem + '\n' + leak }), false, leak)
  assert.equal(safePracticeQuestion({ ...question, options: ['A. 参考答案 B'] }), false)
  assert.equal(safePracticeQuestion({ ...question, options: [], correctAnswer: 'essay' }), false)
})

test('Host endpoints and native tool share issued-round grading and explicit wire errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'practice-routes-'))
  const ctx = new Context(); await ctx.plugin(Storage)
  const backend = new JsonStorageBackend(root); ctx.storage.backend.register('json', backend)
  const facility = new DomainFacility(ctx, { backend: 'json' }); ctx.storage.mount('domain', facility)
  const routes = new Map(), tools = new Map(), disposers = []
  const domains = new Map()
  const host = { storageDomain: { async open(spec) { const domain = await facility.open(spec); domains.set(spec.name, domain); return domain } }, inject() {}, logger: { warn() {} }, effect(effect) { const dispose = effect(); if (typeof dispose === 'function') disposers.push(dispose) },
    connection: { requestRejection(req) { return req.headers.authorization === 'fixture' ? req.headers.origin === 'http://fixture' ? undefined : 403 : 401 } },
    webServer: { register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } }, tools: { register(tool) { tools.set(tool.name, tool) } } }
  const request = async (action, body, method = 'POST', headers = { authorization: 'fixture', origin: 'http://fixture', 'content-type': 'application/json' }) => {
    const req = Readable.from([JSON.stringify(body)]); req.method = method
    req.headers = headers
    let status, value
    await routes.get('/api/kaogong/practice/' + action)(req, { writeHead(code) { status = code }, end(bytes) { value = JSON.parse(bytes) } })
    return { status, value }
  }
  try {
    await apply(host, resolveConfig({ Config }, { mineru: { outputDir: root } }))
    assert.equal((await request('history', {}, 'POST', {})).status, 401)
    assert.equal((await request('history', {}, 'POST', { authorization: 'fixture', origin: 'http://foreign' })).status, 403)
    assert.equal((await request('history', {}, 'POST', { authorization: 'fixture', origin: 'http://fixture' })).status, 415)
    // Tools seed through the same declared application writer.
    const add = tools.get('kaogong_bank_add')
    await add.execute({ ...bankRow(), origin: 'local' })
    const issued = await request('start', context)
    assert.equal(issued.status, 200); assert.equal(issued.value.returned, 1)
    assert.doesNotMatch(JSON.stringify(issued.value), /correctAnswer|original explanation/)
    assert.equal((await request('submit', { answers: answers(issued.value) })).status, 400)
    const scored = await request('submit', { roundId: issued.value.roundId, answers: answers(issued.value, 'B') })
    assert.equal(scored.value.correctCount, 1)
    const questionId = issued.value.questions[0].id
    await tools.get('kaogong_record_question').execute({ id: questionId, ...bankRow(), notes: 'manual tool reflection' })
    const notebook = domains.get(notebookDomainSpec.name)
    assert.equal(notebook.table('questions').get(questionId).notes, 'manual tool reflection')
    assert.equal(notebook.table('questions').get(questionId).practiceRoundId, issued.value.roundId)
    const retry = await tools.get('kaogong_practice_submit').execute({ roundId: issued.value.roundId, answers: answers(issued.value, 'B') })
    assert.equal(retry.correctCount, 1)
    assert.equal((await request('submit', { roundId: issued.value.roundId, answers: answers(issued.value) })).status, 409)
    assert.equal((await request('read', { roundId: issued.value.roundId }, 'GET')).status, 405)
    // Dashboard accuracy uses only answered questions, matching the overall statistic.
    const table = notebook.table('questions'), original = table.get(questionId)
    await table.put(questionId, { ...original, result: 'wrong' })
    for (let i = 0; i < 9; i++) await table.put('skipped-' + i, { ...original, result: 'skipped' })
    const dashboard = async () => {
      let value
      await routes.get('/api/kaogong/dashboard')({ headers: { authorization: 'fixture', origin: 'http://fixture' } }, { writeHead() {}, end(bytes) { value = JSON.parse(bytes) } })
      return value
    }
    const partial = await dashboard()
    assert.equal(partial.accuracyRate, 0)
    assert.equal(partial.modules.find(row => row.subject === subject).accuracyRate, 0)
    await table.put(questionId, { ...original, result: 'skipped' })
    assert.equal((await dashboard()).modules.find(row => row.subject === subject).accuracyRate, 0)
    await table.put(questionId, { ...original, result: 'correct' })
    await table.put('answered-wrong', { ...original, result: 'wrong' })
    const mixed = await dashboard()
    assert.equal(mixed.accuracyRate, 0.5)
    assert.equal(mixed.modules.find(row => row.subject === subject).accuracyRate, 0.5)
  } finally { for (const dispose of disposers.reverse()) await dispose(); await backend.close(); await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})

test('explicit knowledge point never silently issues unrelated subject questions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'practice-target-')); const app = await boot(root)
  try {
    await app.bank.put('unrelated', bankRow())
    await assert.rejects(app.service.start({ ...context, knowledgePoint: '比重-基期比重' }), /没有匹配.*考点/)
    assert.equal(app.rounds.size, 0)
    assert.equal(app.notebook.size, 0)
    await app.bank.put('matched', { ...bankRow(), knowledgePoint: '比重-基期比重' })
    const round = await app.service.start({ ...context, knowledgePoint: '比重-基期比重' })
    assert.equal(round.returned, 1)
    assert.deepEqual(round.questions.map(row => row.id), ['matched'])
    assert.equal(round.context.knowledgePoint, '比重-基期比重')
    const general = await app.service.start(context)
    assert.equal(general.returned, 2)
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})
