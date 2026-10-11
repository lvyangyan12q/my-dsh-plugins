import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

export const subject = '行测-资料分析'
export const point = '增长率'
export const oldPlan = { examDate: '2030-03-01', dailyModules: 3, subjects: [{ name: subject, weight: 2 }] }
export const oldDay = { date: '2026-09-01', phase: 'foundation', items: [{ subject, kind: 'learn', title: 'Synthetic retained completed plan item', done: true }] }
export const oldNote = { subject, knowledgePoint: point, title: 'Synthetic historical material', content: 'Synthetic old note: completed is prose only.\n<table><tr><td>42</td></tr></table>\n![old](题目_images/old.png)', kind: '讲义', source: 'synthetic public fixture', tags: [], createdAt: '2020-01-01', updatedAt: '2020-01-01' }
export const oldQuestion = { subject, knowledgePoint: point, questionType: '单选', stem: 'Synthetic historical question', options: ['A. 10', 'B. 20'], correctAnswer: 'B', userAnswer: 'A', result: 'wrong', tags: [], source: 'synthetic old fixture', errorReason: '概念混淆', notes: 'Preserve this learner reflection', createdAt: '2020-01-01', updatedAt: '2020-01-01' }

export async function legacyStore(source, root, visit) {
  const require = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
  const { Context } = require('@deepseek-ai/cordis')
  const load = path => import(pathToFileURL(resolve(source, path)).href)
  const { default: Storage } = await load('packages/storage/storage/lib/index.js')
  const { JsonStorageBackend } = await load('packages/storage/storage-json/lib/index.js')
  const { DomainFacility, defineDomain, domainTable } = await load('packages/storage/storage-domain/lib/index.js')
  const { z } = createRequire(resolve(source, 'packages/storage/storage-domain/package.json'))('zod')
  const ctx = new Context(); await ctx.plugin(Storage)
  const backend = new JsonStorageBackend(root); ctx.storage.backend.register('json', backend)
  const facility = new DomainFacility(ctx, { backend: 'json' }), handles = []
  try {
    const specs = [['kaogong_bank', 2, 'questions'], ['kaogong_notebook', 1, 'questions'], ['kaogong_knowledge', 1, 'entries'], ['kaogong_progress', 1, 'days']]
    const domains = {}
    for (const [name, version, table] of specs) {
      const domain = await facility.open(defineDomain({ name, version, tables: { [table]: domainTable(z.unknown()) }, ...(name === 'kaogong_progress' ? { global: { schema: z.object({ examDate: z.string(), dailyModules: z.number(), subjects: z.array(z.object({ name: z.string(), weight: z.number() })) }), initial: oldPlan } } : {}) }))
      handles.push(domain); domains[name] = domain
    }
    return await visit(domains)
  } finally { for (const handle of handles.reverse()) await handle.close(); await backend.close(); await ctx.fiber.dispose() }
}

export async function seedLegacy(source, root) {
  await legacyStore(source, join(root, 'data'), async domains => {
    for (let n = 0; n < 12; n++) await domains.kaogong_bank.table('questions').put('release-' + n, { subject, knowledgePoint: point, questionType: '单选', stem: `Synthetic issued question ${n}\n![old](题目_images/old.png)`, options: ['A. 10', 'B. 20'], correctAnswer: 'B', explanation: 'synthetic explanation', difficulty: 'easy', source: 'synthetic release fixture', origin: 'local', reviewStatus: 'approved', reviewNotes: '', tags: [], createdAt: '2020-01-01', reviewedAt: '' })
    await domains.kaogong_notebook.table('questions').put('legacy', oldQuestion)
    await domains.kaogong_knowledge.table('entries').put('material', oldNote)
    await domains.kaogong_progress.global.set(oldPlan)
    await domains.kaogong_progress.table('days').put(oldDay.date, oldDay)
  })
  const assets = join(root, 'durable-images'), results = join(root, 'durable-results'), id = randomUUID()
  await mkdir(assets); await mkdir(join(results, id, 'assets'), { recursive: true })
  const bytes = await readFile(new URL('../plugins/kaogong/题目_images/verified/资料600-2024-jiangsu-17.png', import.meta.url))
  await writeFile(join(assets, 'old.png'), bytes); await writeFile(join(results, id, 'assets', 'chart.png'), bytes)
  await writeFile(join(results, id, 'knowledge.md'), 'Synthetic completed result retained outside npm package')
  return { assets, results, id, bytes }
}

export async function assertLegacy(source, root, assets) {
  await legacyStore(source, join(root, 'data'), async domains => {
    assert.deepEqual(domains.kaogong_notebook.table('questions').get('legacy'), oldQuestion)
    assert.equal(domains.kaogong_notebook.table('questions').size, 11, 'One legacy record plus ten issued IDs; retries must not duplicate rows')
    assert.deepEqual(domains.kaogong_knowledge.table('entries').get('material'), oldNote)
    assert.deepEqual(domains.kaogong_progress.global.get(), oldPlan)
    assert.deepEqual(domains.kaogong_progress.table('days').get(oldDay.date), oldDay)
    assert.equal(domains.kaogong_bank.table('questions').size, 12)
    assert.equal(domains.kaogong_bank.table('questions').get('release-0').correctAnswer, 'B')
  })
  assert.deepEqual(await readFile(join(assets.assets, 'old.png')), assets.bytes)
  assert.deepEqual(await readFile(join(assets.results, assets.id, 'assets/chart.png')), assets.bytes)
  assert.equal(await readFile(join(assets.results, assets.id, 'knowledge.md'), 'utf8'), 'Synthetic completed result retained outside npm package')
}
