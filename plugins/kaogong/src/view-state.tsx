import { createContext, useContext, useState, useSyncExternalStore } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { DisplayStore, PersonalWorkbench, PersonalWorkbenchRoles, PersonalWorkbenchTasks, RoleBindingKey } from '@deepseek-ai/dsh-personal-workbench/client'
import type { DashboardData, PracticeData, PracticeContext, PracticeResult, ModuleSummary } from './kaogong-view.tsx'
import type { Entry } from './knowledge-reader.tsx'
import type { LessonView } from './lesson-schema.ts'
import { readLearningPreferences, writeLearningPreferences } from './learning-preferences.ts'

/** Fixed types and namespaces for the default instance's transient values. */
type ViewValues = {
  dashboard: DashboardData | null; loading: boolean; error: string | null; notice: string | null
  practice: PracticeData | null; practiceItem: PracticeContext | null; answers: Record<string, string>
  result: PracticeResult | null; seenQuestionIds: string[]; errorReasons: Record<string, string>
  moduleSummary: ModuleSummary | null; submitting: boolean
  practiceRestored: boolean; practiceBusy: boolean; reflectionNotes: Record<string, string>
  practiceHistory: { roundId: string; context: PracticeContext; createdAt: string; submitted: boolean }[]
  'reader.store': DisplayStore | null; 'review.admitted': string[]
  'reader.query': string; 'reader.entries': Entry[]; 'reader.selected': string; 'reader.entry': Entry | null
  'reader.error': string; 'reader.loading': boolean
  integration: { service: PersonalWorkbench } | null; open: boolean
  teacherHandoff: { prompt: string; copied: boolean } | null
  roles: PersonalWorkbenchRoles | null; tasks: PersonalWorkbenchTasks | null
  'study.open': boolean; 'study.page': string; 'study.pane': 'content' | 'conversation'
  'roles.selected': RoleBindingKey
  'roles.opened': RoleBindingKey[]
  'lesson.view': LessonView | null
  'lesson.list': { id: string; subject: string; objective: string; completed: boolean; updatedAt: string }[]
  'lesson.draft': { id: string; subject: string; objective: string; knowledgePoint: string; reflections: boolean; material: boolean; legacyNoteId: string }
  'lesson.form': boolean; 'lesson.notes': string; 'lesson.notesDirty': boolean; 'lesson.error': string; 'lesson.busy': boolean; 'lesson.confirmed': boolean
}
type Cell<T> = { value: T; listeners: Set<() => void>; set: Dispatch<SetStateAction<T>> }

/** Plugin-owned transient learning state, retained across optional view disposal. */
export class KaogongViewState {
  private cells = new Map<string, unknown>()
  private requests = new Map<string, number>()
  private practiceCommand = false
  constructor() {
    const saved = readLearningPreferences()
    if (!saved) return
    this.cell('study.open', saved.studyOpen)
    this.cell('study.page', saved.page)
    this.cell('study.pane', saved.pane)
    this.cell('roles.selected', { appId: 'kaogong', instanceId: 'default', ...saved.role })
  }

  private saveDisplayChoices() {
    const selected = this.cell('roles.selected', { appId: 'kaogong', instanceId: 'default', roleId: 'teacher' }).value
    if (!selected || selected.appId !== 'kaogong' || selected.instanceId !== 'default') return
    const page = this.cell('study.page', 'classroom').value
    if (page !== 'classroom' && page !== 'materials' && page !== 'practice' && page !== 'errors') return
    const roleId = selected.roleId
    if (roleId !== 'teacher' && roleId !== 'class-advisor' && roleId !== 'counselor') return
    writeLearningPreferences({ version: 1, studyOpen: this.cell('study.open', false).value, page,
      pane: this.cell('study.pane', 'content').value,
      role: { roleId, ...(selected.subject ? { subject: selected.subject } : {}) } })
  }
  /** Acquire the shared practice command owner synchronously before React rerenders. */
  beginPracticeCommand(): (() => void) | null {
    if (this.practiceCommand) return null
    this.practiceCommand = true
    return () => { this.practiceCommand = false }
  }

  /** Supersede earlier reads while allowing a pending practice command to survive view transfer. */
  request(key: 'dashboard' | 'practice' | 'lesson') {
    const generation = (this.requests.get(key) ?? 0) + 1
    this.requests.set(key, generation)
    return () => this.requests.get(key) === generation
  }

  /** Get one typed cell; each application-owned key has one fixed value type. */
  cell<K extends keyof ViewValues>(key: K, initial: ViewValues[K]): Cell<ViewValues[K]> {
    if (!this.cells.has(key)) {
      const cell: Cell<ViewValues[K]> = { value: initial, listeners: new Set<() => void>(), set: action => {
        cell.value = typeof action === 'function' ? action(cell.value) : action
        if (key === 'study.open' || key === 'study.page' || key === 'study.pane' || key === 'roles.selected') this.saveDisplayChoices()
        for (const listener of cell.listeners) listener()
      } }
      this.cells.set(key, cell)
    }
    // Heterogeneous cells are private; callers keep a fixed type for each key.
    return this.cells.get(key)! as Cell<ViewValues[K]>
  }
}

export const KaogongStateContext = createContext<KaogongViewState | null>(null)

/** Retain a business value in the plugin owner, or locally for standalone consumers. */
export function useBusinessState<K extends keyof ViewValues>(key: K, initial: ViewValues[K]): [ViewValues[K], Dispatch<SetStateAction<ViewValues[K]>>] {
  const shared = useContext(KaogongStateContext)
  const [local] = useState(() => new KaogongViewState())
  const cell = (shared ?? local).cell(key, initial)
  const value = useSyncExternalStore(listener => {
    cell.listeners.add(listener)
    return () => { cell.listeners.delete(listener) }
  }, () => cell.value)
  return [value, cell.set]
}

/** Resolve the same request owner for both standalone and workbench views. */
export function useRequestOwner() {
  const shared = useContext(KaogongStateContext)
  const [local] = useState(() => new KaogongViewState())
  return shared ?? local
}
