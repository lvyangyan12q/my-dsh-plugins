import { createContext, useContext, useState, useSyncExternalStore } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PersonalWorkbench, PersonalWorkbenchRoles } from '@deepseek-ai/dsh-personal-workbench/client'
import type { DashboardData, PracticeData, PracticeContext, PracticeResult, ModuleSummary } from './kaogong-view.tsx'
import type { Entry } from './knowledge-reader.tsx'

/** Fixed types and namespaces for the default instance's transient values. */
type ViewValues = {
  dashboard: DashboardData | null; loading: boolean; error: string | null; notice: string | null
  practice: PracticeData | null; practiceItem: PracticeContext | null; answers: Record<string, string>
  result: PracticeResult | null; seenQuestionIds: string[]; errorReasons: Record<string, string>
  moduleSummary: ModuleSummary | null; submitting: boolean
  'reader.query': string; 'reader.entries': Entry[]; 'reader.selected': string; 'reader.entry': Entry | null
  'reader.error': string; 'reader.loading': boolean
  integration: { service: PersonalWorkbench } | null; open: boolean
  teacherHandoff: { prompt: string; copied: boolean } | null
  roles: PersonalWorkbenchRoles | null
}
type Cell<T> = { value: T; listeners: Set<() => void>; set: Dispatch<SetStateAction<T>> }

/** Plugin-owned transient learning state, retained across optional view disposal. */
export class KaogongViewState {
  private cells = new Map<string, unknown>()
  private requests = new Map<string, number>()

  /** Supersede earlier reads while allowing a pending practice command to survive view transfer. */
  request(key: 'dashboard' | 'practice') {
    const generation = (this.requests.get(key) ?? 0) + 1
    this.requests.set(key, generation)
    return () => this.requests.get(key) === generation
  }

  /** Get one typed cell; each application-owned key has one fixed value type. */
  cell<K extends keyof ViewValues>(key: K, initial: ViewValues[K]): Cell<ViewValues[K]> {
    if (!this.cells.has(key)) {
      const cell: Cell<ViewValues[K]> = { value: initial, listeners: new Set<() => void>(), set: action => {
        cell.value = typeof action === 'function' ? action(cell.value) : action
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
