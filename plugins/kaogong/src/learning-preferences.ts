import { TAXONOMY } from './taxonomy.ts'

const storageKey = (instanceId:string,viewId?:string)=>instanceId==='default'?'kaogong/default/learning-view/v1':`kaogong/instances/${encodeURIComponent(instanceId)}/${viewId?'views/'+encodeURIComponent(viewId)+'/':''}learning-view/v1`
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
export function readLearningPreferences(instanceId='default',viewId?:string): LearningPreferences | null {
  try {
    const raw = window.localStorage.getItem(storageKey(instanceId,viewId))
    return !raw || raw.length > 4096 ? null : validate(JSON.parse(raw))
  } catch { return null }
}

export function writeLearningPreferences(value: LearningPreferences,instanceId='default',viewId?:string): void {
  const validated = validate(value)
  if (!validated) return
  try { window.localStorage.setItem(storageKey(instanceId,viewId), JSON.stringify(validated)) }
  catch { /* Disabled or full browser storage must not prevent learning navigation. */ }
}

/** Profile-owned display preference, independent of the currently open role/Session. */
const teacherSubjectKey=(instanceId:string)=>`kaogong/instances/${encodeURIComponent(instanceId)}/teacher-subject/v1`
export function readTeacherSubject(instanceId:string):string|null {
  try{const value=window.localStorage.getItem(teacherSubjectKey(instanceId));return value!==null&&(value===''||TAXONOMY.some(row=>row.subject===value))?value:null}catch{return null}
}
export function writeTeacherSubject(instanceId:string,value:string){
  if(value!==''&&!TAXONOMY.some(row=>row.subject===value))return
  try{window.localStorage.setItem(teacherSubjectKey(instanceId),value)}catch{/* Navigation works without browser persistence. */}
}
