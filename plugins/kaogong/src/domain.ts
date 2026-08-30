/**
 * Durable domain specs for the kaogong plugin: the wrong-answer notebook, the
 * study plan/progress, and the question bank. The zod record schemas live in
 * `schemas.ts` (pure, testable); this module binds them to storageDomain.
 * @module kaogong/domain
 */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { TAXONOMY } from './taxonomy.ts'
import { questionRecord, planConfig, dayPlan, bankQuestion, knowledgeEntry } from './schemas.ts'
import type { QuestionRecord, DayPlanRecord, BankQuestionRecord, KnowledgeEntryRecord } from './schemas.ts'

export { questionRecord, planConfig, dayItem, dayPlan, bankQuestion, knowledgeEntry } from './schemas.ts'
export type { QuestionRecord, PlanConfig, DayPlanRecord, BankQuestionRecord, KnowledgeEntryRecord } from './schemas.ts'

/** The wrong-answer notebook domain: one `questions` table keyed by id. */
export const notebookDomainSpec = defineDomain({
  name: 'kaogong_notebook',
  version: 1,
  tables: { questions: domainTable<string, QuestionRecord>(questionRecord) },
})

/** Default subjects: every taxonomy module, equal weight. */
export function defaultSubjects(): { name: string; weight: number }[] {
  return TAXONOMY.map(subject => ({ name: subject.subject, weight: 1 }))
}

/** The study plan/progress domain: a global plan config + a `days` table keyed by date. */
export const progressDomainSpec = defineDomain({
  name: 'kaogong_progress',
  version: 1,
  global: {
    schema: planConfig,
    initial: { examDate: '2027-03-01', dailyModules: 2, subjects: defaultSubjects() },
  },
  tables: { days: domainTable<string, DayPlanRecord>(dayPlan) },
})

/** The question-bank domain: one `questions` table keyed by id, for targeted practice. */
export const bankDomainSpec = defineDomain({
  name: 'kaogong_bank',
  version: 2,
  tables: { questions: domainTable<string, BankQuestionRecord>(bankQuestion) },
})

/** The knowledge-base domain: one `entries` table keyed by id, for study-material retrieval. */
export const knowledgeDomainSpec = defineDomain({
  name: 'kaogong_knowledge',
  version: 1,
  tables: { entries: domainTable<string, KnowledgeEntryRecord>(knowledgeEntry) },
})
