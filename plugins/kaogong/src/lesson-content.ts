import { GROWTH_COMPARISON_HANDOUT, MIXED_GROWTH_HANDOUT } from './lesson-handout.tsx'
import { GROWTH_COMPARISON_QUIZ, GROWTH_COMPARISON_QUIZ_PROVENANCE, MIXED_GROWTH_QUIZ, MIXED_GROWTH_QUIZ_PROVENANCE } from './lesson-quiz.tsx'
import type { Handout } from './lesson-handout.tsx'
import type { QuizQuestion } from './lesson-quiz.tsx'

/** 一课的全部内容：讲义、检测与来源说明。渲染器只消费它，不认具体是哪一课。 */
export type LessonContent = {
  id: string
  /** 一段课堂文字（学习目标或限定考点）是否属于这一课。 */
  match: (text: string) => boolean
  handout: Handout
  quiz: readonly QuizQuestion[]
  /** 这套检测是自编还是真题：随内容走，不冒充真题。 */
  quizProvenance: string
}

const mentions = (text: string, keywords: readonly string[]): boolean =>
  keywords.some(keyword => text.includes(keyword))

/** 内容注册表：加一课只在这里加一项，面板与渲染器不动。顺序即匹配优先级。 */
export const LESSON_CONTENTS: readonly LessonContent[] = [
  {
    id: 'mixed-growth',
    match: text => mentions(text, ['混合增长', '增长率混合']),
    handout: MIXED_GROWTH_HANDOUT,
    quiz: MIXED_GROWTH_QUIZ,
    quizProvenance: MIXED_GROWTH_QUIZ_PROVENANCE,
  },
  {
    id: 'growth-comparison',
    match: text => mentions(text, ['增长量比较', '增长量']),
    handout: GROWTH_COMPARISON_HANDOUT,
    quiz: GROWTH_COMPARISON_QUIZ,
    quizProvenance: GROWTH_COMPARISON_QUIZ_PROVENANCE,
  },
]

/** 本课目标或限定考点命中哪一课；都不命中就是没有讲义、也没有检测。 */
export function resolveLessonContent(request: { knowledgePoint?: string; objective?: string } | null | undefined): LessonContent | null {
  if (!request) return null
  const texts = [request.knowledgePoint ?? '', request.objective ?? '']
  return LESSON_CONTENTS.find(content => texts.some(text => content.match(text))) ?? null
}
