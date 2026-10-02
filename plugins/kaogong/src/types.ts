/**
 * Pure domain types for the kaogong (考公) plugin suite. No runtime
 * dependencies — shared by the analysis, scheduling, and tool layers.
 * @module kaogong/types
 */

/** The outcome of one attempt at a question. */
export type AttemptResult = 'correct' | 'wrong' | 'skipped'

/** One stored question record; the question id is the storage key, not a field. */
export interface QuestionRecord {
  /** 科目/模块，例如 行测-判断推理、行测-资料分析、申论. */
  subject: string
  /** 考点/知识点，例如 图形推理-数量规律. */
  knowledgePoint: string
  /** 题型，例如 单选、多选、主观题. */
  questionType: string
  /** 题干. */
  stem: string
  /** 选项列表；无选项的题目（如申论）为空数组. */
  options: string[]
  /** 正确答案. */
  correctAnswer: string
  /** 你的作答；未作答为空字符串. */
  userAnswer: string
  /** 作答结果. */
  result: AttemptResult
  /** 错因（错题时填写），未填写为空字符串. */
  errorReason: string
  /** 笔记/反思，未填写为空字符串. */
  notes: string
  /** 来源，例如 2024湖北省考真题、某机构模拟卷；未填写为空字符串. */
  source: string
  /** 自由标签（可为空数组）. */
  tags: string[]
  /** ISO 8601 创建时间. */
  createdAt: string
  /** ISO 8601 更新时间. */
  updatedAt: string
}

/** A question view that carries its storage key as `id`. */
export interface Question extends QuestionRecord {
  id: string
}

/** Question difficulty. */
export type Difficulty = 'easy' | 'medium' | 'hard'

/** 题库题来源渠道：web=网页搜集（需审查），local=本地文件/手动提供（直接录入）. */
export type BankOrigin = 'web' | 'local'

/** 题库题审查状态. */
export type BankReviewStatus = 'pending' | 'approved' | 'rejected'

/** One stored bank question record; the id is the storage key, not a field. */
export interface BankQuestionRecord {
  subject: string
  knowledgePoint: string
  questionType: string
  stem: string
  options: string[]
  correctAnswer: string
  explanation: string
  difficulty: Difficulty
  source: string
  origin: BankOrigin
  reviewStatus: BankReviewStatus
  /** 审查意见（三要素核对结果）；未审查为空字符串. */
  reviewNotes: string
  tags: string[]
  createdAt: string
  /** 审查时间；未审查为空字符串. */
  reviewedAt: string
}

/** A bank question view that carries its storage key as `id`. */
export interface BankQuestion extends BankQuestionRecord {
  id: string
}

/** Knowledge entry kinds. */
export const KNOWLEDGE_KINDS = ['讲义', '笔记', '时政', '公式', '技巧', '真题解析', '其他'] as const

/** Knowledge entry kind. */
export type KnowledgeKind = typeof KNOWLEDGE_KINDS[number]

/** One stored knowledge entry record; the id is the storage key, not a field. */
export interface KnowledgeEntryRecord {
  subject: string
  /** 考点；科目级笔记为空字符串. */
  knowledgePoint: string
  title: string
  content: string
  kind: KnowledgeKind
  source: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

/** A knowledge entry view that carries its storage key as `id`. */
export interface KnowledgeEntry extends KnowledgeEntryRecord {
  id: string
}
