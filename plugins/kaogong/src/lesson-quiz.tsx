import { useState } from 'react'
import type { CSSProperties } from 'react'

/** 当堂检测的题目数据：判分与解析都在客户端完成，不写错题本、不计入正确率。 */
export type QuizQuestion = {
  id: string
  prompt: string
  options: readonly string[]
  /** 正确选项下标。 */
  answer: number
  /** 解析：说明错在哪一步，而不只是答案。 */
  why: string
  /** 目标小节锚点；本票只携带，回跳在下一票接入。 */
  anchorId: string
}

export type QuizAnswer = number | null

export type QuizItemGrade = {
  id: string
  chosen: QuizAnswer
  answer: number
  correct: boolean
  explanation: string
  anchorId: string
}

export type QuizGrade = {
  total: number
  answered: number
  correct: number
  allAnswered: boolean
  items: QuizItemGrade[]
  /** 全部答完时的一句话小结；未答完为空。票 04 负责展示。 */
  summary: string
}

/** 纯判分：给题与选择，逐题返回对错与解析，并给出计数与（答完后的）小结。 */
export function gradeQuiz(questions: readonly QuizQuestion[], answers: readonly QuizAnswer[]): QuizGrade {
  const items = questions.map((question, index) => {
    const chosen = answers[index] ?? null
    return {
      id: question.id,
      chosen,
      answer: question.answer,
      correct: chosen === question.answer,
      explanation: question.why,
      anchorId: question.anchorId,
    }
  })
  const answered = items.filter(item => item.chosen !== null).length
  const correct = items.filter(item => item.correct).length
  const allAnswered = questions.length > 0 && answered === questions.length
  return {
    total: questions.length,
    answered,
    correct,
    allAnswered,
    items,
    summary: allAnswered ? `检测 ${correct} / ${questions.length} 正确` : '',
  }
}

export const MIXED_GROWTH_QUIZ: readonly QuizQuestion[] = [
  {
    id: 'quiz-1',
    prompt: '2022 年某地城镇居民人均可支配收入 4.2 万元、农村居民 1.8 万元；2023 年城镇增长 5.8%，农村增长 8.4%。2023 年全体居民人均可支配收入增速最接近：',
    options: ['5.4%', '6.6%', '8.4%', '9.1%'],
    answer: 1,
    why: '区间 5.8–8.4，5.4 出局；城镇基期是农村 2.3 倍，偏向 5.8 一侧；精确值 6.58%；8.4% 是农村的值，混合不可能等于其中一个部分值。',
    anchorId: 'handout-s5',
  },
  {
    id: 'quiz-2',
    prompt: '某公司上半年营收增长 10%，下半年增长 4%，全年增长 6%。上半年与下半年基期营收之比为：',
    options: ['1∶2', '2∶1', '3∶2', '5∶3'],
    answer: 0,
    why: '十字交叉 上半年∶下半年 = |4−6|∶|6−10| = 2∶4 = 1∶2；验算 (1×10%+2×4%)÷3 = 6%。',
    anchorId: 'handout-s5',
  },
  {
    id: 'quiz-3',
    prompt: '（陷阱题）2023 年 A 区 GDP 增长 20%，B 区增长 0%，2023 年 A 区 GDP 恰好是 B 区的 2 倍。全市 GDP 增速最接近：',
    options: ['11.2%', '12.5%', '13.3%', '14.0%'],
    answer: 1,
    why: '2 倍是现期的倍数，不能直接当权重；基期 A = 2÷1.2 = 1.67、B = 1；r = (1.67×20% + 1×0%) ÷ 2.67 = 12.5%；13.3% 正是拿现期 2∶1 算出来的错法。',
    anchorId: 'handout-s6',
  },
]

const LETTERS = 'ABCD'

function choiceState(question: QuizQuestion, chosen: QuizAnswer, option: number): 'correct' | 'wrong' | 'dim' | undefined {
  if (chosen === null) return undefined
  if (option === question.answer) return 'correct'
  if (option === chosen) return 'wrong'
  return 'dim'
}

const optionStyle = (state: 'correct' | 'wrong' | 'dim' | undefined): CSSProperties => ({
  display: 'flex', alignItems: 'baseline', gap: 8, minHeight: 34, padding: '7px 11px', borderRadius: 7,
  border: '1px solid ' + (state === 'correct' ? '#a9cdb5' : state === 'wrong' ? '#e3b8b3' : '#dbe2d8'),
  background: state === 'correct' ? '#eef6f0' : state === 'wrong' ? '#fdf1ef' : '#fff',
  color: state === 'correct' ? '#1f5a41' : state === 'wrong' ? '#97382f' : '#1f2420',
  fontWeight: state === 'correct' ? 600 : 400,
  opacity: state === 'dim' ? 0.5 : 1,
  textAlign: 'left', cursor: state ? 'default' : 'pointer', maxWidth: '100%',
})

/** 当堂检测页：3 道选择题，选完立即判分并锁定该题。 */
export function QuizPanel({ questions = MIXED_GROWTH_QUIZ }: { questions?: readonly QuizQuestion[] }) {
  const [answers, setAnswers] = useState<QuizAnswer[]>(() => questions.map(() => null))
  const grade = gradeQuiz(questions, answers)
  const choose = (index: number, option: number) => {
    setAnswers(current => current[index] === null ? current.map((value, at) => at === index ? option : value) : current)
  }
  if (questions.length === 0) return <p role="status">本课暂无检测。</p>
  return (
    <div aria-label="当堂检测" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong>当堂检测</strong>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#667085', fontVariantNumeric: 'tabular-nums' }}>检测 <b style={{ color: '#2f6b58' }}>{grade.answered}</b>/{grade.total}</span>
      </div>
      <small style={{ color: '#667085' }}>选完立刻判分，不能改选；答错先看解析，再回对应小节重读。</small>
      {questions.map((question, index) => {
        const chosen = answers[index] ?? null
        const answered = chosen !== null
        const right = answered && chosen === question.answer
        return (
          <div key={question.id} data-quiz-anchor={question.anchorId} style={{ border: '1px solid #dbe2d8', borderRadius: 8, padding: 12, display: 'grid', gap: 8, background: '#fff' }}>
            <small style={{ color: '#667085' }}>第 {index + 1} 题 / {questions.length}</small>
            <p style={{ margin: 0, lineHeight: 1.8 }}>{question.prompt}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              {question.options.map((option, at) => {
                const state = choiceState(question, chosen, at)
                return <button
                  key={at}
                  data-pwb-button
                  type="button"
                  aria-label={`第 ${index + 1} 题 选项 ${LETTERS[at]}`}
                  data-choice-state={state}
                  disabled={answered}
                  onClick={() => choose(index, at)}
                  style={optionStyle(state)}
                ><b style={{ flex: 'none', minWidth: 12 }}>{LETTERS[at]}</b><span>{option}</span></button>
              })}
            </div>
            {answered && <div role="status" style={{ borderTop: '1px dashed #dbe2d8', paddingTop: 8, display: 'grid', gap: 4, fontSize: 12.5, lineHeight: 1.8 }}>
              <b style={{ color: right ? '#2f6b58' : '#b42318' }}>{right ? '回答正确' : `回答错误，正确选项是 ${LETTERS[question.answer]}`}</b>
              <p style={{ margin: 0 }}>{question.why}</p>
            </div>}
          </div>
        )
      })}
    </div>
  )
}
