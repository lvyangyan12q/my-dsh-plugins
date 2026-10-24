import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { KaogongInstancePool } from '../src/instance-state.ts'
import { legacyDomainSpecs } from '../src/domain.ts'

const native = process.env.KAOGONG_TEST_RUNTIME
assert.ok(native, 'set KAOGONG_TEST_RUNTIME to the official native checkout')
const require = createRequire(resolve(native, 'packages/client/ui-renderer/package.json'))
const { Context } = require('@deepseek-ai/cordis')
const load = file => import(pathToFileURL(resolve(native, file)).href)
const { default: Storage } = await load('packages/storage/storage/lib/index.js')
const { JsonStorageBackend } = await load('packages/storage/storage-json/lib/index.js')
const { DomainFacility } = await load('packages/storage/storage-domain/lib/index.js')

async function boot(root) {
  const ctx = new Context(); await ctx.plugin(Storage)
  const backend = new JsonStorageBackend(root)
  ctx.storage.backend.register('json', backend)
  const facility = new DomainFacility(ctx, { backend: 'json' })
  const pool = new KaogongInstancePool(facility)
  return { pool, facility, async close() { await pool.close(); await backend.close(); await ctx.fiber.dispose() } }
}

test('same instance views share one owner while equal keys in another instance remain private', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kaogong-instance-state-')); const app = await boot(root)
  let a, aView, b
  try {
    ;[a, aView, b] = await Promise.all([app.pool.acquire('learning-a'), app.pool.acquire('learning-a'), app.pool.acquire('learning-b')])
    assert.equal(a.state, aView.state)
    assert.equal(a.state.instanceId, 'learning-a')
    const day = { date: '2026-10-24', phase: 'foundation', items: [{ subject: '申论', kind: 'learn', title: '甲的计划', done: false }] }
    await a.state.days.put('2026-10-24', day)
    assert.deepEqual(aView.state.days.get('2026-10-24'), day)
    assert.equal(b.state.days.get('2026-10-24'), undefined)
    await b.state.days.put('2026-10-24', { ...day, items: [{ ...day.items[0], done: true }] })
    assert.equal(a.state.days.get('2026-10-24').items[0].done, false)
    assert.equal(b.state.days.get('2026-10-24').items[0].done, true)
    assert.equal(a.state.questions.size, 0)
    assert.equal(a.state.bankQuestions.size, 0)
    assert.equal(a.state.knowledgeEntries.size, 0)
    assert.equal(a.state.rounds.size, 0)
    assert.equal(a.state.lessonRecords.size, 0)
  } finally { await a?.release(); await aView?.release(); await b?.release(); await app.close(); await rm(root, { recursive: true, force: true }) }
})

const subject = '行测-资料分析'
const knowledge = { subject, knowledgePoint: '增长率', title: '甲的讲义', content: '合成来源', kind: '讲义', source: 'synthetic', tags: [], createdAt: '2020-01-01', updatedAt: '2020-01-01' }
const bankQuestion = { subject, knowledgePoint: '增长率', questionType: '单选', stem: '合成练习题', options: ['A. 10', 'B. 20'],
  correctAnswer: 'A', explanation: 'synthetic', difficulty: 'easy', source: 'synthetic', origin: 'local',
  reviewStatus: 'approved', reviewNotes: '', tags: [], createdAt: '2020-01-01', reviewedAt: '' }

test('lesson pointers, role keys, plans, private notes and authoritative scores belong to their own instance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kaogong-instance-lesson-')); const app = await boot(root)
  let a, b
  try {
    a = await app.pool.acquire('learning-a'); b = await app.pool.acquire('learning-b')
    assert.deepEqual(a.state.lessonSelection.get(), { instanceId: 'learning-a', activeLessonId: null })
    assert.deepEqual(b.state.lessonSelection.get(), { instanceId: 'learning-b', activeLessonId: null })
    await a.state.planConfig.set({ examDate: '2028-01-01', dailyModules: 4, subjects: [{ name: '申论', weight: 1 }] })
    assert.equal(b.state.planConfig.get().examDate, '2027-03-01')
    await a.state.knowledgeEntries.put('material', knowledge)
    await b.state.knowledgeEntries.put('material', { ...knowledge, title: '乙的讲义', content: '乙的内容' })
    await a.state.knowledgeEntries.put('private-note', { ...knowledge, kind: '笔记', content: '甲的私有笔记' })
    assert.equal(b.state.knowledgeEntries.get('private-note'), undefined)
    const lessonId = randomUUID()
    const request = { lessonId, subject, objective: '甲的课堂', materialIds: ['material'], requireReflections: false }
    const first = await a.state.lessons.create(request)
    const second = await b.state.lessons.create({ ...request, objective: '乙的课堂' })
    assert.equal(first.lesson.instanceId, 'learning-a')
    assert.equal(first.lesson.roleKey.instanceId, 'learning-a')
    assert.equal(second.lesson.instanceId, 'learning-b')
    assert.equal((await a.state.lessons.current()).lesson.request.objective, '甲的课堂')
    assert.equal((await b.state.lessons.current()).lesson.materials[0].title, '乙的讲义')
    await assert.rejects(a.state.lessonRecords.put('foreign', second.lesson), /invalid-record|Invalid|无效/)
    await a.state.bankQuestions.put('same-question', bankQuestion)
    await b.state.bankQuestions.put('same-question', { ...bankQuestion, correctAnswer: 'B' })
    const issueA = await a.state.practice.start({ subject, title: '增长率', limit: 10 })
    const issueB = await b.state.practice.start({ subject, title: '增长率', limit: 10 })
    const scoreA = await a.state.practice.submit(issueA.roundId, [{ id: 'same-question', answer: 'A' }])
    const scoreB = await b.state.practice.submit(issueB.roundId, [{ id: 'same-question', answer: 'A' }])
    assert.equal(scoreA.correctCount, 1); assert.equal(scoreB.correctCount, 0)
    await b.state.bankQuestions.put('same-question', bankQuestion)
    assert.equal((await b.state.practice.read(issueB.roundId)).result.correctCount, 0, 'issued snapshot and stored score do not change with later bank edits')
    await a.state.lessons.link(lessonId, issueA.roundId)
    await a.state.lessons.confirm(lessonId, true)
    assert.ok((await a.state.lessons.current()).lesson.completion)
    assert.equal((await b.state.lessons.current()).lesson.completion, null)
  } finally { await a?.release(); await b?.release(); await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('last lease closes only its instance, old command faces refuse work, and reopen keeps stored records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kaogong-instance-lifetime-')); let app = await boot(root)
  let a, aView, b, reopened
  try {
    a = await app.pool.acquire('learning-a'); aView = await app.pool.acquire('learning-a'); b = await app.pool.acquire('learning-b')
    await a.state.knowledgeEntries.put('note', { ...knowledge, kind: '笔记', content: '原私有笔记' })
    await a.release(); await a.release()
    assert.equal(aView.state.knowledgeEntries.get('note').content, '原私有笔记')
    await aView.release()
    let callbacks = 0
    await assert.rejects(a.state.practice.notebookCommand(async () => { callbacks++ }), /关闭|closed/)
    assert.equal(callbacks, 0)
    await b.state.knowledgeEntries.put('note', { ...knowledge, kind: '笔记', content: '乙私有笔记' })
    reopened = await app.pool.acquire('learning-a')
    assert.notEqual(reopened.state, a.state)
    assert.equal(reopened.state.knowledgeEntries.get('note').content, '原私有笔记')
    assert.equal(b.state.knowledgeEntries.get('note').content, '乙私有笔记')
    const closing = app.pool.close()
    await assert.rejects(app.pool.acquire('learning-c'), /关闭|closed/)
    await reopened.release(); await b.release(); await closing
    await app.close(); app = await boot(root)
    reopened = await app.pool.acquire('learning-a')
    assert.equal(reopened.state.knowledgeEntries.get('note').content, '原私有笔记')
  } finally { await a?.release(); await aView?.release(); await reopened?.release(); await b?.release(); await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('new owners neither open legacy default nor repair or copy original private records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kaogong-legacy-preserved-')); const app = await boot(root)
  let learning, library
  const legacy = await app.facility.open(legacyDomainSpecs.knowledge)
  try {
    const privateNote = { ...knowledge, kind: '笔记', content: '原始旧笔记：不应分享' }
    await legacy.table('entries').put('old-private', privateNote)
    await assert.rejects(app.pool.acquire('default'), /default.*预览接管/)
    await assert.rejects(app.pool.acquire(''), /实例身份/)
    learning = await app.pool.acquire('historical-learning')
    library = await app.pool.acquire('library')
    assert.equal(learning.state.knowledgeEntries.size, 0)
    assert.equal(library.state.knowledgeEntries.size, 0)
    await learning.state.knowledgeEntries.put('new-note', { ...knowledge, kind: '笔记' })
    assert.equal(library.state.knowledgeEntries.get('new-note'), undefined)
    assert.deepEqual(legacy.table('entries').get('old-private'), privateNote)
    assert.equal(legacy.table('entries').size, 1)
  } finally { await learning?.release(); await library?.release(); await legacy.close(); await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('a partial backend-open failure releases acquired domains and retry preserves other instances', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kaogong-open-failure-')); const app = await boot(root)
  let fail = true, retry, other
  const pool = new KaogongInstancePool({ open: spec => {
    if (fail && spec.name.endsWith('_knowledge')) { fail = false; return Promise.reject(Error('synthetic backend unavailable')) }
    return app.facility.open(spec)
  } })
  try {
    await assert.rejects(pool.acquire('retry-owner'), /backend unavailable/)
    other = await app.pool.acquire('other-owner')
    await other.state.knowledgeEntries.put('note', { ...knowledge, kind: '笔记' })
    retry = await pool.acquire('retry-owner')
    assert.equal(retry.state.knowledgeEntries.size, 0)
    assert.equal(other.state.knowledgeEntries.size, 1)
  } finally { await retry?.release(); await other?.release(); await pool.close(); await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('an uncertain close is retained as a failure instead of silently opening a replacement owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kaogong-close-failure-')); const app = await boot(root)
  let fail = true, lease, replacement
  const pool = new KaogongInstancePool({ async open(spec) {
    const domain = await app.facility.open(spec)
    return { name: domain.name, get global() { return domain.global }, table: name => domain.table(name), async close() {
      await domain.close()
      if (fail && spec.name.endsWith('_knowledge')) { fail = false; throw Error('synthetic lost close receipt') }
    } }
  } })
  try {
    lease = await pool.acquire('uncertain-owner')
    await assert.rejects(lease.release(), /关闭失败/)
    await assert.rejects(async () => { replacement = await pool.acquire('uncertain-owner') }, /关闭失败/)
    await assert.rejects(lease.release(), /关闭失败/, 'repeated release must retain its unknown failure')
    await assert.rejects(pool.close(), /部分考公实例关闭失败/)
  } finally { await replacement?.release(); await pool.close().catch(() => {}); await app.close(); await rm(root, { recursive: true, force: true }) }
})

test('lesson read and current preserve pending projections and notebook bytes instead of performing recovery',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kaogong-pure-lesson-')),app=await boot(root);let lease
 try{
  lease=await app.pool.acquire('readonly-classroom');const state=lease.state
  await state.knowledgeEntries.put('material',knowledge);await state.bankQuestions.put('q',bankQuestion)
  const round=await state.practice.start({subject,title:'synthetic',limit:10});await state.practice.submit(round.roundId,[{id:'q',answer:'A'}]);const id=randomUUID();await state.lessons.create({lessonId:id,subject,objective:'synthetic',materialIds:['material'],requireReflections:false});await state.lessons.link(id,round.roundId)
  await state.rounds.update(round.roundId,row=>({...row,projectedRevision:0}))
  const beforeRounds=structuredClone([...state.rounds.entries()]),beforeNotebook=structuredClone([...state.questions.entries()])
  const view=await state.lessons.read(id);await state.lessons.current();assert.equal(view.evidence[0].projection,'pending');assert.deepEqual([...state.rounds.entries()],beforeRounds);assert.deepEqual([...state.questions.entries()],beforeNotebook)
 }finally{await lease?.release();await app.close();await rm(root,{recursive:true,force:true})}
})
