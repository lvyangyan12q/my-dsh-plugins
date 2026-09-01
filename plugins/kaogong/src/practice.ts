/**
 * Pure targeted-practice selection. No runtime dependencies: it chooses bank
 * questions for one practice session, either by an explicit knowledge point,
 * by subject, or by the weakest knowledge points derived from the notebook
 * (错题巩固).
 * @module kaogong/practice
 */

import { analyzeQuestions } from './analyze.ts'
import type { Question, BankQuestion, Difficulty } from './types.ts'

/** Options controlling one practice selection. */
export interface PracticeOptions {
  /** 限定科目. */
  subject?: string
  /** 限定考点（专项训练）. */
  knowledgePoint?: string
  /** 为 true 时按错题本的薄弱考点抽题（错题巩固）. */
  weak?: boolean
  /** 难度过滤. */
  difficulty?: Difficulty
  /** 本轮优先排除的题目，用于连续练习避免重复。 */
  excludeIds?: readonly string[]
  /** 题目数量上限. */
  limit: number
}

/** One practice selection result. */
export interface PracticeSelection {
  /** 错题巩固模式下命中的目标考点. */
  targets: string[]
  /** 选出的题目. */
  selected: BankQuestion[]
  /** 当前筛选条件下的已审题目总量. */
  totalAvailable: number
  /** 为什么这样抽题的人话说明. */
  reason: string
}

/**
 * Select bank questions for a practice session.
 * @param bank - the full question bank.
 * @param notebook - the wrong-answer notebook (for weak-point targeting).
 * @param opts - selection controls.
 * @returns the selection.
 */
export function selectPractice(bank: BankQuestion[], notebook: Question[], opts: PracticeOptions): PracticeSelection {
  const limit = Math.max(1, opts.limit)
  const drawable = bank.filter(question => question.reviewStatus === 'approved')
  let targets: string[] = []
  let pool = drawable
  let reason = '从全部题库抽题'

  if (opts.knowledgePoint) {
    targets = [opts.knowledgePoint]
    pool = drawable.filter(q => q.knowledgePoint === opts.knowledgePoint)
    reason = '专项训练：' + opts.knowledgePoint
  } else if (opts.subject) {
    pool = drawable.filter(q => q.subject === opts.subject)
    reason = '按科目练习：' + opts.subject
  } else if (opts.weak) {
    const analysis = analyzeQuestions(notebook)
    targets = analysis.byKnowledgePoint
      .filter(kp => kp.wrongCount > 0)
      .slice(0, 3)
      .map(kp => kp.knowledgePoint)
    if (targets.length === 0) {
      pool = drawable
      reason = '暂无错题，从全部题库抽题'
    } else {
      pool = drawable.filter(q => targets.includes(q.knowledgePoint))
      reason = '错题巩固，目标考点：' + targets.join('、')
    }
  }

  if (opts.difficulty) {
    pool = pool.filter(q => q.difficulty === opts.difficulty)
  }

  if (opts.excludeIds && opts.excludeIds.length > 0) {
    const excluded = new Set(opts.excludeIds)
    pool = pool.filter(question => !excluded.has(question.id))
  }

  const shuffled = pool.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const current = shuffled[i]
    shuffled[i] = shuffled[j]!
    shuffled[j] = current!
  }
  return { targets, selected: shuffled.slice(0, limit), totalAvailable: pool.length, reason }
}
