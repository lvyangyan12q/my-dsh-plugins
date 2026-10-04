/** Durable practice commands shared by HTTP and tools. Notebook writes are recoverable projections. */
import { randomUUID } from 'node:crypto'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { BankQuestion, Question } from './types.ts'
import type { BankQuestionRecord, QuestionRecord, PracticeRound } from './schemas.ts'
import { selectPractice } from './practice.ts'
import { ERROR_REASONS } from './taxonomy.ts'

export class PracticeError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

/** Fail closed on answer-key material rather than editing the original bank text. */
export function safePracticeQuestion(question: BankQuestion): boolean {
  const text = [question.stem, ...question.options, question.source].join('\n')
  if (/答案|解析|(?:answer|solution|explanation)\s*[:：]|(?:^|\n)\s*\d+[.、]\s*[A-D](?:\s+\d+[.、]\s*[A-D])+/im.test(text)) return false
  return question.options.length > 0 && question.options.some(option => optionKey(option) === question.correctAnswer.trim())
}

function optionKey(option: string) { return /^\s*([A-Za-z])(?:[.、)\s]|$)/.exec(option)?.[1]?.toUpperCase() ?? option }

/** One application command queue, drained before domains close. No cross-domain transaction is assumed. */
export class PracticeRounds {
  private tail: Promise<unknown> = Promise.resolve()
  constructor(private rounds: KvTable<string, PracticeRound>, private bank: KvTable<string, BankQuestionRecord>, private notebook: KvTable<string, QuestionRecord>) {}
  drain() { return this.tail }
  notebookCommand<T>(command: () => Promise<T>): Promise<T> { return this.run(command) }
  private run<T>(command: () => Promise<T>): Promise<T> {
    const result = this.tail.then(command)
    this.tail = result.catch(() => {})
    return result
  }
  private round(id: string) {
    const value = this.rounds.get(id)
    if (!value) throw new PracticeError('issued practice round not found', 404)
    return value
  }
  /** Issue ten distinct questions, filling the end of a cycle before repeating seen questions. */
  start(context: PracticeRound['context'], previousRoundId?: string, weak = false, difficulty?: 'easy' | 'medium' | 'hard') {
    return this.run(async () => {
      const previous = previousRoundId ? this.round(previousRoundId) : undefined
      if (previous && (!previous.score || previous.context.subject !== context.subject || previous.context.knowledgePoint !== context.knowledgePoint)) throw new PracticeError('next round requires a submitted round in the same module')
      const bank: BankQuestion[] = [...this.bank.entries()].map(([id, row]) => ({ id, ...row })).filter(safePracticeQuestion)
      const notebook: Question[] = [...this.notebook.entries()].map(([id, row]) => ({ id, ...row }))
      const controls = { ...context, limit: 10, weak, difficulty }
      const full = selectPractice(bank, notebook, controls)
      if (full.totalAvailable === 0 && context.knowledgePoint) {
        throw new PracticeError('没有匹配当前科目、考点和难度的可练习题目；请确认考点名称或显式选择科目练习')
      }
      const seen = previous?.seenIds ?? []
      let selected = selectPractice(bank, notebook, { ...controls, excludeIds: seen }).selected
      const cycled = selected.length < Math.min(10, full.totalAvailable) && seen.length > 0
      if (selected.length < 10) {
        const ids = new Set(selected.map(row => row.id))
        selected = [...selected, ...full.selected.filter(row => !ids.has(row.id))].slice(0, 10)
      }
      const now = new Date().toISOString()
      const id = randomUUID()
      const round: PracticeRound = { version: 1, context, questions: selected, seenIds: [...new Set([...(cycled ? [] : seen), ...selected.map(row => row.id)])], reason: full.reason,
        totalAvailable: full.totalAvailable, cycled, createdAt: now, changedAt: now, reflections: [], revision: 0, projectedRevision: 0, review: 'ready' }
      await this.rounds.put(id, round)
      return this.view(id, round)
    })
  }
  private result(id: string, round: PracticeRound) {
    if (!round.score) throw new PracticeError('practice round has not been submitted', 409)
    const results = round.questions.map((q, index) => {
      const userAnswer = round.score!.answers[index]!.answer
      const correct = userAnswer !== '' && userAnswer.trim() === q.correctAnswer.trim()
      return { id: q.id, subject: q.subject, knowledgePoint: q.knowledgePoint, stem: q.stem, options: q.options, source: q.source, userAnswer,
        correct, correctAnswer: q.correctAnswer, explanation: q.explanation }
    })
    const correctCount = results.filter(row => row.correct).length
    return { roundId: id, totalCount: results.length, correctCount, accuracyRate: results.length ? correctCount / results.length : 0, results,
      projection: round.projectedRevision === round.revision ? 'complete' as const : 'pending' as const, review: round.review }
  }
  private view(id: string, round: PracticeRound) {
    return { roundId: id, context: round.context, reason: round.reason, totalAvailable: round.totalAvailable, returned: round.questions.length, cycled: round.cycled,
      questions: round.questions.map(({ id, subject, knowledgePoint, stem, options, difficulty, source }) => ({ id, subject, knowledgePoint, stem, options, difficulty, source })),
      result: round.score ? this.result(id, round) : null, reflections: round.reflections }
  }
  /** Only the stored snapshot is scored; all membership checks precede the first write. */
  submit(id: string, answers: { id: string; answer: string }[]) {
    return this.run(async () => {
      let round = this.round(id)
      if (!round.questions.length || answers.length !== round.questions.length || new Set(answers.map(row => row.id)).size !== answers.length) throw new PracticeError('answers must contain every issued question exactly once')
      const byId = new Map(answers.map(row => [row.id, row.answer.trim()]))
      const ordered = round.questions.map(q => {
        const answer = byId.get(q.id)
        if (answer === undefined || (answer !== '' && !q.options.some(option => optionKey(option) === answer))) throw new PracticeError('invalid issued question or answer')
        return { id: q.id, answer }
      })
      if (round.score) {
        if (JSON.stringify(ordered) !== JSON.stringify(round.score.answers)) throw new PracticeError('conflicting retry: this round already has different answers', 409)
      } else {
        let sequence = 1
        for (const [, row] of this.rounds.entries()) sequence = Math.max(sequence, (row.score?.sequence ?? 0) + 1)
        const now = new Date().toISOString()
        round = { ...round, score: { answers: ordered, sequence, submittedAt: now }, revision: 1, changedAt: now }
        await this.rounds.put(id, round)
      }
      await this.project(id, round)
      return this.result(id, this.round(id))
    })
  }
  /** Replaying a projection cannot erase another attempt or later manual reflections. */
  private async project(id: string, round: PracticeRound) {
    if (!round.score || round.projectedRevision === round.revision) return
    try {
      for (const [index, question] of round.questions.entries()) {
        const transform = (old?: QuestionRecord): QuestionRecord => {
          const reflection = round.reflections.find(row => row.id === question.id)
          const changedAt = reflection?.savedAt ?? round.score!.submittedAt
          if (old && ((old.practiceSequence ?? 0) > round.score!.sequence ||
            (old.practiceRoundId === id && (old.practiceRevision ?? 0) >= round.revision) || old.updatedAt > changedAt)) return old
          const answer = round.score!.answers[index]!.answer
          const notes = old?.practiceRoundId === id && (old.practiceRevision ?? 0) >= (reflection?.notesRevision ?? 0)
            ? old.notes : reflection?.notes ?? old?.notes ?? ''
          return { subject: question.subject, knowledgePoint: question.knowledgePoint, questionType: question.questionType, stem: question.stem, options: question.options,
            correctAnswer: question.correctAnswer, userAnswer: answer, result: !answer ? 'skipped' : answer === question.correctAnswer.trim() ? 'correct' : 'wrong',
            source: question.source, tags: old?.tags ?? question.tags, errorReason: reflection?.errorReason ?? old?.errorReason ?? '', notes,
            createdAt: old?.createdAt ?? round.score!.submittedAt, updatedAt: changedAt, practiceRoundId: id, practiceSequence: round.score!.sequence, practiceRevision: round.revision }
        }
        if (this.notebook.get(question.id) !== undefined) await this.notebook.update(question.id, transform)
        else await this.notebook.put(question.id, transform())
      }
      await this.rounds.update(id, current => ({ ...current, projectedRevision: round.revision }))
    } catch (error) {
      // The score is already durable. Reads and identical retries attempt recovery and report pending.
      if (!(error instanceof Error)) throw error
    }
  }
  read(id: string) {
    return this.run(async () => { const round = this.round(id); await this.project(id, round); return this.view(id, this.round(id)) })
  }
  /** History lists issued IDs without exposing open-round answers. */
  history() {
    return [...this.rounds.entries()].map(([roundId, round]) => ({ roundId, context: round.context, createdAt: round.createdAt, submitted: Boolean(round.score) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100)
  }
  recover() {
    return this.run(async () => { for (const [id, round] of this.rounds.entries()) await this.project(id, round) })
  }
  reflect(id: string, entries: { id: string; errorReason: string; notes?: string }[]) {
    return this.run(async () => {
      let round = this.round(id)
      const result = this.result(id, round)
      if (new Set(entries.map(row => row.id)).size !== entries.length || entries.some(entry => !result.results.some(row => row.id === entry.id && !row.correct) || !ERROR_REASONS.some(reason => reason === entry.errorReason))) throw new PracticeError('invalid round reflection')
      const reflections = round.questions.flatMap(q => {
        const previous = round.reflections.find(row => row.id === q.id)
        const entry = entries.find(row => row.id === q.id)
        if (!entry) return previous ? [previous] : []
        const next = { ...entry, ...(entry.notes === undefined && previous?.notes !== undefined ? { notes: previous.notes } : {}) }
        return [{ ...next, savedAt: previous && next.errorReason === previous.errorReason && next.notes === previous.notes ? previous.savedAt : new Date().toISOString(),
          ...(next.notes !== undefined ? { notesRevision: entry.notes !== undefined && entry.notes !== previous?.notes ? round.revision + 1 : previous?.notesRevision } : {}) }]
      })
      if (JSON.stringify(reflections) !== JSON.stringify(round.reflections)) {
        round = { ...round, reflections, revision: round.revision + 1, changedAt: new Date().toISOString() }
        await this.rounds.put(id, round)
      }
      await this.project(id, round)
      return this.result(id, this.round(id))
    })
  }
  /** Reserve an explicit native handoff; uncertain delivery stays sending across restart. */
  review(id: string, action: 'claim' | 'complete') {
    return this.run(async () => {
      const round = this.round(id)
      this.result(id, round)
      if (action === 'claim' && round.review !== 'ready') throw new PracticeError(round.review === 'sent' ? 'review already sent' : 'review delivery uncertain; inspect the counselor conversation', 409)
      if (action === 'complete' && round.review === 'ready') throw new PracticeError('review was not claimed', 409)
      if (action === 'complete' && round.review === 'sent') return this.view(id, round)
      await this.rounds.update(id, current => ({ ...current, review: action === 'claim' ? 'sending' : 'sent' }))
      return this.view(id, this.round(id))
    })
  }
}
