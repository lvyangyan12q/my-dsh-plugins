import type { CSSProperties } from 'react'
import { gradeQuiz } from './lesson-quiz.tsx'
import type { QuizAnswer, QuizGrade, QuizQuestion } from './lesson-quiz.tsx'

/** 课后任务的四步：读 / 测 / 练 / 回炉。状态全部由已发生的作答推导，不需要学员手动勾选。 */
export type LessonTaskKey = 'read' | 'quiz' | 'practice' | 'reheat'
export type LessonTaskState = 'done' | 'current' | 'ready' | 'pending'
export type LessonTask = {
  key: LessonTaskKey
  label: string
  title: string
  state: LessonTaskState
  detail: string
}

export type LessonTaskInput = {
  questions: readonly QuizQuestion[]
  answers: readonly QuizAnswer[]
  /** 讲义已实际渲染（不是点过「当堂检测」）。 */
  readDone: boolean
  /** 已有一轮真实提交的专项练习（或已关联到本课）即视为「练」完成。 */
  practiceDone: boolean
}

/** 由检测作答与练习证据推导四步状态：同一时刻最多一个当前步。判分只在这里算一次。 */
export function deriveLessonTasks({ questions, answers, readDone, practiceDone }: LessonTaskInput): { tasks: LessonTask[]; grade: QuizGrade } {
  const grade = gradeQuiz(questions, answers)
  const wrong = grade.wrongItems.length
  const allAnswered = grade.allAnswered
  const tasks: LessonTask[] = [
    {
      key: 'read', label: '读', title: '读讲义',
      state: readDone ? 'done' : 'current',
      detail: readDone ? '已读讲义' : '先读讲义，再开始检测',
    },
    {
      key: 'quiz', label: '测', title: '当堂检测',
      state: allAnswered ? 'done' : readDone ? 'current' : 'pending',
      detail: `检测 ${grade.answered}/${grade.total}`,
    },
    {
      key: 'practice', label: '练', title: '专项练习',
      state: allAnswered ? (practiceDone ? 'done' : 'current') : 'pending',
      detail: practiceDone ? '已提交一轮专项练习' : allAnswered ? '检测完成，去做 10 题专项' : '检测完成后开始',
    },
    {
      key: 'reheat', label: '回炉', title: '错题回炉',
      state: allAnswered ? (wrong > 0 ? (practiceDone ? 'current' : 'ready') : 'done') : 'pending',
      detail: allAnswered ? (wrong > 0 ? `待回炉 ${wrong} 题` : '无需回炉') : wrong > 0 ? `已错 ${wrong} 题，检测完成后回炉` : '检测完成后决定',
    },
  ]
  return { tasks, grade }
}

const stepStyle = (state: LessonTaskState): CSSProperties => ({
  display: 'grid', gap: 2, minWidth: 0, padding: '8px 10px', borderRadius: 8,
  border: '1px solid ' + (state === 'current' ? '#7fb69a' : state === 'ready' ? '#d8b46a' : '#dbe2d8'),
  background: state === 'current' ? '#f2f8f4' : state === 'ready' ? '#fffaf0' : state === 'done' ? '#f7faf8' : '#fff',
  opacity: state === 'pending' ? 0.72 : 1,
})

const badge: Record<LessonTaskState, string> = { done: '完成', current: '当前', ready: '亮起', pending: '未开始' }

/** 课后任务面板：四步状态 + 当前步的入口；有错题时给出回炉卡（回小节重读 / 重做检测 / 请老师补讲）。 */
export function LessonTasks({ questions, answers, readDone, practiceDone, onJump, onPractice, onExplain, onRetake }: LessonTaskInput & {
  /** 回讲义对应小节重读。 */
  onJump: (anchorId: string) => void
  /** 进入专项练习：复用课堂面板已有的练习入口。 */
  onPractice: () => void
  /** 针对某一步请老师补讲：复用课堂答疑与任务会话。 */
  onExplain?: (question: QuizQuestion, chosen: number) => void
  /** 重做检测：清空作答并回到检测页签。 */
  onRetake: () => void
}) {
  const { tasks, grade } = deriveLessonTasks({ questions, answers, readDone, practiceDone })
  const wrong = grade.wrongItems
  const firstWrong = wrong[0] ? questions.find(question => question.id === wrong[0].id) : undefined
  return <section aria-label="课后任务" data-lesson-tasks style={{ display: 'grid', gap: 10, marginTop: 12 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <h3 style={{ margin: 0, fontSize: 14 }}>课后任务</h3>
      <small style={{ color: '#667085' }}>状态由检测与练习推导，不用勾选。</small>
    </div>
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
      {tasks.map((task, index) => <li key={task.key} data-task-key={task.key} data-task-state={task.state}
        aria-current={task.state === 'current' ? 'step' : undefined} style={stepStyle(task.state)}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <b style={{ fontSize: 13 }}>{index + 1}. {task.label}</b>
          <small style={{ marginLeft: 'auto', fontSize: 11, color: task.state === 'current' ? '#2f6b58' : task.state === 'ready' ? '#8a5c12' : '#667085' }}>{badge[task.state]}</small>
        </div>
        <span style={{ fontSize: 12.5, color: '#1f2420' }}>{task.title}</span>
        <small style={{ fontSize: 11.5, color: '#667085' }}>{task.detail}</small>
        {task.key === 'practice' && task.state === 'current' && <button data-pwb-button type="button" style={{ justifySelf: 'start', marginTop: 4 }} onClick={onPractice}>进入专项练习</button>}
      </li>)}
    </ol>
    {grade.allAnswered && wrong.length > 0 && <div data-reheat-card role="status" style={{ border: '1px solid #d8b46a', borderRadius: 8, padding: 12, display: 'grid', gap: 6, background: '#fffaf0' }}>
      <strong style={{ color: '#8a5c12', fontVariantNumeric: 'tabular-nums' }}>回炉：待回炉 {wrong.length} 题</strong>
      <small style={{ color: '#667085' }}>错的题回对应小节重读，或重做检测再确认一遍。</small>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button data-pwb-button type="button" onClick={() => onJump(wrong[0].anchorId)}>回对应小节重读</button>
        <button data-pwb-button type="button" onClick={onRetake}>重做检测</button>
        {onExplain && firstWrong && <button data-pwb-button type="button" onClick={() => onExplain(firstWrong, wrong[0].chosen as number)}>请老师补讲这一步</button>}
      </div>
    </div>}
  </section>
}
