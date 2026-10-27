import { z } from 'zod'

const text = z.string().trim().min(1).max(500)
const instanceId = z.string().min(1).max(200).refine(value => value === value.trim())
export const lessonSelection = z.object({ instanceId, activeLessonId: z.string().uuid().nullable() })
export type LessonSelection = z.infer<typeof lessonSelection>
export const lessonCreate = z.object({
  lessonId: z.string().uuid(), subject: text, objective: text,
  knowledgePoint: text.optional(), materialIds: z.array(text).max(8),
  requireReflections: z.boolean(), requirePractice:z.boolean().optional(), taskId:z.string().uuid().optional(), planRevision:z.number().int().nonnegative().optional(), legacyNoteId: text.optional(),
}).strict()
export const lessonCommand = z.object({ lessonId: z.string().uuid() }).strict()
export const lessonLink = lessonCommand.extend({ roundId: z.string().uuid() }).strict()
export const lessonSummaryInput = lessonCommand.extend({ notes: z.string().trim().max(2000) }).strict()
export const lessonConfirm = lessonCommand.extend({ confirmed: z.literal(true) }).strict()

const role = z.object({ appId: z.literal('kaogong'), instanceId, roleId: z.literal('teacher'), subject: text })
const proof = z.object({ roundId: z.string().uuid(), total: z.number().int().positive(), correct: z.number().int().nonnegative(),
  questionIds: z.array(text).min(1).max(10), reflectedIds: z.array(text).max(10) })
/** Additive aggregate; no original material/history or manual plan flags are copied. */
export const lessonRecord = z.object({
  version: z.literal(1), instanceId, request: lessonCreate,
  objectiveId: z.string(), homeworkId: z.string(), roleKey: role,
  binding: z.object({ sessionId: text, presetId: text }).nullable(),
  materials: z.array(z.object({ id: text, title: z.string(), source: z.string(), updatedAt: z.string() })).max(8),
  legacyNote: z.object({ id: text, updatedAt: z.string() }).optional(),
  roundIds: z.array(z.string().uuid()).max(20), notes: z.string().max(2000),
  completion: z.object({ confirmedAt: z.string(), summary:z.string().optional(), proofs: z.array(proof).max(20) }).nullable(),
  createdAt: z.string(), updatedAt: z.string(), revision: z.number().int().nonnegative(),
}).refine(row => row.instanceId === row.roleKey.instanceId && new Set(row.roundIds).size === row.roundIds.length && row.request.subject === row.roleKey.subject &&
  (!row.completion || (row.request.requirePractice===false||row.completion.proofs.length>0) && row.completion.proofs.length === row.roundIds.length && row.completion.proofs.every((p, i) => p.roundId === row.roundIds[i] && p.correct <= p.total &&
    p.total === p.questionIds.length && new Set(p.questionIds).size === p.total && new Set(p.reflectedIds).size === p.reflectedIds.length && p.reflectedIds.every(id => p.questionIds.includes(id)))), 'Invalid lesson evidence')
export type Lesson = z.infer<typeof lessonRecord>
export type LessonCreate = z.infer<typeof lessonCreate>
export type LessonEvidence = { roundId: string; total: number; correct: number; questionIds: string[]; reflectedIds: string[];
  answered: boolean; reflectionsComplete: boolean; projection: 'complete' | 'pending'; review: 'ready' | 'sending' | 'sent' }
export type LessonView = { lesson: Lesson; evidence: LessonEvidence[]; canConfirm: boolean; summary: string }
