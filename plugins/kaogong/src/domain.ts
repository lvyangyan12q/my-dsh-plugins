/**
 * Durable domain specs for the kaogong plugin: the wrong-answer notebook, the
 * study plan/progress, and the question bank. The zod record schemas live in
 * `schemas.ts` (pure, testable); this module binds them to storageDomain.
 * @module kaogong/domain
 */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { createHash } from 'node:crypto'
import type { DomainGlobalSpec } from '@deepseek-ai/dsh-storage-domain'
import { reviewRecord } from './error-reviews.ts'
import type { ReviewRecord } from './error-reviews.ts'
import { TAXONOMY } from './taxonomy.ts'
import { lessonRecord, lessonSelection } from './lesson-schema.ts'
import type { Lesson, LessonSelection } from './lesson-schema.ts'
import { questionRecord, planConfig, dayPlan, bankQuestion, knowledgeEntry, practiceRound } from './schemas.ts'
import type { PracticeRound } from './schemas.ts'
import {studyPlanDomain} from './study-plan.ts'
import type { QuestionRecord, PlanConfig, DayPlanRecord, BankQuestionRecord, KnowledgeEntryRecord } from './schemas.ts'

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
const progressGlobal: DomainGlobalSpec<PlanConfig> = {
  schema: planConfig,
  initial: { examDate: '2027-03-01', dailyModules: 2, subjects: defaultSubjects() },
}
export const progressDomainSpec = defineDomain({
  name: 'kaogong_progress',
  version: 1,
  global: progressGlobal,
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

/** Additive default-instance practice history; existing domains keep their versions. */
export const practiceDomainSpec = defineDomain({
  name: 'kaogong_practice', version: 1,
  tables: { rounds: domainTable<string, PracticeRound>(practiceRound) },
})

/** Additive classroom aggregates for the existing default instance; legacy domains are untouched. */
const lessonGlobal: DomainGlobalSpec<LessonSelection> = {
  schema: lessonSelection, initial: { instanceId: 'default', activeLessonId: null },
}
export const lessonDomainSpec = defineDomain({
  name: 'kaogong_lessons', version: 1,
  global: lessonGlobal,
  tables: { lessons: domainTable<string, Lesson>(lessonRecord) },
})

/** Legacy names are metadata for explicit adoption; opening them is not a read-only inspection. */
export const legacyDomainSpecs = Object.freeze({
  notebook: notebookDomainSpec, progress: progressDomainSpec, bank: bankDomainSpec,
  knowledge: knowledgeDomainSpec, practice: practiceDomainSpec, lessons: lessonDomainSpec,
})

/** Only explicit platform instance identities enter the new namespace; never alias legacy default. */
export function instanceDomainSpecs(instanceId: string) {
  if (typeof instanceId !== 'string' || !instanceId.trim() || instanceId !== instanceId.trim()
    || instanceId.length > 200 || instanceId === 'default') throw new Error('需要明确的新实例身份；旧 default 只能经预览接管')
  const prefix = 'kaogong_i_' + createHash('sha256').update(instanceId).digest('hex') + '_'
  return {
    plan: defineDomain({...studyPlanDomain,name:prefix+'plan'}),
    reviews: defineDomain({name:prefix+'reviews',version:1,tables:{reviews:domainTable<string,ReviewRecord>(reviewRecord)}}),
    notebook: defineDomain({ ...notebookDomainSpec, name: prefix + 'notebook' }),
    progress: defineDomain({ ...progressDomainSpec, name: prefix + 'progress' }),
    bank: defineDomain({ ...bankDomainSpec, name: prefix + 'bank' }),
    knowledge: defineDomain({ ...knowledgeDomainSpec, name: prefix + 'knowledge' }),
    practice: defineDomain({ ...practiceDomainSpec, name: prefix + 'practice' }),
    lessons: defineDomain({
      ...lessonDomainSpec, name: prefix + 'lessons',
      global: { schema: lessonSelection.refine(row => row.instanceId === instanceId, 'foreign lesson selection'),
        initial: { instanceId, activeLessonId: null } },
      tables: { lessons: domainTable<string, Lesson>(lessonRecord.refine(row => row.instanceId === instanceId, 'foreign lesson record')) },
    }),
  }
}
