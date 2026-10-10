import { z } from 'zod'
import { TAXONOMY } from './taxonomy.ts'

const storageKey = 'kaogong/default/learning-view/v1'
const preferences = z.object({
  version: z.literal(1), studyOpen: z.boolean(),
  page: z.enum(['classroom', 'materials', 'practice', 'errors']),
  pane: z.enum(['content', 'conversation']),
  role: z.object({ roleId: z.enum(['class-advisor', 'teacher', 'counselor']),
    subject: z.string().refine(value => TAXONOMY.some(row => row.subject === value)).optional(),
  }).strict().refine(role => role.roleId === 'teacher' || role.subject === undefined),
}).strict()
export type LearningPreferences = z.infer<typeof preferences>

/** Display choices only. Native bindings, messages, drafts and business evidence stay with their owners. */
export function readLearningPreferences(): LearningPreferences | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw || raw.length > 4096) return null
    const value = preferences.safeParse(JSON.parse(raw))
    return value.success ? value.data : null
  } catch { return null }
}

export function writeLearningPreferences(value: LearningPreferences): void {
  const validated = preferences.safeParse(value)
  if (!validated.success) return
  try { window.localStorage.setItem(storageKey, JSON.stringify(validated.data)) }
  catch { /* Disabled or full browser storage must not prevent learning navigation. */ }
}
