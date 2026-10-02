/**
 * Pure backward (倒排) study-plan scheduling. No runtime dependencies: it
 * turns a plan config + an exam date into a day-by-day schedule from today
 * to the exam, split into foundation / reinforce / sprint phases.
 * @module kaogong/schedule
 */

import { flattenTaxonomy } from './taxonomy.ts'
import type { KnowledgePointRef } from './taxonomy.ts'

export type PhaseKind = 'foundation' | 'reinforce' | 'sprint'
export type ItemKind = 'learn' | 'review' | 'practice' | 'mock'

/** One subject with its scheduling weight. */
export interface SubjectPlan {
  name: string
  weight: number
}

/** Plan configuration. */
export interface PlanConfig {
  /** 考试日期，YYYY-MM-DD. */
  examDate: string
  /** 每天学习模块数（一个模块 ≈ 一个知识点/一次练习）. */
  dailyModules: number
  /** 备考科目与权重. */
  subjects: SubjectPlan[]
}

/** One scheduled item on a day. */
export interface DayItem {
  subject: string
  kind: ItemKind
  title: string
  done: boolean
}

/** One scheduled day. */
export interface DayPlan {
  date: string
  phase: PhaseKind
  items: DayItem[]
}

/** Phase size summary. */
export interface PhaseInfo {
  phase: PhaseKind
  days: number
}

/** The generated plan. */
export interface GeneratedPlan {
  today: string
  examDate: string
  totalDays: number
  phases: PhaseInfo[]
  days: DayPlan[]
}

const PHASE_RATIOS: Record<PhaseKind, number> = { foundation: 0.6, reinforce: 0.25, sprint: 0.15 }

/** Return whether a value is a real calendar date in YYYY-MM-DD form. */
export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

/** Days since the Unix epoch for a YYYY-MM-DD date (UTC). */
function epochDay(iso: string): number {
  const parts = iso.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

/** Inclusive day count from today through the day before the exam. */
export function daysToExam(todayIso: string, examIso: string): number {
  if (!isValidIsoDate(todayIso) || !isValidIsoDate(examIso)) throw new Error('日期必须为有效的 YYYY-MM-DD')
  return epochDay(examIso) - epochDay(todayIso)
}

/** Add n days to a YYYY-MM-DD date and return the new YYYY-MM-DD. */
export function addDays(iso: string, n: number): string {
  if (!isValidIsoDate(iso)) throw new Error('日期必须为有效的 YYYY-MM-DD')
  const parts = iso.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Weighted round-robin ordering of each subject's knowledge points. */
function buildQueue(subjects: SubjectPlan[], bySubject: Map<string, KnowledgePointRef[]>): KnowledgePointRef[] {
  const lanes = subjects.map(s => ({ kps: bySubject.get(s.name) ?? [], weight: Math.max(1, Math.round(s.weight)), idx: 0 }))
  const queue: KnowledgePointRef[] = []
  let advanced = true
  while (advanced) {
    advanced = false
    for (const lane of lanes) {
      for (let w = 0; w < lane.weight; w++) {
        const kp = lane.kps[lane.idx]
        if (kp === undefined) break
        queue.push(kp)
        lane.idx++
        advanced = true
      }
    }
  }
  return queue
}

/**
 * Generate a backward study schedule.
 * @param config - plan configuration.
 * @param today - today's date, YYYY-MM-DD.
 * @returns the generated plan.
 */
export function generatePlan(config: PlanConfig, today: string): GeneratedPlan {
  if (config.subjects.length === 0) throw new Error('至少需要配置一个考试科目')
  const totalDays = daysToExam(today, config.examDate)
  if (totalDays <= 0) throw new Error('考试日期必须晚于今天')

  let foundationDays = 0
  let reinforceDays = 0
  let sprintDays = totalDays
  if (totalDays >= 3) {
    foundationDays = Math.max(1, Math.floor(totalDays * PHASE_RATIOS.foundation))
    reinforceDays = Math.max(1, Math.floor(totalDays * PHASE_RATIOS.reinforce))
    if (foundationDays + reinforceDays >= totalDays) {
      foundationDays = Math.max(1, totalDays - 2)
      reinforceDays = 1
    }
    sprintDays = totalDays - foundationDays - reinforceDays
  }

  const bySubject = new Map<string, KnowledgePointRef[]>()
  for (const kp of flattenTaxonomy()) {
    const list = bySubject.get(kp.subject)
    if (list === undefined) bySubject.set(kp.subject, [kp])
    else list.push(kp)
  }
  const queue = buildQueue(config.subjects, bySubject)
  const subjectNames = config.subjects.map(s => s.name)
  const dailyModules = Math.max(1, config.dailyModules)

  const days: DayPlan[] = []
  let cursor = today
  let qi = 0

  for (let d = 0; d < foundationDays; d++) {
    const items: DayItem[] = []
    for (let m = 0; m < dailyModules; m++) {
      const kp = queue[qi % queue.length]
      if (kp !== undefined) {
        items.push({ subject: kp.subject, kind: 'learn', title: '学习 ' + kp.subject + '：' + kp.knowledgePoint, done: false })
        qi++
      } else {
        items.push({ subject: subjectNames[m % subjectNames.length] ?? '全部', kind: 'learn', title: '自由学习/查漏补缺', done: false })
      }
    }
    days.push({ date: cursor, phase: 'foundation', items })
    cursor = addDays(cursor, 1)
  }

  for (let d = 0; d < reinforceDays; d++) {
    const items: DayItem[] = []
    for (let m = 0; m < dailyModules; m++) {
      const subject = subjectNames[m % subjectNames.length] ?? '全部'
      const kind: ItemKind = m % 2 === 0 ? 'review' : 'practice'
      items.push({ subject, kind, title: (kind === 'review' ? '复习 ' : '专项练习 ') + subject, done: false })
    }
    days.push({ date: cursor, phase: 'reinforce', items })
    cursor = addDays(cursor, 1)
  }

  for (let d = 0; d < sprintDays; d++) {
    const items: DayItem[] = []
    for (let m = 0; m < dailyModules; m++) {
      items.push(m === 0
        ? { subject: '全部', kind: 'mock', title: '全真模考（限时套卷）', done: false }
        : { subject: '全部', kind: 'practice', title: '错题巩固（按薄弱考点）', done: false })
    }
    days.push({ date: cursor, phase: 'sprint', items })
    cursor = addDays(cursor, 1)
  }

  return {
    today,
    examDate: config.examDate,
    totalDays,
    phases: [
      { phase: 'foundation', days: foundationDays },
      { phase: 'reinforce', days: reinforceDays },
      { phase: 'sprint', days: sprintDays },
    ],
    days,
  }
}
