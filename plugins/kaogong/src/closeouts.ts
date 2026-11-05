import { z } from 'zod'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { KaogongInstanceState } from './instance-state.ts'
import { PracticeError } from './practice-rounds.ts'

export const closeoutInput = z.object({
  operationId: z.string().uuid(), lessonId: z.string().uuid(),
  notes: z.string().trim().min(1).max(2000), confirmed: z.literal(true),
  joinRecall: z.boolean(), roundId: z.string().uuid().optional(),
}).strict()
export const closeoutRecord = z.object({
  input: closeoutInput, status: z.enum(['pending', 'complete']),
  lessonSaved: z.boolean(), planSaved: z.boolean(), recallSaved: z.boolean(),
  error: z.string().optional(), selectedRoundId: z.string().uuid().optional(),
})
export type CloseoutRecord = z.infer<typeof closeoutRecord>
type State = Omit<KaogongInstanceState, 'closeouts'>

/** One owner serializes consent receipts; real domain effects remain independently durable. */
export class Closeouts {
  private tail: Promise<unknown> = Promise.resolve()
  constructor(private table: KvTable<string, CloseoutRecord>) {}
  async preview(state: State, lessonId: string) {
    const value = await state.lessons.read(lessonId)
    const operation = [...this.table.entries()].map(([, row]) => row).find(row => row.input.lessonId === lessonId)
    const request = value.lesson.request
    const candidates = [...state.rounds.entries()].filter(([, round]) =>
      !!round.score && !!request.taskId && round.context.taskId === request.taskId &&
      round.context.planRevision === request.planRevision && round.context.subject === request.subject &&
      round.createdAt >= value.lesson.createdAt &&
      (!request.knowledgePointId || round.context.knowledgePointId === request.knowledgePointId)
    ).map(([roundId, round]) => ({ roundId, title: round.context.title ?? request.objective, submittedAt: round.score!.submittedAt }))
    const detailed = await Promise.all(candidates.map(async candidate => {
      const scored = await state.practice.readCompleted(candidate.roundId)
      const results = scored!.round.result!.results
      return { ...candidate, answered: results.filter(row=>!!row.userAnswer.trim()).length,
        unanswered: results.filter(row=>!row.userAnswer.trim()).length,
        missingReflections: request.requireReflections ? results.filter(row=>!row.correct&&!scored!.round.reflections.some(reflection=>reflection.id===row.id&&reflection.errorReason)).length : 0 }
    }))
    return { ...value, candidates: detailed, operation: operation ?? null }
  }
  execute(state: State, raw: unknown) {
    const input = closeoutInput.parse(raw)
    const work = this.tail.then(async () => {
      let row = this.table.get(input.operationId)
      if (row && JSON.stringify(row.input) !== JSON.stringify(input)) throw new PracticeError('同一收尾操作的确认内容冲突', 409)
      if (!row) {
        const preview = await this.preview(state, input.lessonId)
        if (preview.operation) throw new PracticeError('已有收尾操作，请恢复原操作', 409)
        if (input.roundId && !preview.candidates.some(candidate => candidate.roundId === input.roundId)) throw new PracticeError('作答不属于本次任务', 409)
        if (!input.roundId && preview.candidates.length > 1 && !preview.lesson.roundIds.length) throw new PracticeError('请选择本次完成所依据的练习', 409)
        row = { input, selectedRoundId: input.roundId ?? (preview.candidates.length === 1 ? preview.candidates[0].roundId : undefined), status: 'pending', lessonSaved: false, planSaved: false, recallSaved: false }
        await this.table.put(input.operationId, row)
      }
      try {
        let value = await state.lessons.read(input.lessonId)
        if (!value.lesson.completion) {
          await state.lessons.saveSummary(input.lessonId, input.notes)
          const roundId = row.selectedRoundId
          if (roundId) await state.lessons.link(input.lessonId, roundId)
          value = await state.lessons.confirm(input.lessonId, true)
        } else if ((value.lesson.completion.summary ?? value.lesson.notes) !== input.notes) {
          throw new PracticeError('已保存的完成总结与本次确认不一致', 409)
        }
        row = { ...row, lessonSaved: true }
        await this.table.put(input.operationId, row)
        const taskId = value.lesson.request.taskId
        if (taskId) {
          const current = state.plan.read(), task = current.tasks.find(task => task.id === taskId)
          if (!task) throw new PracticeError('原计划任务不可用', 409)
          if (task.subject !== value.lesson.request.subject || task.startedFromRevision !== value.lesson.request.planRevision) throw new PracticeError('原任务身份已变化',409)
          const evidence = z.object({summary:z.string(),proof:z.unknown()}).safeParse(task.evidence)
          const proof = evidence.success ? z.object({roundId:z.string().optional()}).safeParse(evidence.data.proof) : null
          if (task.status === 'completed' && (!evidence.success || evidence.data.summary !== input.notes || (row.selectedRoundId && (!proof?.success || proof.data.roundId !== row.selectedRoundId)))) throw new PracticeError('已完成计划的依据不同，不能冒充本次完成',409)
          if (task.status !== 'completed') {
            const saved = await state.plan.saveSummary(taskId, current.revision, input.notes)
            await state.plan.complete(taskId, saved.revision, true, { roundId: row.selectedRoundId ?? value.lesson.completion?.proofs[0]?.roundId })
          }
        }
        row = { ...row, planSaved: true }
        await this.table.put(input.operationId, row)
        if (input.joinRecall) {
          const pointId = value.lesson.request.knowledgePointId
          if (!pointId) throw new PracticeError('课堂没有明确知识点，不能自动加入回忆', 409)
          await state.recalls.enroll(pointId, true)
        }
        row = { ...row, recallSaved: true, status: 'complete', error: undefined }
        await this.table.put(input.operationId, row)
      } catch (error) {
        row = { ...row, error: error instanceof Error ? error.message : '保存失败，请重试剩余步骤' }
        await this.table.put(input.operationId, row)
      }
      return { ...await state.lessons.read(input.lessonId), operation: row }
    })
    this.tail = work.catch(() => {})
    return work
  }
  async close() { await this.tail }
}
