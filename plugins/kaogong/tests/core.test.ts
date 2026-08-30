/**
 * Unit tests for the pure core (no DeepSeek Harness runtime, no zod). Run:
 *   node --test tests/core.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeQuestions, summarizeQuestions } from '../src/analyze.ts'
import { generatePlan, daysToExam, addDays } from '../src/schedule.ts'
import { selectPractice } from '../src/practice.ts'
import { searchKnowledge } from '../src/knowledge.ts'
import { flattenTaxonomy, TAXONOMY, renderTaxonomy } from '../src/taxonomy.ts'
import type { Question, BankQuestion, KnowledgeEntry } from '../src/types.ts'

function q(id: string, subject: string, kp: string, result: Question['result'], errorReason = ''): Question {
  return {
    id, subject, knowledgePoint: kp, questionType: '单选', stem: '题干', options: [],
    correctAnswer: 'A', userAnswer: 'B', result, errorReason, notes: '', source: '', tags: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function bq(id: string, subject: string, kp: string, difficulty: BankQuestion['difficulty'] = 'easy', reviewStatus: BankQuestion['reviewStatus'] = 'approved'): BankQuestion {
  return {
    id, subject, knowledgePoint: kp, questionType: '单选', stem: '题干', options: [],
    correctAnswer: 'A', explanation: '解析', difficulty, source: '', origin: 'local',
    reviewStatus, reviewNotes: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z', reviewedAt: '',
  }
}

function k(id: string, subject: string, kp: string, title: string, content: string, kind: KnowledgeEntry['kind'] = '笔记', tags: string[] = []): KnowledgeEntry {
  return {
    id, subject, knowledgePoint: kp, title, content, kind, source: '', tags,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

test('analyzeQuestions: 聚合、正确率（不含跳过）、按错题数排序', () => {
  const qs = [
    q('1', '行测-判断推理', '图形推理-数量规律', 'wrong', '概念混淆'),
    q('2', '行测-判断推理', '图形推理-数量规律', 'wrong', '粗心大意'),
    q('3', '行测-资料分析', '增长-增长率', 'wrong', '计算/分析失误'),
    q('4', '行测-资料分析', '增长-增长率', 'correct'),
    q('5', '行测-常识判断', '法律', 'skipped'),
  ]
  const a = analyzeQuestions(qs)
  assert.equal(a.totalQuestions, 5)
  assert.equal(a.totalCorrect, 1)
  assert.equal(a.totalWrong, 3)
  assert.equal(a.totalSkipped, 1)
  assert.ok(Math.abs(a.accuracyRate - 0.25) < 1e-9)

  assert.equal(a.bySubject[0]?.subject, '行测-判断推理')
  assert.equal(a.bySubject[0]?.wrongCount, 2)

  assert.equal(a.byKnowledgePoint[0]?.knowledgePoint, '图形推理-数量规律')
  assert.equal(a.byKnowledgePoint[0]?.wrongCount, 2)
  assert.equal(a.byKnowledgePoint[0]?.errorReasons.length, 2)

  assert.equal(a.byErrorReason.length, 3)
  assert.ok(a.byErrorReason.every(r => r.count === 1))
})

test('summarizeQuestions: 薄弱点排序、建议与叙述', () => {
  const qs = [
    q('1', '行测-判断推理', '图形推理-数量规律', 'wrong', '概念混淆'),
    q('2', '行测-判断推理', '图形推理-数量规律', 'wrong', '粗心大意'),
  ]
  const s = summarizeQuestions(qs, { topN: 5 })
  assert.equal(s.totalWrong, 2)
  assert.equal(s.weakPoints.length, 1)
  assert.equal(s.weakPoints[0]?.knowledgePoint, '图形推理-数量规律')
  assert.ok(s.weakPoints[0]?.suggestion.includes('图形'))
  assert.ok(s.narrative.includes('错题总结'))
  assert.ok(s.suggestions.length > 0)
})

test('generatePlan: 倒排阶段与总天数', () => {
  const plan = generatePlan({ examDate: '2026-03-01', dailyModules: 2, subjects: [{ name: '行测-判断推理', weight: 1 }] }, '2026-01-01')
  assert.ok(plan.totalDays > 0)
  assert.equal(plan.days.length, plan.totalDays)
  assert.equal(plan.days[0]?.date, '2026-01-01')
  assert.equal(plan.phases[0]?.phase, 'foundation')
  assert.equal(plan.phases.reduce((n, p) => n + p.days, 0), plan.totalDays)
  assert.ok(plan.days[0]?.items.every(i => i.kind === 'learn'))
})

test('generatePlan: 考试日期必须晚于今天', () => {
  assert.throws(() => generatePlan({ examDate: '2026-01-01', dailyModules: 2, subjects: [{ name: 'X', weight: 1 }] }, '2026-01-02'))
})

test('daysToExam / addDays', () => {
  assert.equal(daysToExam('2026-01-01', '2026-01-11'), 10)
  assert.equal(addDays('2026-01-01', 10), '2026-01-11')
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')
})

test('selectPractice: weak 模式按薄弱考点抽题', () => {
  const bank = [
    bq('b1', '行测-判断推理', '图形推理-数量规律'),
    bq('b2', '行测-判断推理', '图形推理-数量规律'),
    bq('b3', '行测-资料分析', '增长-增长率'),
    bq('b4', '行测-常识判断', '法律'),
  ]
  const notebook = [
    q('n1', '行测-判断推理', '图形推理-数量规律', 'wrong'),
    q('n2', '行测-判断推理', '图形推理-数量规律', 'wrong'),
    q('n3', '行测-资料分析', '增长-增长率', 'wrong'),
  ]
  const sel = selectPractice(bank, notebook, { weak: true, limit: 10 })
  assert.deepEqual(sel.targets, ['图形推理-数量规律', '增长-增长率'])
  assert.equal(sel.selected.length, 3)
  assert.ok(sel.selected.every(b => b.knowledgePoint !== '法律'))
})

test('selectPractice: 指定考点与 limit 截断', () => {
  const bank = [bq('b1', 'S', 'KP-A'), bq('b2', 'S', 'KP-A'), bq('b3', 'S', 'KP-A')]
  assert.equal(selectPractice(bank, [], { knowledgePoint: 'KP-A', limit: 2 }).selected.length, 2)
  assert.equal(selectPractice(bank, [], { knowledgePoint: 'KP-B', limit: 2 }).selected.length, 0)
})

test('selectPractice: 只抽取已通过审查（approved）的题', () => {
  const bank = [
    bq('b1', 'S', 'KP-A', 'easy', 'approved'),
    bq('b2', 'S', 'KP-A', 'easy', 'pending'),
    bq('b3', 'S', 'KP-A', 'easy', 'rejected'),
  ]
  const sel = selectPractice(bank, [], { knowledgePoint: 'KP-A', limit: 10 })
  assert.equal(sel.selected.length, 1)
  assert.equal(sel.selected[0]?.id, 'b1')
  assert.equal(sel.totalAvailable, 1)
})

test('flattenTaxonomy: 覆盖全部科目且命名含连字符', () => {
  const refs = flattenTaxonomy()
  const subjects = new Set(TAXONOMY.map(s => s.subject))
  for (const subject of subjects) assert.ok(refs.some(r => r.subject === subject), 'missing subject ' + subject)
  assert.ok(refs.length >= 50)
  assert.ok(refs.some(r => r.knowledgePoint === '图形推理-数量规律'))
  assert.ok(refs.some(r => r.knowledgePoint === '法律'))
})

test('renderTaxonomy: 非空且含科目', () => {
  const text = renderTaxonomy()
  assert.ok(text.includes('行测-判断推理'))
  assert.ok(text.includes('申论'))
})

test('searchKnowledge: 按科目/考点/类型过滤', () => {
  const entries = [
    k('k1', '行测-判断推理', '图形推理-数量规律', 't1', 'c1'),
    k('k2', '行测-资料分析', '增长-增长率', 't2', 'c2'),
    k('k3', '行测-判断推理', '逻辑判断-翻译推理', 't3', 'c3', '讲义'),
  ]
  assert.equal(searchKnowledge(entries, { subject: '行测-判断推理' }).length, 2)
  assert.equal(searchKnowledge(entries, { knowledgePoint: '图形推理' }).length, 1)
  assert.equal(searchKnowledge(entries, { kind: '讲义' }).length, 1)
})

test('searchKnowledge: 关键词加权排序（标题优先）', () => {
  const entries = [
    k('k1', 'S', '', '增长率公式', '某内容'),
    k('k2', 'S', '', '无关标题', '这里提到增长率'),
  ]
  const r = searchKnowledge(entries, { keyword: '增长率' })
  assert.equal(r.length, 2)
  assert.equal(r[0]?.id, 'k1')
})

test('searchKnowledge: 无命中关键词返回空', () => {
  const entries = [k('k1', 'S', '', '标题', '内容')]
  assert.equal(searchKnowledge(entries, { keyword: '不存在' }).length, 0)
})
