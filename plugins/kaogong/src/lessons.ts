import type { KvTable, DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { lessonCreate } from './lesson-schema.ts'
import type { Lesson, LessonCreate, LessonView, LessonEvidence } from './lesson-schema.ts'
import type { KnowledgeEntryRecord } from './schemas.ts'
import type { PracticeRounds } from './practice-rounds.ts'
import { PracticeError } from './practice-rounds.ts'
import { TAXONOMY } from './taxonomy.ts'

type Binding = { phase: 'intent' | 'ready'; sessionId: string; presetId: string }
/** One default-instance lesson owner; accepted attempts are always resolved by the existing scorer. */
export class Lessons {
  private tail: Promise<unknown> = Promise.resolve()
  private closing = false
  constructor(private table: KvTable<string, Lesson>, private knowledge: KvTable<string, KnowledgeEntryRecord>,
    private practice: PracticeRounds, private binding: (key: Lesson['roleKey']) => Promise<Binding | null>,
    private selection: DomainGlobal<{ instanceId: 'default'; activeLessonId: string | null }>) {}
  private run<T>(command: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new PracticeError('课堂服务正在关闭', 503))
    const pending = this.tail.then(command); this.tail = pending.catch(() => {}); return pending
  }
  /** Stop accepting new commands and await every owned command before domain shutdown. */
  async close() { this.closing = true; await this.tail }
  private get(id: string) { const row = this.table.get(id); if (!row) throw new PracticeError('课堂不存在', 404); return row }
  private async put(id: string, row: Lesson) { await this.table.put(id, { ...row, revision: row.revision + 1, updatedAt: new Date().toISOString() }) }
  /** Learner-confirmed creation is idempotent by the supplied stable lesson ID. */
  create(input: LessonCreate): Promise<LessonView> { return this.run(async () => {
    const request = lessonCreate.parse(input)
    if (!TAXONOMY.some(row => row.subject === request.subject)) throw new PracticeError('不支持的科目')
    if (new Set(request.materialIds).size !== request.materialIds.length) throw new PracticeError('重复材料')
    const old = this.table.get(request.lessonId)
    if (old) {
      if (JSON.stringify(old.request) !== JSON.stringify(request)) throw new PracticeError('课堂 ID 的创建内容冲突', 409)
      await this.selection.set({ instanceId: 'default', activeLessonId: request.lessonId })
      return this.view(old)
    }
    const materials = request.materialIds.map(id => {
      const row = this.knowledge.get(id)
      if (!row || row.subject !== request.subject) throw new PracticeError('材料不存在或不属于本科目')
      return { id, title: row.title, source: row.source, updatedAt: row.updatedAt }
    })
    let legacyNote: Lesson['legacyNote']
    if (request.legacyNoteId) {
      const row = this.knowledge.get(request.legacyNoteId)
      if (!row || row.kind !== '笔记' || row.subject !== request.subject) throw new PracticeError('旧课堂笔记不存在或不属于本科目')
      legacyNote = { id: request.legacyNoteId, updatedAt: row.updatedAt }
    }
    const now = new Date().toISOString()
    const row: Lesson = { version: 1, instanceId: 'default', request, objectiveId: request.lessonId + ':objective', homeworkId: request.lessonId + ':practice',
      roleKey: { appId: 'kaogong', instanceId: 'default', roleId: 'teacher', subject: request.subject }, binding: null, materials,
      ...(legacyNote ? { legacyNote } : {}), roundIds: [], notes: '', completion: null, createdAt: now, updatedAt: now, revision: 0 }
    await this.table.put(request.lessonId, row)
    // The record precedes the navigation pointer. A failed pointer write can retry this same ID.
    await this.selection.set({ instanceId: 'default', activeLessonId: request.lessonId })
    return this.view(row)
  }) }
  read(id: string) { return this.run(() => this.view(this.get(id))) }
  current() { return this.run(async () => { const id = this.selection.get().activeLessonId; return id ? this.view(this.get(id)) : null }) }
  select(id: string) { return this.run(async () => {
    const value = await this.view(this.get(id))
    await this.selection.set({ instanceId: 'default', activeLessonId: id })
    return value
  }) }
  list() { return this.run(async () => [...this.table.entries()].map(([id, row]) => ({ id, subject: row.request.subject, objective: row.request.objective,
    completed: !!row.completion, updatedAt: row.updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) }
  /** Link only an actual fully submitted round; no supplied score is accepted. */
  link(id: string, roundId: string) { return this.run(async () => {
    const row = this.get(id)
    await this.evidence(row, roundId)
    if (!row.roundIds.includes(roundId)) {
      if (row.completion) throw new PracticeError('已完成课堂不能添加作答；请明确建立下一课', 409)
      if (row.roundIds.length >= 20) throw new PracticeError('本课作答轮次已满')
      await this.put(id, { ...row, roundIds: [...row.roundIds, roundId] })
    }
    return this.view(this.get(id))
  }) }
  saveSummary(id: string, notes: string) { return this.run(async () => {
    const row = this.get(id)
    if (row.notes !== notes) await this.put(id, { ...row, notes })
    return this.view(this.get(id))
  }) }
  /** Only the learner HTTP gesture exposes this operation, never an Agent completion tool. */
  confirm(id: string, confirmed: true) { return this.run(async () => {
    if (confirmed !== true) throw new PracticeError('需要学习者明确确认')
    const row = this.get(id)
    if (!row.completion) {
      const view = await this.view(row)
      if (!view.canConfirm) throw new PracticeError('课后任务证据不足：需完成作答及要求的错因反思', 409)
      await this.put(id, { ...row, completion: { confirmedAt: new Date().toISOString(), proofs: view.evidence.map(({ roundId, total, correct, questionIds, reflectedIds }) => ({ roundId, total, correct, questionIds, reflectedIds })) } })
    }
    return this.view(this.get(id))
  }) }
  /** Read/capture the same ready role identity without creating or sending a Session. */
  prepare(id: string) { return this.run(async () => {
    const row = this.get(id), binding = await this.binding(row.roleKey)
    if (row.binding && (!binding || binding.sessionId !== row.binding.sessionId || binding.presetId !== row.binding.presetId))
      throw new PracticeError('原课堂角色关联不可用或已更换；请检查原会话，不会静默替换', 409)
    if (binding && binding.phase !== 'ready') throw new PracticeError('角色仍在创建意图状态，请先重试同一会话', 409)
    if (!row.binding && binding) await this.put(id, { ...row, binding: { sessionId: binding.sessionId, presetId: binding.presetId } })
    return this.view(this.get(id))
  }) }
  private async evidence(row: Lesson, roundId: string): Promise<LessonEvidence> {
    const round = await this.practice.read(roundId), result = round.result
    if (!result || result.totalCount === 0) throw new PracticeError('本轮未提交或没有可评分作答')
    if (round.context.subject !== row.request.subject || (row.request.knowledgePoint &&
      result.results.some(q => q.knowledgePoint !== row.request.knowledgePoint))) throw new PracticeError('作答不属于本课科目或考点')
    return { roundId, total: result.totalCount, correct: result.correctCount, questionIds: result.results.map(q => q.id),
      reflectedIds: round.reflections.map(q => q.id), answered: result.results.every(q => !!q.userAnswer.trim()),
      reflectionsComplete: result.results.filter(q => !q.correct).every(q => round.reflections.some(r => r.id === q.id && !!r.errorReason)),
      projection: result.projection, review: result.review }
  }
  private async view(lesson: Lesson): Promise<LessonView> {
    const evidence = await Promise.all(lesson.roundIds.map(id => this.evidence(lesson, id)))
    const canConfirm = evidence.length > 0 && evidence.every(row => row.answered && (!lesson.request.requireReflections || row.reflectionsComplete))
    const summary = JSON.stringify({ version: 1, lessonId: lesson.request.lessonId, objectiveId: lesson.objectiveId, homeworkId: lesson.homeworkId,
      subject: lesson.request.subject, objective: lesson.request.objective, materials: lesson.materials.map(({ id, title }) => ({ id, title })),
      roleKey: lesson.roleKey, binding: lesson.binding, status: lesson.completion ? 'learner-confirmed-complete' : 'unfinished',
      attempts: evidence.map(({ roundId, total, correct, answered, reflectionsComplete, projection, review }) => ({ roundId, total, correct, answered, reflectionsComplete, projection, review })),
      confirmedAt: lesson.completion?.confirmedAt ?? null, learnerNotes: lesson.notes, next: lesson.completion ? '另建复习课；本课完成不代表长期掌握' : '继续真实作答、要求的反思并由学习者确认' })
    return { lesson, evidence, canConfirm, summary }
  }
}
