import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { parseMaterials, matchMaterial, normalizeQuestion, recordDigest } from '../src/material-repair.ts'
import { migrateMaterials } from '../src/material-migration.ts'

const material = '2019年一季度社会消费品零售总额97790亿元同比名义增长8.3%。其中3月份社会消费品零售总额31726亿元同比增长8.7%。'
const fixture = `## 三、根据所给资料，回答121～125题。\n${material}\n<table><tr><td>42</td></tr></table>\n![](chart.jpg)\n注：1. 注释。\n2. 不是题号。\n` + Array.from({ length: 5 }, (_, i) => `${121 + i}. 第${i}项是多少？\nA. 1.5 B. 2 C. 3 D. 4\n`).join('\n')

test('material parser retains full charts/tables and excludes other questions and annotations', () => {
  const questions = parseMaterials(fixture, '1200题题本.pdf')
  assert.equal(questions.length, 5)
  assert.match(questions[0].material, /<table>/)
  assert.match(questions[0].material, /chart.jpg/)
  assert.match(questions[0].material, /不是题号/)
  assert.ok(!questions[0].material.includes('第0项'))
  assert.equal(parseMaterials(fixture.replace('123.', '缺少题号'), 'test').length, 0)
  assert.equal(parseMaterials(fixture.replace(material, material + '【答案】A'), 'test').length, 0)
})

test('matching requires all four options, stem, material evidence and a unique candidate', () => {
  const candidates = parseMaterials(fixture, '1200题题本.pdf')
  const old = { stem: material + '\n第0项是多少：', options: ['A. 1.5', 'B. 2', 'C. 3', 'D. 4'], source: '1200题' }
  assert.equal(matchMaterial(old, candidates).length, 1)
  assert.equal(matchMaterial({ ...old, options: ['A. 15', 'B. 2', 'C. 3', 'D. 4'] }, candidates).length, 0)
  assert.equal(matchMaterial({ ...old, stem: '完全无关材料\n第0项是多少：' }, candidates).length, 0)
  assert.equal(matchMaterial(old, [...candidates, candidates[0]]).length, 2)
  assert.notEqual(normalizeQuestion('-2'), normalizeQuestion('2'))
  assert.equal(normalizeQuestion('−2'), normalizeQuestion('-2'))
})

test('migration backs up before writes, preserves IDs/options/answers and pauses unmatched rows', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'kg-material-'))
  try {
    const old: any = { subject: '行测-资料分析', stem: 'old', options: ['A', 'B', 'C', 'D'], correctAnswer: 'C', tags: [], reviewStatus: 'approved', reviewedAt: 'original' }
    const map = new Map([['a', { ...old }], ['b', { ...old }]])
    const table = { entries: () => map.entries(), get: (id: string) => map.get(id), put: async (id: string, value: any) => { map.set(id, value) } }
    const rows = [{ id: 'a', state: 'matched', expectedHash: recordDigest(old), stem: material + '\n![](chart)', source: '题本', number: 121, group: 0 }, { id: 'b', state: 'unmatched', expectedHash: recordDigest(old) }]
    await writeFile(resolve(root, 'material-repair-plan.json'), JSON.stringify({ version: 1, rows }))
    await migrateMaterials(root, table)
    assert.equal(map.size, 2)
    assert.equal(map.get('a').correctAnswer, 'C')
    assert.deepEqual(map.get('a').options, old.options)
    assert.equal(map.get('a').reviewStatus, 'approved')
    assert.equal(map.get('b').reviewStatus, 'pending')
    assert.equal(map.get('b').stem, 'old')
    const backups = await readdir(resolve(root, 'bank-backups'))
    assert.deepEqual(JSON.parse(await readFile(resolve(root, 'bank-backups', backups[0]), 'utf8')).records.a, old)
    await migrateMaterials(root, table)
    assert.equal((await readdir(resolve(root, 'bank-backups'))).length, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('migration refuses stale snapshots before any writes', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'kg-material-'))
  try {
    await writeFile(resolve(root, 'material-repair-plan.json'), JSON.stringify({ version: 1, rows: [{ id: 'a', state: 'unmatched', expectedHash: 'stale' }] }))
    await assert.rejects(migrateMaterials(root, { entries: () => [], get: () => ({ subject: '行测-资料分析', tags: [] } as any), put: async () => { assert.fail('must not write') } }), /snapshot changed/)
    assert.deepEqual(await readdir(root), ['material-repair-plan.json'])
  } finally { await rm(root, { recursive: true, force: true }) }
})
