/**
 * Runnable demo + smoke check for the pure core (no DeepSeek Harness runtime
 * needed). Run with a recent Node (>=23.6, type stripping enabled):
 *
 *   node scripts/demo.ts
 *
 * It loads data/sample-questions.json, prints the problem-point analysis and
 * study summary, then generates a backward study schedule to 2027-03.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { analyzeQuestions, summarizeQuestions } from '../src/analyze.ts'
import { generatePlan } from '../src/schedule.ts'
import { selectPractice } from '../src/practice.ts'
import { searchKnowledge } from '../src/knowledge.ts'
import { flattenTaxonomy } from '../src/taxonomy.ts'
import type { Question, BankQuestion, KnowledgeEntry } from '../src/types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(join(here, '..', 'data', 'sample-questions.json'), 'utf8')
const data = JSON.parse(raw) as { questions: Question[] }

const analysis = analyzeQuestions(data.questions)
console.log('=== 归纳问题点（结构化，节选） ===')
console.log('共 ' + analysis.totalQuestions + ' 题：做对 ' + analysis.totalCorrect + '，做错 ' + analysis.totalWrong + '，跳过 ' + analysis.totalSkipped)
console.log('按科目：')
for (const s of analysis.bySubject) console.log('  ' + s.subject + ' 错 ' + s.wrongCount + '/' + s.totalCount)

const summary = summarizeQuestions(data.questions, { topN: 5 })
console.log('\n=== 总结问题（叙述） ===')
console.log(summary.narrative)

console.log('\n=== 倒排学习计划 ===')
const kps = flattenTaxonomy()
console.log('考点总数：' + kps.length)
const plan = generatePlan({
  examDate: '2027-03-01',
  dailyModules: 2,
  subjects: ['行测-判断推理', '行测-资料分析', '申论'].map(name => ({ name, weight: 1 })),
}, '2026-01-15')
console.log('总天数：' + plan.totalDays)
console.log('阶段：' + plan.phases.map(p => p.phase + '×' + p.days).join(' / '))
console.log('前 3 天计划：')
for (const day of plan.days.slice(0, 3)) {
  console.log('  ' + day.date + ' [' + day.phase + ']')
  for (const item of day.items) console.log('    - ' + item.title)
}

console.log('\n=== 专项训练（错题巩固 weak 模式） ===')
const bankRaw = readFileSync(join(here, '..', 'data', 'sample-bank.json'), 'utf8')
const bankData = JSON.parse(bankRaw) as { questions: BankQuestion[] }
const weak = selectPractice(bankData.questions, data.questions, { weak: true, limit: 3 })
console.log(weak.reason)
for (const q of weak.selected) console.log('  - ' + q.id + ' 【' + q.knowledgePoint + '】' + q.stem)

console.log('\n=== 专项训练（指定考点） ===')
const targeted = selectPractice(bankData.questions, data.questions, { knowledgePoint: '图形推理-数量规律', limit: 2 })
console.log(targeted.reason + '；抽 ' + targeted.selected.length + ' 题')
for (const q of targeted.selected) console.log('  - ' + q.id + ' 【' + q.knowledgePoint + '】' + q.stem)

console.log('\n=== 知识库检索 ===')
const knRaw = readFileSync(join(here, '..', 'data', 'sample-knowledge.json'), 'utf8')
const knData = JSON.parse(knRaw) as { entries: KnowledgeEntry[] }
const knResults = searchKnowledge(knData.entries, { keyword: '增长率' })
console.log('检索「增长率」命中 ' + knResults.length + ' 条：')
for (const entry of knResults) console.log('  - 《' + entry.title + '》【' + entry.subject + '】')
