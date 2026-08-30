/**
 * Unit tests for the zod record schemas against the sample data. Requires zod
 * to be resolvable (e.g. dropped into the DSH repo, or a node_modules link).
 * Run:
 *   node --test tests/schemas.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { questionRecord, bankQuestion, planConfig, dayPlan, knowledgeEntry } from '../src/schemas.ts'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel) => JSON.parse(readFileSync(join(here, rel), 'utf8'))

test('sample-questions.json 每条都通过 questionRecord', () => {
  const data = read('../data/sample-questions.json')
  assert.ok(Array.isArray(data.questions) && data.questions.length > 0)
  for (const q of data.questions) {
    assert.doesNotThrow(() => questionRecord.parse(q))
  }
})

test('sample-bank.json 每条都通过 bankQuestion', () => {
  const data = read('../data/sample-bank.json')
  assert.ok(Array.isArray(data.questions) && data.questions.length > 0)
  for (const q of data.questions) {
    assert.doesNotThrow(() => bankQuestion.parse(q))
  }
})

test('planConfig 拒绝非法值', () => {
  assert.doesNotThrow(() => planConfig.parse({ examDate: '2027-03-01', dailyModules: 2, subjects: [{ name: 'X', weight: 1 }] }))
  assert.throws(() => planConfig.parse({ examDate: '2027-3-1', dailyModules: 2, subjects: [{ name: 'X', weight: 1 }] }))
  assert.throws(() => planConfig.parse({ examDate: '2027-03-01', dailyModules: 0, subjects: [{ name: 'X', weight: 1 }] }))
  assert.throws(() => planConfig.parse({ examDate: '2027-03-01', dailyModules: 2, subjects: [{ name: 'X', weight: 0 }] }))
})

test('dayPlan 拒绝非法 phase/kind', () => {
  assert.throws(() => dayPlan.parse({ date: '2026-01-01', phase: 'bogus', items: [] }))
  assert.throws(() => dayPlan.parse({ date: '2026-01-01', phase: 'foundation', items: [{ subject: 'X', kind: 'bogus', title: 't', done: false }] }))
})

test('sample-knowledge.json 每条都通过 knowledgeEntry', () => {
  const data = read('../data/sample-knowledge.json')
  assert.ok(Array.isArray(data.entries) && data.entries.length > 0)
  for (const entry of data.entries) {
    assert.doesNotThrow(() => knowledgeEntry.parse(entry))
  }
})
