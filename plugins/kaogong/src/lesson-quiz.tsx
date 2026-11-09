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
  /** 目标小节锚点：答错时「回对应小节」落到讲义的那一节。 */
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
  /** 已作答且答错的题：错题计数只从这里取，避免各处再按不同条件过滤。 */
  wrongItems: QuizItemGrade[]
  /** 全部答完时的一句话小结；未答完为空。 */
  summary: string
}

export type QuizAdvice =
  | { kind: 'practice'; text: string; action: string }
  | { kind: 'jump'; text: string; action: string; anchorId: string }

/** 清空一组题的作答：初始渲染、重做检测、换课都走这里，避免三处各写一遍。 */
export function emptyQuizAnswers(questions: readonly QuizQuestion[]): QuizAnswer[] {
  return questions.map(() => null)
}

/** 正确率不超过这个比例时，先回第 5 节重读再测，而不是直接刷题。 */
const REREAD_CORRECT_RATIO_LIMIT = 1 / 3

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
    wrongItems: items.filter(item => item.chosen !== null && !item.correct),
    summary: allAnswered ? `检测 ${correct} / ${questions.length} 正确` : '',
  }
}

/** 答完后的下一步建议：全对去专项；只错一题回错的那一节；其余先重读快速思路。 */
export function quizAdvice(grade: QuizGrade): QuizAdvice | null {
  if (!grade.allAnswered || grade.total === 0) return null
  if (grade.correct === grade.total) return {
    kind: 'practice',
    text: '全对：方法已经会了，下一步用 10 道专项把速度练稳。',
    action: '去做 10 题专项',
  }
  const reread: QuizAdvice = {
    kind: 'jump',
    text: '先别急着刷题：回讲义里对应那一节重读，再测一次。',
    action: '回对应小节重读',
    anchorId: grade.items[0]?.anchorId ?? 'handout-s5',
  }
  if (grade.correct / grade.total <= REREAD_CORRECT_RATIO_LIMIT) return reread
  const wrong = grade.wrongItems
  if (wrong.length !== 1) return reread
  return {
    kind: 'jump',
    text: '只错一题：回错的那一节，把这一步补上再来一轮。',
    action: '回错的那一节',
    anchorId: wrong[0].anchorId,
  }
}

/** 与 MIXED_GROWTH_HANDOUT 同一口径：自编、非真题。 */
export const MIXED_GROWTH_QUIZ_PROVENANCE = '自编检测题：教学设计用，非真题；真题在练习轮次里。'

export const MIXED_GROWTH_QUIZ: readonly QuizQuestion[] = [
  {
    id: 'quiz-1',
    prompt: '2022 年某地城镇居民人均可支配收入 4.2 万元、农村居民 1.8 万元，城镇与农村人口各 500 万且 2023 年不变；2023 年城镇增长 5.8%，农村增长 8.4%。2023 年全体居民人均可支配收入增速最接近：',
    options: ['5.4%', '6.6%', '7.8%', '9.1%'],
    answer: 1,
    why: '区间 5.8–8.4：5.4 低于下界、9.1 高于上界，先出局。人口不变时，全体居民人均收入增速等于收入总量增速，权重取收入总量：城镇 500×4.2、农村 500×1.8，即 7∶3，偏向 5.8 一侧；精确值 (7×5.8% + 3×8.4%) ÷ 10 = 6.58%，所以 6.6 最接近，7.8 偏大。',
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

/** 与 GROWTH_COMPARISON_HANDOUT 同一口径：自编、非真题。 */
export const GROWTH_COMPARISON_QUIZ_PROVENANCE = '自编检测题：教学设计用，非真题；真题在练习轮次里。'

/** 第 2 课的检测题：锚点指向第 2 课的讲义小节，回跳机制与第 1 课一致。 */
export const GROWTH_COMPARISON_QUIZ: readonly QuizQuestion[] = [
  {
    id: 'growth-quiz-1',
    prompt: '甲现期量 100、同比增长 20%；乙现期量 200、同比增长 10%。谁的增长量大？',
    options: ['甲，约 16.7', '乙，约 18.2', '甲，约 20', '一样大'],
    answer: 1,
    why: '增长量 = 现期量 × 增长率 ÷ (1 + 增长率)：甲 ≈ 100 × 20% ÷ 1.2 ≈ 16.7，乙 = 200 × 10% ÷ 1.1 ≈ 18.2。乙的增长率低，但现期量大，增长量仍然更大。',
    anchorId: 'handout2-s2',
  },
  {
    id: 'growth-quiz-2',
    prompt: '判断：增长量 = 现期量 × 增长率 ÷ (1 + 增长率)。',
    options: ['正确', '错误：应为 现期量 × 增长率', '错误：应为 基期量 ÷ 增长率', '错误：应为 现期量 ÷ (1 + 增长率)'],
    answer: 0,
    why: '基期量 = 现期量 ÷ (1 + 增长率)，增长量 = 基期量 × 增长率 = 现期量 × 增长率 ÷ (1 + 增长率)，式子正确。直接用 现期量 × 增长率 会把增长量算大。',
    anchorId: 'handout2-s2',
  },
  {
    id: 'growth-quiz-3',
    prompt: '判断：增长率高的一方，增长量一定大。',
    options: ['正确', '错误：还要看现期量的大小', '错误：增长量只与基期量有关'],
    answer: 1,
    why: '增长量同时取决于现期量（或基期量）与增长率。第 1 题里乙的增长率更低，增长量反而更大；只比增长率就会掉进陷阱。',
    anchorId: 'handout2-s3',
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

/** 当堂检测页：3 道选择题，选完立即判分并锁定该题；答错可回跳，答完给小结与下一步。作答由课堂面板持有，切页签不丢。 */
export function QuizPanel({ questions = MIXED_GROWTH_QUIZ, answers, onAnswer, onJump, onPractice, provenance }: {
  questions?: readonly QuizQuestion[]
  /** 已作答：`null` 表示未答，作答后不可改选。 */
  answers: readonly QuizAnswer[]
  /** 记录一题的作答；已答的题由课堂面板忽略重复点击。 */
  onAnswer: (index: number, option: number) => void
  /** 回跳：由课堂面板切到讲义页签、滚动并高亮目标小节。 */
  onJump?: (anchorId: string) => void
  /** 全对后的专项练习入口：由课堂面板透传。 */
  onPractice?: () => void
  /** 这套题是自编还是真题：由课堂面板随题给，不冒充真题。 */
  provenance?: string
}) {
  const grade = gradeQuiz(questions, answers)
  const advice = quizAdvice(grade)
  const choose = (index: number, option: number) => {
    if ((answers[index] ?? null) === null) onAnswer(index, option)
  }
  if (questions.length === 0) return <p role="status">本课暂无检测。</p>
  return (
    <div aria-label="当堂检测" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong>当堂检测</strong>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#667085', fontVariantNumeric: 'tabular-nums' }}>检测 <b style={{ color: '#2f6b58' }}>{grade.answered}</b>/{grade.total}</span>
      </div>
      {provenance && <small style={{ color: '#667085' }}>{provenance}</small>}
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
              {!right && onJump && <button data-pwb-button type="button" style={{ justifySelf: 'start' }} onClick={() => onJump(question.anchorId)}>回对应小节</button>}
            </div>}
          </div>
        )
      })}
      {advice && <div role="status" aria-label="当堂检测小结" data-quiz-summary style={{ border: '1px solid #cfe0d3', borderRadius: 8, padding: 12, display: 'grid', gap: 6, background: '#f6faf7' }}>
        <strong style={{ color: '#1f5a41', fontVariantNumeric: 'tabular-nums' }}>{grade.correct} / {grade.total} 正确</strong>
        <p style={{ margin: 0, lineHeight: 1.8 }}>{advice.text}</p>
        {advice.kind === 'practice'
          ? <button data-pwb-button data-variant="primary" type="button" style={{ justifySelf: 'start' }} onClick={() => onPractice?.()}>{advice.action}</button>
          : <button data-pwb-button data-variant="primary" type="button" style={{ justifySelf: 'start' }} onClick={() => onJump?.(advice.anchorId)}>{advice.action}</button>}
      </div>}
    </div>
  )
}
