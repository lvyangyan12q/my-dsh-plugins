/**
 * Pure analysis and summarization for the kaogong notebook. No runtime
 * dependencies: these functions turn an array of {@link Question} into
 * problem-point groupings (归纳问题点) and a study summary (总结问题).
 * @module kaogong/analyze
 */

import type { Question } from './types.ts'

/** One (reason, count) pair in a knowledge point's error breakdown. */
export interface ErrorReasonCount {
  reason: string
  count: number
}

/** Aggregated errors for one knowledge point. */
export interface KnowledgePointStat {
  knowledgePoint: string
  subject: string
  wrongCount: number
  totalCount: number
  errorRate: number
  /** 错因分布，按次数降序. */
  errorReasons: ErrorReasonCount[]
  sampleIds: string[]
}

/** Aggregated errors for one subject/module. */
export interface SubjectStat {
  subject: string
  wrongCount: number
  totalCount: number
  errorRate: number
}

/** Aggregated counts for one error reason. */
export interface ErrorReasonStat {
  reason: string
  count: number
  knowledgePoints: string[]
}

/** Structured problem-point analysis (归纳问题点). */
export interface AnalysisResult {
  totalQuestions: number
  totalCorrect: number
  totalWrong: number
  totalSkipped: number
  accuracyRate: number
  bySubject: SubjectStat[]
  byKnowledgePoint: KnowledgePointStat[]
  byErrorReason: ErrorReasonStat[]
}

/** One ranked weak point with a concrete suggestion. */
export interface WeakPoint {
  knowledgePoint: string
  subject: string
  wrongCount: number
  totalCount: number
  errorRate: number
  topReasons: string[]
  suggestion: string
}

/** The full study summary (总结问题). */
export interface SummaryResult {
  totalQuestions: number
  totalCorrect: number
  totalWrong: number
  totalSkipped: number
  accuracyRate: number
  weakPoints: WeakPoint[]
  errorReasonBreakdown: ErrorReasonStat[]
  suggestions: string[]
  narrative: string
}

/**
 * Group wrong answers by subject, knowledge point, and error reason.
 * Accuracy excludes skipped questions.
 * @param questions - the full notebook question list.
 * @returns the structured analysis.
 */
export function analyzeQuestions(questions: Question[]): AnalysisResult {
  let totalCorrect = 0
  let totalWrong = 0
  let totalSkipped = 0
  const subjectMap = new Map<string, { wrong: number; total: number }>()
  const kpMap = new Map<string, {
    knowledgePoint: string
    subject: string
    wrongCount: number
    totalCount: number
    reasons: Map<string, number>
    sampleIds: string[]
  }>()
  const reasonMap = new Map<string, { count: number; kps: Set<string> }>()

  for (const q of questions) {
    if (q.result === 'correct') totalCorrect++
    else if (q.result === 'wrong') totalWrong++
    else totalSkipped++

    const subject = subjectMap.get(q.subject) ?? { wrong: 0, total: 0 }
    subject.total++
    if (q.result === 'wrong') subject.wrong++
    subjectMap.set(q.subject, subject)

    const key = q.subject + '||' + q.knowledgePoint
    const kp = kpMap.get(key) ?? {
      knowledgePoint: q.knowledgePoint,
      subject: q.subject,
      wrongCount: 0,
      totalCount: 0,
      reasons: new Map<string, number>(),
      sampleIds: [],
    }
    kp.totalCount++
    if (q.result === 'wrong') {
      kp.wrongCount++
      const reason = (q.errorReason ?? '').trim() || '未标注'
      kp.reasons.set(reason, (kp.reasons.get(reason) ?? 0) + 1)
      if (kp.sampleIds.length < 3) kp.sampleIds.push(q.id)
    }
    kpMap.set(key, kp)

    if (q.result === 'wrong') {
      const reason = (q.errorReason ?? '').trim() || '未标注'
      const entry = reasonMap.get(reason) ?? { count: 0, kps: new Set<string>() }
      entry.count++
      entry.kps.add(q.knowledgePoint)
      reasonMap.set(reason, entry)
    }
  }

  const denominator = totalCorrect + totalWrong
  const accuracyRate = denominator === 0 ? 0 : totalCorrect / denominator

  const bySubject = [...subjectMap.entries()]
    .map(([subject, v]) => ({
      subject,
      wrongCount: v.wrong,
      totalCount: v.total,
      errorRate: v.total === 0 ? 0 : v.wrong / v.total,
    }))
    .sort((a, b) => b.wrongCount - a.wrongCount)

  const byKnowledgePoint = [...kpMap.values()]
    .map(kp => ({
      knowledgePoint: kp.knowledgePoint,
      subject: kp.subject,
      wrongCount: kp.wrongCount,
      totalCount: kp.totalCount,
      errorRate: kp.totalCount === 0 ? 0 : kp.wrongCount / kp.totalCount,
      errorReasons: [...kp.reasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      sampleIds: kp.sampleIds,
    }))
    .sort((a, b) => b.wrongCount - a.wrongCount || b.errorRate - a.errorRate)

  const byErrorReason = [...reasonMap.entries()]
    .map(([reason, v]) => ({ reason, count: v.count, knowledgePoints: [...v.kps] }))
    .sort((a, b) => b.count - a.count)

  return {
    totalQuestions: questions.length,
    totalCorrect,
    totalWrong,
    totalSkipped,
    accuracyRate,
    bySubject,
    byKnowledgePoint,
    byErrorReason,
  }
}

/** Concrete study suggestion for one weak knowledge point. */
function suggestionFor(knowledgePoint: string, subject: string): string {
  const haystack = knowledgePoint + ' ' + subject
  if (haystack.includes('图形推理')) return '回归图形规律体系，按位置/样式/属性/数量四类逐一总结，重做错题并标注规律'
  if (haystack.includes('资料分析')) return '强化公式记忆（增长率/比重/平均数），限时练习截位直除与特殊值法'
  if (haystack.includes('数量关系')) return '分题型专项刷题，优先攻克工程/行程/利润等高频题型，整理常用公式'
  if (haystack.includes('言语理解') || haystack.includes('片段阅读') || haystack.includes('逻辑填空')) return '重做错题，梳理主旨与细节、意图与态度的区分，积累高频成语'
  if (haystack.includes('逻辑判断') || haystack.includes('类比推理') || haystack.includes('定义判断')) return '整理翻译推理规则与常见逻辑谬误，练习加强/削弱题型的论证结构分析'
  if (haystack.includes('常识判断')) return '利用碎片时间积累时政与法律常识，建立错题卡片定期复习'
  if (haystack.includes('申论')) return '对照参考答案逐条提炼要点，练习概括归纳与公文格式'
  return '重做错题并记录错因，7 天后再次复习巩固'
}

/** Concrete remediation for one error reason. */
function suggestionForReason(reason: string): string {
  switch (reason) {
    case '知识点不会': return '回到教材/课程补齐该考点的基础知识与公式'
    case '概念混淆': return '制作易混概念对比表，明确区分条件与结论'
    case '审题不清': return '放慢读题，圈画题干关键词与限定条件'
    case '计算/分析失误': return '规范草稿与计算步骤，限时做计算练习'
    case '粗心大意': return '答完后快速复查，标注常见陷阱'
    case '方法不当/技巧缺失': return '学习该题型的标准解法与速算技巧'
    case '时间不够': return '限时模考训练节奏，学会先易后难与取舍'
    case '记忆模糊': return '使用间隔重复法，制作记忆卡片定期复习'
    default: return '针对该错因专项训练，持续记录'
  }
}

/** Format a 0..1 rate as a percentage string. */
function pct(rate: number): string {
  return Math.round(rate * 1000) / 10 + '%'
}

/**
 * Produce a ranked study summary from the full question list.
 * @param questions - the full notebook question list.
 * @param opts - `topN` limits the weak-point list.
 * @returns the structured summary with a narrative text.
 */
export function summarizeQuestions(questions: Question[], opts: { topN: number }): SummaryResult {
  const analysis = analyzeQuestions(questions)
  const topN = Math.max(1, opts.topN)
  const weakPoints: WeakPoint[] = analysis.byKnowledgePoint
    .filter(kp => kp.wrongCount > 0)
    .slice(0, topN)
    .map(kp => ({
      knowledgePoint: kp.knowledgePoint,
      subject: kp.subject,
      wrongCount: kp.wrongCount,
      totalCount: kp.totalCount,
      errorRate: kp.errorRate,
      topReasons: kp.errorReasons.map(({ reason }) => reason),
      suggestion: suggestionFor(kp.knowledgePoint, kp.subject),
    }))

  const suggestions = weakPoints.map(wp => '【' + wp.subject + '】' + wp.knowledgePoint + '：' + wp.suggestion)
  for (const reason of analysis.byErrorReason) {
    suggestions.push('错因「' + reason.reason + '」：' + suggestionForReason(reason.reason))
  }

  return {
    totalQuestions: analysis.totalQuestions,
    totalCorrect: analysis.totalCorrect,
    totalWrong: analysis.totalWrong,
    totalSkipped: analysis.totalSkipped,
    accuracyRate: analysis.accuracyRate,
    weakPoints,
    errorReasonBreakdown: analysis.byErrorReason,
    suggestions,
    narrative: buildNarrative(analysis, weakPoints),
  }
}

/** Build the human-readable narrative summary text. */
function buildNarrative(analysis: AnalysisResult, weakPoints: WeakPoint[]): string {
  const lines: string[] = []
  lines.push('## 错题总结')
  lines.push('')
  lines.push('### 总体情况')
  lines.push('- 共收录题目 ' + analysis.totalQuestions + ' 道（做对 ' + analysis.totalCorrect + '，做错 ' + analysis.totalWrong + '，跳过 ' + analysis.totalSkipped + '）')
  lines.push('- 正确率（不含跳过）：' + pct(analysis.accuracyRate))
  lines.push('')
  lines.push('### 薄弱考点 Top ' + weakPoints.length)
  if (weakPoints.length === 0) {
    lines.push('暂无错题记录，先通过 kaogong_record_question 录入题目。')
  } else {
    weakPoints.forEach((wp, i) => {
      lines.push((i + 1) + '. 【' + wp.subject + '】' + wp.knowledgePoint + '：错 ' + wp.wrongCount + '/' + wp.totalCount + '，错误率 ' + pct(wp.errorRate))
      lines.push('   - 主要错因：' + (wp.topReasons.length > 0 ? wp.topReasons.join('、') : '未标注'))
      lines.push('   - 建议：' + wp.suggestion)
    })
  }
  lines.push('')
  lines.push('### 错因分布')
  if (analysis.byErrorReason.length === 0) {
    lines.push('暂无错因记录。')
  } else {
    for (const r of analysis.byErrorReason) {
      lines.push('- ' + r.reason + '：' + r.count + ' 次')
    }
  }
  return lines.join('\n')
}
