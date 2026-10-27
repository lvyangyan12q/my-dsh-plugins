/** Model access is an explicit capability list. New tools stay page-only until audited. */
const readTools = new Set([
  'kaogong_list_questions', 'kaogong_analyze_errors', 'kaogong_summarize_weaknesses',
  'kaogong_taxonomy', 'kaogong_plan_view', 'kaogong_progress_status', 'kaogong_bank_list',
  'kaogong_knowledge_read', 'kaogong_knowledge_search',
  'kaogong_practice_read', 'kaogong_lesson_read',
])

export function modelToolAccess(name: string): 'read' | undefined {
  return readTools.has(name) ? 'read' : undefined
}

export function requireModelToolAccess(name: string): 'read' {
  const access = modelToolAccess(name)
  if (!access) throw Object.assign(new Error('LEARNER_PAGE_REQUIRED: 请在考公页面操作；模型确认不能替代学习者确认'), { code: 'LEARNER_PAGE_REQUIRED' })
  return access
}
