/** Model access is an explicit capability list. New tools stay page-only until audited. */
const readTools = new Set([
  'kaogong_list_questions', 'kaogong_analyze_errors', 'kaogong_summarize_weaknesses',
  'kaogong_taxonomy', 'kaogong_plan_view', 'kaogong_progress_status', 'kaogong_bank_list',
  'kaogong_knowledge_read', 'kaogong_knowledge_search',
  'kaogong_practice_read', 'kaogong_lesson_read',
])

// These handlers only persist an inert draft or return a suggestion. They never
// confirm a revision or complete a task; learner HTTP owns those operations.
const proposalTools = new Set(['kaogong_plan_set', 'kaogong_plan_done'])

export function modelToolAccess(name: string): 'read' | 'write' | undefined {
  return readTools.has(name) ? 'read' : proposalTools.has(name) ? 'write' : undefined
}

export function requireModelToolAccess(name: string): 'read' | 'write' {
  const access = modelToolAccess(name)
  if (!access) throw Object.assign(new Error('LEARNER_PAGE_REQUIRED: 请在考公页面操作；模型确认不能替代学习者确认'), { code: 'LEARNER_PAGE_REQUIRED' })
  return access
}
