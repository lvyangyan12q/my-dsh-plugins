import type { PracticeRound } from './schemas.ts'
import type { Question } from './types.ts'
import { analyzeQuestions, summarizeQuestions } from './analyze.ts'

export interface PracticeCounts {
  submittedRoundCount: number
  submittedCount: number
  answeredCount: number
  unansweredCount: number
  uniqueQuestionCount: number
  correctCount: number
  incorrectCount: number
  accuracyRate: number
}

/** The immutable scored-round ledger is the only source of system grades.
 * Notebook projections, unsubmitted rounds and external self-reports are excluded. */
type ScoredAttempt = Question & {practiceRoundId: string}

export function scoredAttempts(rounds: Iterable<readonly [string, PracticeRound]>, subject?: string): ScoredAttempt[] {
  const attempts: ScoredAttempt[] = []
  for (const [roundId, round] of rounds) {
    if (!round.score) continue
    for (const [index, question] of round.questions.entries()) {
      if (subject && question.subject !== subject) continue
      const answer = round.score.answers[index]!.answer
      const reflection = round.reflections.find(row => row.id === question.id)
      attempts.push({ ...question, userAnswer: answer,
        result: !answer ? 'skipped' : answer.trim() === question.correctAnswer.trim() ? 'correct' : 'wrong',
        errorReason: reflection?.errorReason ?? '', notes: reflection?.notes ?? '',
        createdAt: round.score.submittedAt, updatedAt: reflection?.savedAt ?? round.score.submittedAt,
        practiceRoundId: roundId,
      })
    }
  }
  return attempts
}

function counts(attempts: ScoredAttempt[]): PracticeCounts {
  const correctCount = attempts.filter(row => row.result === 'correct').length
  const incorrectCount = attempts.filter(row => row.result === 'wrong').length
  return {
    submittedRoundCount: new Set(attempts.map(row => row.practiceRoundId)).size,
    submittedCount: attempts.length, answeredCount: correctCount + incorrectCount,
    unansweredCount: attempts.length - correctCount - incorrectCount,
    uniqueQuestionCount: new Set(attempts.map(row => row.id)).size,
    correctCount, incorrectCount, accuracyRate: attempts.length ? correctCount / attempts.length : 0,
  }
}

export function practiceStatistics(rounds: Iterable<readonly [string, PracticeRound]>, subject?: string) {
  const attempts = scoredAttempts(rounds, subject), analysis = analyzeQuestions(attempts)
  return {
    ...counts(attempts), denominator: 'submitted-question-slots' as const,
    bySubject: [...new Set(attempts.map(row => row.subject))].map(subject => ({subject, ...counts(attempts.filter(row => row.subject === subject))})),
    byKnowledgePoint: analysis.byKnowledgePoint,
    errorReasons: analysis.byErrorReason,
  }
}

export function practiceSummary(rounds: Iterable<readonly [string, PracticeRound]>, subject: string, topN: number) {
  const attempts = scoredAttempts(rounds, subject), summary = summarizeQuestions(attempts, {topN}), totals = counts(attempts)
  return {...summary, ...totals, accuracyRate: totals.accuracyRate,
    narrative: '累计提交 ' + totals.submittedCount + ' 题，实际作答 ' + totals.answeredCount + '，未答 ' + totals.unansweredCount + '；正确率（以全部提交题量为分母）' + Math.round(totals.accuracyRate * 100) + '%。'}
}
