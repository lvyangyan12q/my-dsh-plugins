import {ErrorReviews} from './error-reviews.ts'
import type { DomainFacility, DomainSpec, Domain, KvTable, DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { instanceDomainSpecs } from './domain.ts'
import { PracticeRounds } from './practice-rounds.ts'
import { Lessons } from './lessons.ts'
import {StudyPlan} from './study-plan.ts'
import type { Lesson, LessonSelection } from './lesson-schema.ts'

type Binding = { phase: 'intent' | 'ready'; sessionId: string; presetId: string }
export interface InstanceStateOptions {
  readBinding?(instanceId: string, key: Lesson['roleKey']): Promise<Binding | null>
}

async function openState(facility: Pick<DomainFacility, 'open'>, instanceId: string, options: InstanceStateOptions) {
  const specs = instanceDomainSpecs(instanceId)
  const opened: Domain<DomainSpec>[] = []
  async function open<S extends DomainSpec>(spec: S) { const domain = await facility.open(spec); opened.push(domain); return domain }
  try {
    const notebook = await open(specs.notebook), progress = await open(specs.progress)
    const bank = await open(specs.bank), knowledge = await open(specs.knowledge)
    const rounds = await open(specs.practice), lessons = await open(specs.lessons), reviews = await open(specs.reviews)
    const planDomain=await open(specs.plan)
    // Native KvTable/DomainGlobal validate on open, not put/set. Refuse a foreign
    // lesson or navigation pointer before writing it into this owner's namespace.
    const lessonRecords = checkedTable(lessons.table('lessons'), value => {
      if (!specs.lessons.tables.lessons.valueSchema.safeParse(value).success) throw new Error('Invalid instance lesson record')
    })
    const lessonSelection: DomainGlobal<LessonSelection> = {
      get: () => lessons.global.get(),
      async set(value) {
        if (!specs.lessons.global.schema.safeParse(value).success) throw new Error('Invalid instance lesson selection')
        await lessons.global.set(value)
      },
    }
    const practice = new PracticeRounds(rounds.table('rounds'), bank.table('questions'), notebook.table('questions'))
    const teaching = new Lessons(lessonRecords, knowledge.table('entries'), practice,
      key => options.readBinding?.(instanceId, key) ?? Promise.resolve(null), lessonSelection)
    const errors=new ErrorReviews(rounds.table('rounds'),reviews.table('reviews'))
    const plan=new StudyPlan(planDomain.global,async(task,input)=>{
      if(task.reviewOccurrence){if(task.status!=='in-progress'||task.reviewHistoryCount===undefined)throw Error('请先开始本次复习任务');const proof=errors.readConfirmed(JSON.stringify([task.reviewOccurrence.roundId,task.reviewOccurrence.questionId]),undefined,task.reviewHistoryCount);if(proof.subject!==task.subject)throw Error('复习科目与任务不一致');return proof}
      if(!input.roundId)throw Error('需要匹配的已提交练习轮次及错因反思证据')
      const round=(await practice.readCompleted(input.roundId))?.round,result=round?.result
      if(!round||!result||round.context.taskId!==task.id||round.context.planRevision!==task.startedFromRevision||round.context.subject!==task.subject||result.results.some(q=>!q.userAnswer.trim())||task.requireReflections&&result.results.some(q=>!q.correct&&!round.reflections.some(r=>r.id===q.id&&r.errorReason)))throw Error('练习轮次、任务关联或错因反思证据不完整')
      return {roundId:round.roundId,total:result.totalCount,correct:result.correctCount,reflectedIds:round.reflections.map(r=>r.id)}
    },async task=>{const {row,review}=errors.readForPlan(JSON.stringify([task.reviewOccurrence!.roundId,task.reviewOccurrence!.questionId]));if(row.subject!==task.subject)throw Error('复习科目与任务不一致');return review.history.length})
    let closing: Promise<void> | undefined
    const state = Object.freeze({
      instanceId, questions: notebook.table('questions'), planConfig: progress.global, days: progress.table('days'),
      bankQuestions: bank.table('questions'), knowledgeEntries: knowledge.table('entries'), rounds: rounds.table('rounds'),
      lessonRecords, lessonSelection, practice, lessons: teaching, plan, errors,
    })
    return { state, close() {
      return closing ??= (async () => {
        const errors: unknown[] = []
        try { await plan.close() } catch(error){errors.push(error)}
        try { await teaching.close() } catch (error) { errors.push(error) }
        try { await practice.close() } catch (error) { errors.push(error) }
        for (const result of await Promise.allSettled(opened.map(domain => domain.close()))) if (result.status === 'rejected') errors.push(result.reason)
        if (errors.length) throw new AggregateError(errors, '实例状态关闭失败；其他领域已尝试释放')
      })()
    } }
  } catch (error) {
    const cleanup = await Promise.allSettled(opened.map(domain => domain.close()))
    const errors = cleanup.filter(result => result.status === 'rejected').map(result => result.reason)
    if (errors.length) throw new AggregateError([error, ...errors], '实例打开失败；部分领域释放失败')
    throw error
  }
}

function checkedTable<V>(table: KvTable<string, V>, check: (value: V) => void): KvTable<string, V> {
  return {
    get size() { return table.size },
    get(key) { const value = table.get(key); if (value !== undefined) check(value); return value },
    *entries() { for (const entry of table.entries()) { check(entry[1]); yield entry } },
    keys: () => table.keys(),
    async put(key, value) { check(value); await table.put(key, value) },
    update: (key, operation) => table.update(key, value => { check(value); const next = operation(value); check(next); return next }),
    delete: key => table.delete(key),
    deleteMany: keys => table.deleteMany(keys),
  }
}

export type KaogongInstanceState = Awaited<ReturnType<typeof openState>>['state']
export interface InstanceStateLease { readonly state: KaogongInstanceState; release(): Promise<void> }
type Entry = Awaited<ReturnType<typeof openState>> & { references: number; closing?: Promise<void>; idle: (() => void)[] }

/**
 * App-owned state module: a lease spans the whole business command/view, not one table access.
 * Last release drains and closes only this instance. close rejects new leases, waits for callers
 * to release existing leases, then releases all owned domains. It never imports or repairs legacy data.
 */
export class KaogongInstancePool {
  private entries = new Map<string, Promise<Entry>>()
  private stopped = false
  private stopping?: Promise<void>
  constructor(private facility: Pick<DomainFacility, 'open'>, private options: InstanceStateOptions = {}) {}

  private shutdown(id: string, pending: Promise<Entry>, entry: Entry) {
    return entry.closing ??= (async () => {
      await entry.close()
      if (this.entries.get(id) === pending) this.entries.delete(id)
    })()
  }
  async acquire(instanceId: string): Promise<InstanceStateLease> {
    instanceDomainSpecs(instanceId)
    for (;;) {
      if (this.stopped) throw new Error('考公实例状态已关闭')
      let pending = this.entries.get(instanceId)
      if (!pending) {
        pending = openState(this.facility, instanceId, this.options).then(value => ({ ...value, references: 0, idle: [] }))
        this.entries.set(instanceId, pending)
        const failed = pending
        void pending.catch(() => { if (this.entries.get(instanceId) === failed) this.entries.delete(instanceId) })
      }
      const entry = await pending
      if (entry.closing) { await entry.closing; continue }
      if (this.stopped) { if (entry.references === 0) await this.shutdown(instanceId, pending, entry); throw new Error('考公实例状态已关闭') }
      entry.references++
      let releaseResult: Promise<void> | undefined
      const owner = pending
      return { state: entry.state, release: () => releaseResult ??= (async () => {
        if (--entry.references === 0) {
          for (const ready of entry.idle.splice(0)) ready()
          await this.shutdown(instanceId, owner, entry)
        }
      })() }
    }
  }
  close() {
    this.stopped = true
    return this.stopping ??= (async () => {
      const results = await Promise.allSettled([...this.entries].map(async ([id, pending]) => {
        const entry = await pending
        if (entry.references) await new Promise<void>(resolve => entry.idle.push(resolve))
        await this.shutdown(id, pending, entry)
      }))
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
      if (errors.length) throw new AggregateError(errors, '部分考公实例关闭失败')
    })()
  }
}


