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

async function fixture(options = {}) {
  const root = options.root ?? await mkdtemp(join(tmpdir(), 'kaogong-standalone-'))
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
  return { request, tools, root, async suspend() { await stop(); await backend.close(); await context.fiber.dispose(); return root }, async close() {
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

test('an explicitly confirmed relocated library pins the original proof and serves copied images only through current grants', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kaogong-standalone-relocation-'))
  const source = await materialsSourceFixture(join(root, 'original'), { certified: true })
  const { snapshot } = await inspectMaterials({ home: source.materialSourceHome })
  const old = await inspectLegacyMaterialEvidence({ snapshot: materialEvidenceSnapshot(snapshot), materialRoot: source.legacyMaterialRoot })
  const materialRoot = join(root, 'relocated')
  await cp(source.legacyMaterialRoot, materialRoot, { recursive: true })
  await cp(source.materialSourceHome, join(root, 'copied-home'), { recursive: true })
  const imageRoot = join(root, 'copied-images')
  await cp(source.questionImageRoot, imageRoot, { recursive: true })
  const original = old.evidence.files.find(row => row.relativePath.endsWith('.pdf'))
  const map = { format: 'kaogong-material-location-map', version: 1, root: materialRoot, sourceEvidenceHash: old.evidence.evidenceHash, aliases: old.evidence.sourceAliases.map(alias => ({ declaredPath: alias.declaredPath, relativePath: original.relativePath, sha256: original.sha256 })) }
  const mapPath = join(root, 'location-map.json'), evidencePath = join(root, 'original-evidence.json')
  await writeFile(mapPath, JSON.stringify(map)); await writeFile(evidencePath, JSON.stringify(old))
  let app = await fixture({ root, sourceHome: join(root, 'copied-home'), config: { legacyMaterialRoot: materialRoot, materialLocationMap: mapPath, materialLocationEvidence: evidencePath, questionImageRoot: { get: () => imageRoot }, mineru: { get: () => ({ outputDir: join(materialRoot, 'storage/mineru') }) } } })
  try {
    const create = async kind => (await app.request('/api/kaogong/study', { action: 'create', title: kind, kind, confirmed: true })).value
    const library = await create('library'), learner = await create('learner')
    const preview = await app.request('/api/kaogong/material-import', { action: 'prepare', viewId: library.view.id })
    assert.equal(preview.status, 200)
    assert.equal(preview.value.counts.shareableMaterials, 1)
    assert.equal(preview.value.location.aliases, 1)
    assert.equal(preview.value.location.materialRoot, await realpath(materialRoot))
    assert.equal(preview.value.location.sourceEvidenceHash, old.evidence.evidenceHash)
    await writeFile(mapPath, JSON.stringify({ ...map, sourceEvidenceHash: 'a'.repeat(64) }))
    const unbound = await app.request('/api/kaogong/material-import', { action: 'prepare', viewId: library.view.id })
    assert.equal(unbound.status, 409); assert.equal(unbound.value.code, 'MATERIAL_LOCATION_PROOF_MISMATCH')
    await writeFile(mapPath, JSON.stringify({ ...map, aliases: [] }))
    assert.equal((await app.request('/api/kaogong/material-import', { action: 'prepare', viewId: library.view.id })).status, 409)
    await writeFile(mapPath, JSON.stringify(map))
    await writeFile(evidencePath, JSON.stringify({ evidence: { ...old.evidence, rootIdentity: 'changed' } }))
    assert.equal((await app.request('/api/kaogong/material-import', { action: 'prepare', viewId: library.view.id })).status, 409)
    // Already previewed intent uses its immutable proof even when the configuration files are later damaged.
    assert.equal((await app.request('/api/kaogong/material-import', { action: 'apply', viewId: library.view.id, id: preview.value.id, fingerprint: preview.value.fingerprint, confirmed: true })).status, 200)
    const exported = (await app.request('/api/kaogong/material-import', { action: 'export', viewId: library.view.id, id: preview.value.id })).value
    assert.deepEqual(exported.location.originalEvidence, old.evidence)
    await app.request('/api/kaogong/study', { action: 'source-share', viewId: learner.view.id, ownerViewId: library.view.id, resourceId: 'question-bank' })
    const issued = await app.request('/api/kaogong/practice/start?viewId=' + learner.view.id, { subject: '行测-资料分析', limit: 1 })
    assert.equal(issued.status, 200); assert.equal(JSON.stringify(issued.value).includes('correctAnswer'), false)
    const scored = await app.request('/api/kaogong/practice/submit?viewId=' + learner.view.id, { roundId: issued.value.roundId, answers: issued.value.questions.map(question => ({ id: question.id, answer: 'B' })) })
    assert.equal(scored.status, 200, JSON.stringify(scored.value)); assert.equal(scored.value.correctCount, 10)
    const shared = (await app.request('/api/kaogong/study', { action: 'source-share', viewId: learner.view.id, ownerViewId: library.view.id, resourceId: 'materials' })).value
    const entry = old.evidence.entries[0], reference = '/api/kaogong/document-image?id=' + entry.jobId + '&asset=images%2Fsynthetic-bars-10-20.png'
    const url = '/api/kaogong/legacy-image?viewId=' + learner.view.id + '&entryId=' + entry.id + '&reference=' + encodeURIComponent(reference)
    const image = await app.request(url)
    assert.equal(image.status, 200); assert.deepEqual(image.value, source.png)
    assert.equal((await app.request(url, undefined, false)).status, 403)
    await app.suspend()
    app = await fixture({ root, config: { materialLocationMap: join(root, 'missing-map.json'), materialLocationEvidence: join(root, 'missing-evidence.json') } })
    assert.equal((await app.request(url)).status, 200, 'cold reads use the confirmed plan, not changed global config')
    assert.equal((await app.request('/api/kaogong/study', { action: 'source-revoke', viewId: learner.view.id, id: shared.id, revision: shared.revision })).status, 200)
    assert.equal((await app.request(url)).status, 404)
    await app.request('/api/kaogong/study', { action: 'source-share', viewId: learner.view.id, ownerViewId: library.view.id, resourceId: 'materials' })
    await writeFile(join(materialRoot, original.relativePath), '%PDF-changed')
    assert.equal((await app.request(url)).status, 404, 'copied PDF changes invalidate the image provenance')
    assert.equal((await app.request('/api/kaogong/practice/start?viewId=' + learner.view.id, { subject: '行测-资料分析', limit: 1 })).status, 403)
    await writeFile(join(materialRoot, original.relativePath), source.pdfBytes)
    assert.equal((await app.request(url)).status, 200)
    assert.deepEqual(await readFile(join(materialRoot, original.relativePath)), source.pdfBytes)
    assert.deepEqual(await readFile(original.resolvedPath), source.pdfBytes)
  } finally { await app.close() }
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


test('scored round ledger counts repeated question slots and unique questions separately through the Host dashboard', async () => {
  const app=await fixture({source:10})
  try {
    const create=async kind=>(await app.request('/api/kaogong/study',{action:'create',kind,title:kind,confirmed:true})).value
    const library=await create('library'),learner=await create('learner'),viewId=learner.view.id
    const preview=(await app.request('/api/kaogong/material-import',{action:'prepare',viewId:library.view.id})).value
    assert.equal((await app.request('/api/kaogong/material-import',{action:'apply',viewId:library.view.id,id:preview.id,fingerprint:preview.fingerprint,confirmed:true})).status,200)
    await app.request('/api/kaogong/study',{action:'source-share',viewId,ownerViewId:library.view.id,resourceId:'question-bank'})
    let previousRoundId
    for(let i=0;i<2;i++){
      const round=(await app.request('/api/kaogong/practice/start?viewId='+viewId,{subject:'行测-资料分析',previousRoundId})).value
      assert.equal(round.returned,10)
      assert.doesNotMatch(JSON.stringify(round),/correctAnswer|explanation/)
      const scored=await app.request('/api/kaogong/practice/submit?viewId='+viewId,{roundId:round.roundId,answers:round.questions.map(row=>({id:row.id,answer:'B'}))})
      assert.equal(scored.status,200);previousRoundId=round.roundId
    }
    const data=(await app.request('/api/kaogong/dashboard?viewId='+viewId)).value
    assert.equal(data.totalQuestions,20)
    assert.equal(data.practiceStatistics.submittedCount,20)
    assert.equal(data.practiceStatistics.uniqueQuestionCount,10)
    assert.equal(data.practiceStatistics.answeredCount,20)
    assert.equal(data.practiceStatistics.unansweredCount,0)
    assert.equal(data.practiceStatistics.accuracyRate,1)
    assert.equal(data.modules.find(row=>row.subject==='行测-资料分析').practicedCount,20)
  } finally { await app.close() }
})


test('partial submitted rounds expose answered and blank slots with the full-round denominator and idempotent retries', async () => {
  const app=await fixture({source:10})
  try {
    const create=async kind=>(await app.request('/api/kaogong/study',{action:'create',kind,title:kind,confirmed:true})).value
    const library=await create('library'),learner=await create('learner'),viewId=learner.view.id
    const preview=(await app.request('/api/kaogong/material-import',{action:'prepare',viewId:library.view.id})).value
    await app.request('/api/kaogong/material-import',{action:'apply',viewId:library.view.id,id:preview.id,fingerprint:preview.fingerprint,confirmed:true})
    await app.request('/api/kaogong/study',{action:'source-share',viewId,ownerViewId:library.view.id,resourceId:'question-bank'})
    const round=(await app.request('/api/kaogong/practice/start?viewId='+viewId,{subject:'行测-资料分析'})).value
    const answers=round.questions.map((row,i)=>({id:row.id,answer:i<3?'B':i<5?'A':''}))
    const scored=await app.request('/api/kaogong/practice/submit?viewId='+viewId,{roundId:round.roundId,answers})
    assert.equal(scored.status,200)
    assert.equal(scored.value.correctCount,3)
    assert.equal(scored.value.answeredCount,5)
    assert.equal(scored.value.unansweredCount,5)
    assert.equal(scored.value.incorrectCount,2)
    assert.equal(scored.value.accuracyRate,.3)
    assert.deepEqual((await app.request('/api/kaogong/practice/submit?viewId='+viewId,{roundId:round.roundId,answers})).value,scored.value)
    assert.equal((await app.request('/api/kaogong/practice/submit?viewId='+viewId,{roundId:round.roundId,answers:answers.map(row=>({...row,answer:'B'}))})).status,409)
    const data=(await app.request('/api/kaogong/dashboard?viewId='+viewId)).value
    assert.equal(data.practiceStatistics.submittedCount,10)
    assert.equal(data.practiceStatistics.answeredCount,5)
    assert.equal(data.practiceStatistics.unansweredCount,5)
    assert.equal(data.practiceStatistics.incorrectCount,2)
    assert.equal(data.practiceStatistics.accuracyRate,.3)
  } finally { await app.close() }
})


test('historical wrong-answer causes remain visible after a newer correct round and survive Host restart', async () => {
  let app=await fixture({source:10})
  try {
    const create=async kind=>(await app.request('/api/kaogong/study',{action:'create',kind,title:kind,confirmed:true})).value
    const library=await create('library'),learner=await create('learner'),viewId=learner.view.id
    const preview=(await app.request('/api/kaogong/material-import',{action:'prepare',viewId:library.view.id})).value
    await app.request('/api/kaogong/material-import',{action:'apply',viewId:library.view.id,id:preview.id,fingerprint:preview.fingerprint,confirmed:true})
    await app.request('/api/kaogong/study',{action:'source-share',viewId,ownerViewId:library.view.id,resourceId:'question-bank'})
    const first=(await app.request('/api/kaogong/practice/start?viewId='+viewId,{subject:'行测-资料分析'})).value
    await app.request('/api/kaogong/practice/submit?viewId='+viewId,{roundId:first.roundId,answers:first.questions.map(row=>({id:row.id,answer:'A'}))})
    await app.request('/api/kaogong/practice/reflection?viewId='+viewId,{roundId:first.roundId,entries:[{id:first.questions[0].id,errorReason:'审题不清',notes:'保留本轮反思'}]})
    const second=(await app.request('/api/kaogong/practice/start?viewId='+viewId,{subject:'行测-资料分析',previousRoundId:first.roundId})).value
    await app.request('/api/kaogong/practice/submit?viewId='+viewId,{roundId:second.roundId,answers:second.questions.map(row=>({id:row.id,answer:'B'}))})
    const reflected=await app.request('/api/kaogong/practice/reflection?viewId='+viewId,{roundId:second.roundId,entries:[]})
    assert.equal(reflected.value.summary.totalQuestions,20)
    assert.equal(reflected.value.summary.totalWrong,10)
    assert.ok(reflected.value.summary.errorReasonBreakdown.some(row=>row.reason==='审题不清'&&row.count===1))
    const root=await app.suspend();app=await fixture({root})
    const restored=(await app.request('/api/kaogong/practice/read?viewId='+viewId,{roundId:first.roundId})).value
    assert.equal(restored.result.correctCount,0)
    assert.equal(restored.reflections[0].notes,'保留本轮反思')
    const data=(await app.request('/api/kaogong/dashboard?viewId='+viewId)).value
    assert.equal(data.practiceStatistics.submittedCount,20)
    assert.equal(data.practiceStatistics.incorrectCount,10)
    assert.ok(data.practiceStatistics.errorReasons.some(row=>row.reason==='审题不清'&&row.count===1))
  } finally { await app.close() }
})


test('the cumulative ledger is not truncated by the 100-row history presentation limit',async()=>{
 const app=await fixture({source:true})
 try{
  const create=async kind=>(await app.request('/api/kaogong/study',{action:'create',kind,title:kind,confirmed:true})).value
  const library=await create('library'),learner=await create('learner'),viewId=learner.view.id
  const preview=(await app.request('/api/kaogong/material-import',{action:'prepare',viewId:library.view.id})).value
  await app.request('/api/kaogong/material-import',{action:'apply',viewId:library.view.id,id:preview.id,fingerprint:preview.fingerprint,confirmed:true})
  await app.request('/api/kaogong/study',{action:'source-share',viewId,ownerViewId:library.view.id,resourceId:'question-bank'})
  for(let i=0;i<101;i++){
   const issued=(await app.request('/api/kaogong/practice/start?viewId='+viewId,{subject:'行测-资料分析'})).value
   assert.equal((await app.request('/api/kaogong/practice/submit?viewId='+viewId,{roundId:issued.roundId,answers:[{id:'first',answer:'B'}]})).status,200)
  }
  const open=(await app.request('/api/kaogong/practice/start?viewId='+viewId,{subject:'行测-资料分析'})).value
  const history=(await app.request('/api/kaogong/practice/history?viewId='+viewId,{})).value
  assert.equal(history.rounds.length,100)
  assert.ok(open.roundId)
  const data=(await app.request('/api/kaogong/dashboard?viewId='+viewId)).value
  assert.equal(data.practiceStatistics.submittedCount,101)
  assert.equal(data.practiceStatistics.submittedRoundCount,101)
  assert.equal(data.practiceStatistics.uniqueQuestionCount,1)
 }finally{await app.close()}
})

test('later bank revisions cannot change an issued round or its saved grade and an open round resumes after restart',async()=>{
 let app=await fixture({source:true})
 try{
  const create=async kind=>(await app.request('/api/kaogong/study',{action:'create',kind,title:kind,confirmed:true})).value
  const library=await create('library'),learner=await create('learner'),viewId=learner.view.id
  const adopt=async library=>{const p=(await app.request('/api/kaogong/material-import',{action:'prepare',viewId:library.view.id})).value;assert.equal((await app.request('/api/kaogong/material-import',{action:'apply',viewId:library.view.id,id:p.id,fingerprint:p.fingerprint,confirmed:true})).status,200)}
  await adopt(library)
  const grant=(await app.request('/api/kaogong/study',{action:'source-share',viewId,ownerViewId:library.view.id,resourceId:'question-bank'})).value
  const issued=(await app.request('/api/kaogong/practice/start?viewId='+viewId,{subject:'行测-资料分析'})).value
  const originalStem=issued.questions[0].stem,root=await app.suspend();app=await fixture({root})
  const resumed=(await app.request('/api/kaogong/practice/read?viewId='+viewId,{roundId:issued.roundId})).value
  assert.equal(resumed.result,null);assert.equal(resumed.questions[0].stem,originalStem)
  const source=join(root,'source/storages/kaogong_bank.json'),bank=JSON.parse(await readFile(source,'utf8'))
  bank.tables.questions.first.correctAnswer='A';bank.tables.questions.first.stem='后来的不同题干'
  await writeFile(source,JSON.stringify(bank))
  // Source home remains explicit after restart; its new revision is previewed into another empty library.
  const rootAgain=await app.suspend();app=await fixture({root:rootAgain,source:false,sourceHome:join(rootAgain,'source')})
  const newer=await create('library');await adopt(newer)
  await app.request('/api/kaogong/study',{action:'source-revoke',viewId,id:grant.id,revision:grant.revision})
  await app.request('/api/kaogong/study',{action:'source-share',viewId,ownerViewId:newer.view.id,resourceId:'question-bank'})
  const scored=(await app.request('/api/kaogong/practice/submit?viewId='+viewId,{roundId:issued.roundId,answers:[{id:'first',answer:'B'}]})).value
  assert.equal(scored.correctCount,1);assert.equal(scored.results[0].correctAnswer,'B');assert.equal(scored.results[0].stem,originalStem)
  const later=(await app.request('/api/kaogong/practice/start?viewId='+viewId,{subject:'行测-资料分析'})).value
  assert.equal(later.questions[0].stem,'后来的不同题干')
  assert.equal((await app.request('/api/kaogong/practice/read?viewId='+viewId,{roundId:issued.roundId})).value.result.correctCount,1)
 }finally{await app.close()}
})


test('plan task starts from an authorized source, retries one round, and requires matching submitted evidence plus reflection',async()=>{
 const app=await fixture({source:true})
 try{
  const create=async kind=>(await app.request('/api/kaogong/study',{action:'create',kind,title:kind,confirmed:true})).value
  const library=await create('library'),learner=await create('learner'),view=learner.view.id
  const adoption=(await app.request('/api/kaogong/material-import',{action:'prepare',viewId:library.view.id})).value
  await app.request('/api/kaogong/material-import',{action:'apply',viewId:library.view.id,id:adoption.id,fingerprint:adoption.fingerprint,confirmed:true})
  await app.request('/api/kaogong/study',{action:'source-share',viewId:view,ownerViewId:library.view.id,resourceId:'question-bank'})
  const preview=(await app.request('/api/kaogong/plan?viewId='+view,{action:'preview',baseRevision:0,operation:'append',task:{subject:'行测-资料分析',title:'真实任务练习',kind:'practice'}})).value
  const confirmed=(await app.request('/api/kaogong/plan?viewId='+view,{action:'confirm',id:preview.id,revision:0,confirmed:true})).value,task=confirmed.tasks[0]
  const started=(await app.request('/api/kaogong/plan/start?viewId='+view,{id:task.id,revision:1})).value
  assert.equal(started.round.questions[0].id,'first');assert.equal(started.round.questions[0].correctAnswer,undefined)
  const retry=(await app.request('/api/kaogong/plan/start?viewId='+view,{id:task.id,revision:1})).value
  assert.equal(retry.round.roundId,started.round.roundId)
  const complete=()=>app.request('/api/kaogong/plan?viewId='+view,{action:'complete',id:task.id,revision:started.state.revision,confirmed:true,roundId:started.round.roundId})
  assert.equal((await complete()).status,409)
  await app.request('/api/kaogong/practice/submit?viewId='+view,{roundId:started.round.roundId,answers:[{id:'first',answer:'A'}]})
  assert.equal((await complete()).status,409)
  await app.request('/api/kaogong/practice/reflection?viewId='+view,{roundId:started.round.roundId,entries:[{id:'first',errorReason:'审题不清',notes:'重新核对数据'}]})
  assert.equal((await complete()).status,200)
  assert.equal((await app.request('/api/kaogong/plan?viewId='+view)).value.tasks[0].status,'completed')
 }finally{await app.close()}
})

test('a required-practice lesson links its task round and learner confirmation updates overview without a fake countdown',async()=>{
 const app=await fixture({source:true})
 try{
  const create=async kind=>(await app.request('/api/kaogong/study',{action:'create',kind,title:kind,confirmed:true})).value
  const library=await create('library'),learner=await create('learner'),view=learner.view.id
  const empty=(await app.request('/api/kaogong/dashboard?viewId='+view)).value;assert.equal(empty.examDate,null);assert.equal(empty.daysToExam,null)
  const p=(await app.request('/api/kaogong/material-import',{action:'prepare',viewId:library.view.id})).value
  await app.request('/api/kaogong/material-import',{action:'apply',viewId:library.view.id,id:p.id,fingerprint:p.fingerprint,confirmed:true})
  await app.request('/api/kaogong/study',{action:'source-share',viewId:view,ownerViewId:library.view.id,resourceId:'question-bank'})
  const proposal=(await app.request('/api/kaogong/plan?viewId='+view,{action:'preview',baseRevision:0,operation:'append',task:{subject:'行测-资料分析',title:'学习后练习',kind:'learn',requirePractice:true}})).value
  const saved=(await app.request('/api/kaogong/plan?viewId='+view,{action:'confirm',id:proposal.id,revision:0,confirmed:true})).value,task=saved.tasks[0]
  const started=(await app.request('/api/kaogong/plan/start?viewId='+view,{id:task.id,revision:1})).value,lessonId=started.lesson.lesson.request.lessonId
  const round=(await app.request('/api/kaogong/practice/start?viewId='+view,{subject:task.subject,title:task.title,taskId:task.id,planRevision:1})).value
  assert.equal(round.context.taskId,task.id)
  await app.request('/api/kaogong/practice/submit?viewId='+view,{roundId:round.roundId,answers:[{id:'first',answer:'B'}]})
  assert.equal((await app.request('/api/kaogong/lesson/link?viewId='+view,{lessonId,roundId:round.roundId})).status,200)
  await app.request('/api/kaogong/lesson/summary?viewId='+view,{lessonId,notes:'已学习并练习'})
  assert.equal((await app.request('/api/kaogong/lesson/confirm?viewId='+view,{lessonId,confirmed:true})).status,200)
  const dashboard=(await app.request('/api/kaogong/dashboard?viewId='+view)).value;assert.equal(dashboard.completedTaskCount,1);assert.equal(dashboard.taskCompletionRate,1)
 }finally{await app.close()}
})
test('error occurrences survive a later correct round and require explicit enrollment and confirmed re-answer', async()=>{
 let app=await fixture({source:true})
 try{
  const create=async kind=>(await app.request('/api/kaogong/study',{action:'create',kind,title:kind,confirmed:true})).value
  const library=await create('library'),learner=await create('learner'),other=(await app.request('/api/kaogong/study',{action:'create',kind:'learner',title:'另一个档案',confirmed:true})).value,viewId=learner.view.id
  const preview=(await app.request('/api/kaogong/material-import',{action:'prepare',viewId:library.view.id})).value
  await app.request('/api/kaogong/material-import',{action:'apply',viewId:library.view.id,id:preview.id,fingerprint:preview.fingerprint,confirmed:true})
  const grant=(await app.request('/api/kaogong/study',{action:'source-share',viewId,ownerViewId:library.view.id,resourceId:'question-bank'})).value
  const start=async()=>(await app.request('/api/kaogong/practice/start?viewId='+viewId,{subject:'行测-资料分析'})).value
  const first=await start()
  await app.request('/api/kaogong/practice/submit?viewId='+viewId,{roundId:first.roundId,answers:[{id:'first',answer:'A'}]})
  await app.request('/api/kaogong/practice/reflection?viewId='+viewId,{roundId:first.roundId,entries:[{id:'first',errorReason:'审题不清',notes:'漏看第一项'}]})
  const second=await start()
  await app.request('/api/kaogong/practice/submit?viewId='+viewId,{roundId:second.roundId,answers:[{id:'first',answer:'B'}]})
  const url='/api/kaogong/errors?viewId='+viewId
  const errors=(await app.request(url)).value
  assert.equal(errors.occurrences.length,1)
  const item=errors.occurrences[0]
  assert.equal(item.roundId,first.roundId);assert.equal(item.userAnswer,'A');assert.equal(item.correctAnswer,'B');assert.equal(item.notes,'漏看第一项')
  assert.equal((await app.request('/api/kaogong/errors?viewId='+other.view.id)).value.occurrences.length,0)
  assert.equal((await app.request(url,{action:'enroll',id:item.id})).status,409)
  const enrolled=(await app.request(url,{action:'enroll',id:item.id,confirmed:true})).value
  assert.equal(enrolled.stage,0);assert.equal(enrolled.status,'scheduled');assert.equal(Date.parse(enrolled.dueAt)-Date.parse(enrolled.enrolledAt),86400000)
  const attempt=(await app.request(url,{action:'answer',id:item.id,answer:'B',requestId:'review-attempt-one',earlyConfirmed:true})).value
  assert.equal(attempt.correct,true)
  assert.equal((await app.request(url,{action:'confirm',id:item.id,attemptId:attempt.id,reflection:'这次读清题目',confirmed:false})).status,409)
  assert.equal((await app.request(url)).value.occurrences[0].review.stage,0)
  const confirmed=(await app.request(url,{action:'confirm',id:item.id,attemptId:attempt.id,reflection:'这次读清题目',confirmed:true})).value
  assert.equal(confirmed.stage,1);assert.equal(confirmed.history.length,1);assert.equal(Date.parse(confirmed.dueAt)-Date.parse(confirmed.history[0].confirmedAt),259200000)
  assert.equal((await app.request(url,{action:'confirm',id:item.id,attemptId:attempt.id,reflection:'这次读清题目',confirmed:true})).value.stage,1)
  assert.equal((await app.request('/api/kaogong/dashboard?viewId='+viewId)).value.reviewQueue.total,1)
  assert.equal((await app.request(url+'&status=not-enrolled')).value.occurrences.length,0)
  assert.equal((await app.request(url+'&errorReason='+encodeURIComponent('审题不清'))).value.occurrences.length,1)
  assert.equal((await app.request(url,{action:'answer',id:item.id,answer:'A',requestId:'early-without-confirm'})).status,409)
  const wrong=(await app.request(url,{action:'answer',id:item.id,answer:'A',requestId:'review-wrong',earlyConfirmed:true})).value
  const reset=(await app.request(url,{action:'confirm',id:item.id,attemptId:wrong.id,reflection:'重新订正',confirmed:true})).value
  assert.equal(reset.stage,0);assert.equal(reset.status,'pending-correction');assert.equal(Date.parse(reset.dueAt)-Date.parse(reset.history.at(-1).confirmedAt),86400000)
  for(let stage=1;stage<=3;stage++){
   const answered=(await app.request(url,{action:'answer',id:item.id,answer:'B',requestId:'stage-'+stage,earlyConfirmed:true})).value
   const next=(await app.request(url,{action:'confirm',id:item.id,attemptId:answered.id,reflection:'重新读取并核对',confirmed:true})).value
   assert.equal(next.stage,stage);assert.equal(next.status,stage===3?'consolidated':'scheduled');assert.equal(Date.parse(next.dueAt)-Date.parse(next.history.at(-1).confirmedAt),stage===1?259200000:604800000)
  }
  assert.equal((await app.request(url+'&status=consolidated')).value.occurrences[0].review.history.length,5)
  const roundAgain=(await app.request('/api/kaogong/practice/read?viewId='+viewId,{roundId:first.roundId})).value
  assert.equal(roundAgain.result.correctCount,0);assert.equal(roundAgain.result.results[0].userAnswer,'A')
  const persistedRoot=await app.suspend();app=await fixture({root:persistedRoot})
  const restored=(await app.request(url)).value.occurrences[0]
  assert.equal(restored.review.stage,3);assert.equal(restored.review.history.length,5);assert.equal(restored.userAnswer,'A')
  await app.request('/api/kaogong/study',{action:'source-revoke',viewId,id:grant.id,revision:grant.revision})
  assert.equal((await app.request(url)).status,403)
 }finally{await app.close()}
})

test('review plan proposals stay inert and completion requires a new confirmed occurrence attempt after starting',async()=>{
 const app=await fixture({source:true})
 try{
  const create=async kind=>(await app.request('/api/kaogong/study',{action:'create',kind,title:kind,confirmed:true})).value
  const library=await create('library'),learner=await create('learner'),viewId=learner.view.id,planUrl='/api/kaogong/plan?viewId='+viewId,errorUrl='/api/kaogong/errors?viewId='+viewId
  const preview=(await app.request('/api/kaogong/material-import',{action:'prepare',viewId:library.view.id})).value
  await app.request('/api/kaogong/material-import',{action:'apply',viewId:library.view.id,id:preview.id,fingerprint:preview.fingerprint,confirmed:true})
  await app.request('/api/kaogong/study',{action:'source-share',viewId,ownerViewId:library.view.id,resourceId:'question-bank'})
  const round=(await app.request('/api/kaogong/practice/start?viewId='+viewId,{subject:'行测-资料分析'})).value
  await app.request('/api/kaogong/practice/submit?viewId='+viewId,{roundId:round.roundId,answers:[{id:'first',answer:'A'}]})
  const item=(await app.request(errorUrl)).value.occurrences[0]
  await app.request(errorUrl,{action:'enroll',id:item.id,confirmed:true})
  const answer=async requestId=>(await app.request(errorUrl,{action:'answer',id:item.id,answer:'B',requestId,earlyConfirmed:true})).value
  const old=await answer('before-task');await app.request(errorUrl,{action:'confirm',id:item.id,attemptId:old.id,reflection:'先前复习',confirmed:true})
  assert.equal((await app.request(planUrl,{action:'preview',baseRevision:0,operation:'append',task:{subject:item.subject,title:'外来错题',kind:'review',reviewOccurrence:{roundId:'00000000-0000-4000-8000-000000000001',questionId:'first'}}})).status,409)
  const draft=(await app.request(planUrl,{action:'preview',baseRevision:0,operation:'append',task:{subject:item.subject,title:'复习原错题',kind:'review',reviewOccurrence:{roundId:item.roundId,questionId:item.questionId}}})).value
  assert.deepEqual(draft.tasks[0].reviewOccurrence,{roundId:item.roundId,questionId:item.questionId})
  assert.equal((await app.request(planUrl)).value.tasks.length,0)
  let plan=(await app.request(planUrl,{action:'confirm',id:draft.id,revision:0,confirmed:true})).value
  const task=plan.tasks[0]
  assert.equal((await app.request(planUrl,{action:'complete',id:task.id,revision:plan.revision,confirmed:true})).status,409)
  const started=(await app.request('/api/kaogong/plan/start?viewId='+viewId,{id:task.id,revision:plan.revision})).value
  assert.equal(started.round,undefined);assert.equal(started.reviewOccurrence,item.id);plan=started.state
  assert.equal((await app.request(planUrl,{action:'complete',id:task.id,revision:plan.revision,confirmed:true})).status,409)
  const fresh=await answer('after-task')
  assert.equal((await app.request(planUrl,{action:'complete',id:task.id,revision:plan.revision,confirmed:true})).status,409)
  await app.request(errorUrl,{action:'confirm',id:item.id,attemptId:fresh.id,reflection:'本次重新答题核对',confirmed:true})
  const complete=(await app.request(planUrl,{action:'complete',id:task.id,revision:plan.revision,confirmed:true})).value
  assert.equal(complete.tasks[0].status,'completed');assert.equal(complete.tasks[0].evidence.proof.attemptId,fresh.id)
  assert.equal((await app.request('/api/kaogong/dashboard?viewId='+viewId)).value.practiceStatistics.submittedCount,1)
 }finally{await app.close()}
})

test('the real plan page starts an authorized task through the strict public Host contract',async()=>{
 const app=await fixture({source:true})
 const {JSDOM}=await import('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),saved=new Map(),values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,DOMParser:dom.window.DOMParser,IS_REACT_ACT_ENVIRONMENT:true}
 for(const[key,value]of Object.entries(values)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})}
 saved.set('React',Object.getOwnPropertyDescriptor(globalThis,'React'))
 const React=await import('react');globalThis.React=React
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'))
 try{
  const create=async kind=>(await app.request('/api/kaogong/study',{action:'create',kind,title:kind,confirmed:true})).value
  const library=await create('library'),learner=await create('learner'),viewId=learner.view.id,planUrl='/api/kaogong/plan?viewId='+viewId
  const source=(await app.request('/api/kaogong/material-import',{action:'prepare',viewId:library.view.id})).value
  await app.request('/api/kaogong/material-import',{action:'apply',viewId:library.view.id,id:source.id,fingerprint:source.fingerprint,confirmed:true})
  await app.request('/api/kaogong/study',{action:'source-share',viewId,ownerViewId:library.view.id,resourceId:'question-bank'})
  const draft=(await app.request(planUrl,{action:'preview',baseRevision:0,operation:'append',task:{subject:'行测-资料分析',title:'页面开始练习',kind:'practice'}})).value
  await app.request(planUrl,{action:'confirm',id:draft.id,revision:0,confirmed:true})
  const {StudyPlanPanel}=await import('../src/study-plan-panel.tsx'),{KaogongTransportContext}=await import('../src/view-context.tsx'),{createViewTransport}=await import('../src/client-runtime.ts'),{KaogongStateContext,KaogongViewState}=await import('../src/view-state.tsx')
  const owner=new KaogongViewState(learner.profile.id),transport=createViewTransport({instanceId:learner.profile.id,viewId},async(input,init)=>{const response=await app.request(String(input),init?.body?JSON.parse(String(init.body)):undefined);return new Response(JSON.stringify(response.value),{status:response.status})})
  let page='plan'
  await React.act(async()=>root.render(React.createElement(KaogongStateContext.Provider,{value:owner},React.createElement(KaogongTransportContext.Provider,{value:transport},React.createElement(StudyPlanPanel,{onPage:value=>{page=value},onOpenTeacher:async()=>{}})))))
  for(let i=0;i<100&&!document.querySelector('article');i++)await React.act(async()=>new Promise(resolve=>setTimeout(resolve,10)))
  assert.ok(document.querySelector('article'),document.body.textContent)
  await React.act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='开始任务').click())
  for(let i=0;i<100&&page==='plan'&&!document.querySelector('[role=alert]');i++)await React.act(async()=>new Promise(resolve=>setTimeout(resolve,10)))
  assert.equal(page,'practice',document.body.textContent)
  assert.equal((await app.request(planUrl)).value.tasks[0].status,'in-progress')
 }finally{await React.act(async()=>root.unmount());dom.window.close();for(const[key,value]of saved)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await app.close()}
})



test('appending to a full current day keeps its existing task and explicitly overflows the new task',async()=>{
 const app=await fixture()
 try{
  const learner=(await app.request('/api/kaogong/study',{action:'create',kind:'learner',title:'当日容量',confirmed:true})).value,url='/api/kaogong/plan?viewId='+learner.view.id
  const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')
  const goal=(await app.request(url,{action:'preview',baseRevision:0,operation:'generate',goal:{examDate:null,dailyModules:1,subjects:[{name:'行测-资料分析',weight:1}]}})).value
  let state=(await app.request(url,{action:'confirm',id:goal.id,revision:0,confirmed:true})).value
  const first=(await app.request(url,{action:'preview',baseRevision:state.revision,operation:'append',date:today,task:{subject:'行测-资料分析',title:'原有今日任务',kind:'learn'}})).value
  state=(await app.request(url,{action:'confirm',id:first.id,revision:state.revision,confirmed:true})).value
  const second=(await app.request(url,{action:'preview',baseRevision:state.revision,operation:'append',date:today,task:{subject:'行测-资料分析',title:'今日追加任务',kind:'learn'}})).value
  assert.equal(second.tasks.find(task=>task.id===state.tasks[0].id).date,today)
  const added=second.tasks.find(task=>task.title==='今日追加任务')
  assert.equal(added.date,null);assert.deepEqual(second.overflow,[added.id])
  assert.equal((await app.request(url)).value.tasks.length,1)
 }finally{await app.close()}
})

test('a task accepts a partially answered submitted round only after every required reflection and learner confirmation',async()=>{
 const app=await fixture({source:10})
 try{
  const create=async kind=>(await app.request('/api/kaogong/study',{action:'create',kind,title:kind,confirmed:true})).value
  const library=await create('library'),learner=await create('learner'),other=await create('learner'),view=learner.view.id,url='/api/kaogong/plan?viewId='+view
  const adoption=(await app.request('/api/kaogong/material-import',{action:'prepare',viewId:library.view.id})).value
  await app.request('/api/kaogong/material-import',{action:'apply',viewId:library.view.id,id:adoption.id,fingerprint:adoption.fingerprint,confirmed:true})
  await app.request('/api/kaogong/study',{action:'source-share',viewId:view,ownerViewId:library.view.id,resourceId:'question-bank'})
  const draft=(await app.request(url,{action:'preview',baseRevision:0,operation:'append',task:{subject:'行测-资料分析',title:'部分作答任务',kind:'practice'}})).value
  const plan=(await app.request(url,{action:'confirm',id:draft.id,revision:0,confirmed:true})).value,task=plan.tasks[0]
  const started=(await app.request('/api/kaogong/plan/start?viewId='+view,{id:task.id,revision:plan.revision})).value,round=started.round,revision=started.state.revision
  const complete=(overrides={})=>app.request(url,{action:'complete',id:task.id,revision,confirmed:true,roundId:round.roundId,...overrides})
  const answers=round.questions.map((q,i)=>({id:q.id,answer:i<3?'B':i<5?'A':''}))
  const scored=await app.request('/api/kaogong/practice/submit?viewId='+view,{roundId:round.roundId,answers})
  assert.equal(scored.status,200,JSON.stringify(scored.value));assert.equal(scored.value.correctCount,3);assert.equal(scored.value.incorrectCount,2);assert.equal(scored.value.unansweredCount,5)
  assert.equal((await complete()).status,409)
  const required=scored.value.results.filter(q=>!q.correct).map(q=>({id:q.id,errorReason:'审题不清',notes:'含未答题的本轮反思'}))
  assert.equal(required.length,7)
  assert.equal((await app.request('/api/kaogong/practice/reflection?viewId='+view,{roundId:round.roundId,entries:required.slice(0,-1)})).status,200)
  assert.equal((await complete()).status,409)
  assert.equal((await app.request('/api/kaogong/practice/reflection?viewId='+view,{roundId:round.roundId,entries:required})).status,200)
  assert.equal((await complete({confirmed:false})).status,409)
  assert.equal((await complete({revision:revision-1})).status,409)
  assert.equal((await app.request('/api/kaogong/plan?viewId='+other.view.id,{action:'complete',id:task.id,revision:0,confirmed:true,roundId:round.roundId})).status,409)
  assert.equal((await complete({roundId:'00000000-0000-4000-8000-000000000001'})).status,409)
  const retry=(await app.request('/api/kaogong/plan/start?viewId='+view,{id:task.id,revision:plan.revision})).value
  assert.equal(retry.round.roundId,round.roundId)
  assert.equal((await complete()).status,200)
  assert.equal((await app.request(url)).value.tasks[0].status,'completed')
  assert.deepEqual((await app.request('/api/kaogong/practice/read?viewId='+view,{roundId:round.roundId})).value.result,scored.value)
 }finally{await app.close()}
})
