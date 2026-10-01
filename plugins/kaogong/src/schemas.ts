/**
 * Pure zod record schemas for the kaogong domains. No DSH runtime deps —
 * only zod — so they can be unit-tested standalone. `domain.ts` derives the
 * storageDomain specs from these; the zod type is the single source of truth.
 * @module kaogong/schemas
 */

import { z } from 'zod'
import { KNOWLEDGE_KINDS } from './types.ts'

/** One stored question record (the question id is the table key, not a field). */
export const questionRecord = z.object({
  subject: z.string(),
  knowledgePoint: z.string(),
  questionType: z.string(),
  stem: z.string(),
  options: z.array(z.string()),
  correctAnswer: z.string(),
  userAnswer: z.string(),
  result: z.enum(['correct', 'wrong', 'skipped']),
  errorReason: z.string(),
  notes: z.string(),
  source: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  practiceRoundId: z.string().optional(),
  practiceSequence: z.number().int().optional(),
  practiceRevision: z.number().int().optional(),
})

/** One stored question record, inferred from {@link questionRecord}. */
export type QuestionRecord = z.infer<typeof questionRecord>

/** Plan configuration stored as the progress domain's global singleton. */
export const planConfig = z.object({
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dailyModules: z.number().int().min(1),
  subjects: z.array(z.object({
    name: z.string(),
    weight: z.number().int().min(1),
  })),
})

/** One plan configuration, inferred from {@link planConfig}. */
export type PlanConfig = z.infer<typeof planConfig>

/** One scheduled item on a day. */
export const dayItem = z.object({
  subject: z.string(),
  kind: z.enum(['learn', 'review', 'practice', 'mock']),
  title: z.string(),
  done: z.boolean(),
})

/** One scheduled day. */
export const dayPlan = z.object({
  date: z.string(),
  phase: z.enum(['foundation', 'reinforce', 'sprint']),
  items: z.array(dayItem),
})

/** One scheduled day, inferred from {@link dayPlan}. */
export type DayPlanRecord = z.infer<typeof dayPlan>

/** One stored bank question record (the id is the table key, not a field). */
export const bankQuestion = z.object({
  subject: z.string(),
  knowledgePoint: z.string(),
  questionType: z.string(),
  stem: z.string(),
  options: z.array(z.string()),
  correctAnswer: z.string(),
  explanation: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  source: z.string(),
  origin: z.enum(['web', 'local']),
  reviewStatus: z.enum(['pending', 'approved', 'rejected']),
  reviewNotes: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  reviewedAt: z.string(),
})

/** One stored bank question record, inferred from {@link bankQuestion}. */
export type BankQuestionRecord = z.infer<typeof bankQuestion>

/** One stored knowledge entry record (the id is the table key, not a field). */
export const knowledgeEntry = z.object({
  subject: z.string(),
  knowledgePoint: z.string(),
  title: z.string(),
  content: z.string(),
  kind: z.enum(KNOWLEDGE_KINDS),
  source: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** One stored knowledge entry record, inferred from {@link knowledgeEntry}. */
export type KnowledgeEntryRecord = z.infer<typeof knowledgeEntry>

/** Issued snapshots and immutable scores stay in one durable record. */
export const practiceRound = z.object({
  version: z.literal(1),
  context: z.object({ subject: z.string(), title: z.string(), knowledgePoint: z.string().optional(), limit: z.literal(10), planIndex: z.number().int().nonnegative().optional() }),
  questions: z.array(bankQuestion.extend({ id: z.string() })).max(10),
  seenIds: z.array(z.string()),
  reason: z.string(), totalAvailable: z.number().int(), cycled: z.boolean(), createdAt: z.string(),
  score: z.object({ answers: z.array(z.object({ id: z.string(), answer: z.string() })), sequence: z.number().int(), submittedAt: z.string() }).optional(),
  reflections: z.array(z.object({ id: z.string(), errorReason: z.string(), notes: z.string().optional(), savedAt: z.string().optional(), notesRevision: z.number().int().optional() })),
  revision: z.number().int().nonnegative(), projectedRevision: z.number().int().nonnegative(), changedAt: z.string(),
  review: z.enum(['ready', 'sending', 'sent']),
}).refine(round => new Set(round.questions.map(row => row.id)).size === round.questions.length && round.projectedRevision <= round.revision &&
  (round.score ? round.score.answers.length === round.questions.length && round.score.answers.every((row, index) => row.id === round.questions[index]?.id) : round.review === 'ready'),
  'Invalid issued round membership or state')
/** Version-one durable round. */
export type PracticeRound = z.infer<typeof practiceRound>
