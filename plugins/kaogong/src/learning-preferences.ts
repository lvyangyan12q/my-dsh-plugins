import { TAXONOMY } from './taxonomy.ts'

const storageKey = 'kaogong/default/learning-view/v1'
export type LearningPreferences = {
  version: 1; studyOpen: boolean
  page: 'classroom' | 'materials' | 'practice' | 'errors'
  pane: 'content' | 'conversation'
  role: { roleId: 'class-advisor' | 'teacher' | 'counselor'; subject?: string }
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** No additional Client runtime dependency: only known, bounded display choices are restored. */
function validate(value: unknown): LearningPreferences | null {
  if (!record(value) || Object.keys(value).length !== 5 ||
    !Object.keys(value).every(key => ['version', 'studyOpen', 'page', 'pane', 'role'].includes(key))) return null
  const { version, studyOpen, page, pane, role } = value
  if (version !== 1 || typeof studyOpen !== 'boolean' ||
    (page !== 'classroom' && page !== 'materials' && page !== 'practice' && page !== 'errors') ||
    (pane !== 'content' && pane !== 'conversation') || !record(role) ||
    !Object.keys(role).every(key => key === 'roleId' || key === 'subject')) return null
  const { roleId, subject } = role
  if (roleId !== 'class-advisor' && roleId !== 'teacher' && roleId !== 'counselor') return null
  if (subject !== undefined && (roleId !== 'teacher' || typeof subject !== 'string' ||
    !TAXONOMY.some(row => row.subject === subject))) return null
  return { version, studyOpen, page, pane, role: { roleId, ...(typeof subject === 'string' ? { subject } : {}) } }
}

/** Display choices only. Native bindings, messages, drafts and business evidence stay with their owners. */
export function readLearningPreferences(): LearningPreferences | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    return !raw || raw.length > 4096 ? null : validate(JSON.parse(raw))
  } catch { return null }
}

export function writeLearningPreferences(value: LearningPreferences): void {
  const validated = validate(value)
  if (!validated) return
  try { window.localStorage.setItem(storageKey, JSON.stringify(validated)) }
  catch { /* Disabled or full browser storage must not prevent learning navigation. */ }
}
