import type { PersonalWorkbench, WorkbenchAppDefinition, WorkbenchAppId, WorkbenchInstanceId } from './workbench-api.ts'

import type { AppLifecycleState } from './app-lifecycle-api.ts'
interface Geometry { x: number; y: number; width: number; height: number }
interface WindowPreference extends Geometry {
  appId: WorkbenchAppId; instanceId: WorkbenchInstanceId; pageId: string
  mode: 'normal' | 'maximized' | 'minimized' | 'closed'
  restoreMaximized: boolean
}
interface AppPreference { favorite: boolean; hidden: boolean; order: number }
interface Preferences { version: 1; visible: boolean; windows: WindowPreference[]; apps: Record<string, AppPreference> }
export interface WorkbenchSnapshot extends Preferences {
  readonly lifecycle: Readonly<Record<string, AppLifecycleState>>
  readonly lifecycleReady: boolean
  readonly lifecycleError: string | null
  readonly catalogTab: 'applications' | 'agents' | 'skills'
  readonly definitions: readonly WorkbenchAppDefinition[]
  readonly focused: string | null
  readonly focusRevision: number
  readonly storageFailed: boolean
}
/** Preference storage contains UI layout only. Session associations remain Host-owned. */
export interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const storageKey = 'personal-workbench.layout.v1'
const defaultInstance = 'default' as WorkbenchInstanceId

/** Collision-free identity for two independent stable IDs. */
export function windowKey(appId: WorkbenchAppId, instanceId: WorkbenchInstanceId): string {
  return JSON.stringify([appId, instanceId])
}
/** Resolve saved geometry against the current viewport, including narrow screens. */
export function constrainGeometry(value: Geometry, width: number, height: number): Geometry {
  const margin = width < 640 ? 0 : 12
  const availableWidth = Math.max(1, width - margin * 2)
  const availableHeight = Math.max(1, height - margin * 2)
  const resolvedWidth = width < 640 ? availableWidth : Math.min(availableWidth, Math.max(320, value.width))
  const resolvedHeight = width < 640 ? availableHeight : Math.min(availableHeight, Math.max(240, value.height))
  return { width: resolvedWidth, height: resolvedHeight,
    x: Math.min(Math.max(margin, value.x), width - margin - resolvedWidth),
    y: Math.min(Math.max(margin, value.y), height - margin - resolvedHeight) }
}

function readPreferences(storage?: PreferenceStorage): Preferences {
  const empty: Preferences = { version: 1, visible: false, windows: [], apps: Object.create(null) }
  if (!storage) return empty
  const raw = storage.getItem(storageKey)
  if (!raw) return empty
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('visible' in value) || typeof value.visible !== 'boolean'
    || !('windows' in value) || !Array.isArray(value.windows)
    || !('apps' in value) || !value.apps || typeof value.apps !== 'object') throw new Error('Invalid layout')
  const windows: WindowPreference[] = []
  const keys = new Set<string>()
  for (const row of value.windows) {
    if (!row || typeof row !== 'object' || typeof row.appId !== 'string' || !row.appId
      || typeof row.instanceId !== 'string' || !row.instanceId || typeof row.pageId !== 'string'
      || !['normal', 'maximized', 'minimized', 'closed'].includes(row.mode)
      || typeof row.restoreMaximized !== 'boolean'
      || !['x', 'y', 'width', 'height'].every(key => typeof row[key] === 'number' && Number.isFinite(row[key]))) continue
    const key = windowKey(row.appId, row.instanceId)
    if (keys.has(key)) continue
    keys.add(key)
    windows.push({ appId: row.appId, instanceId: row.instanceId, pageId: row.pageId, mode: row.mode,
      restoreMaximized: row.restoreMaximized, x: row.x, y: row.y, width: row.width, height: row.height })
  }
  for (const [id, row] of Object.entries(value.apps)) {
    if (!row || typeof row !== 'object' || !('favorite' in row) || typeof row.favorite !== 'boolean'
      || !('hidden' in row) || typeof row.hidden !== 'boolean'
      || !('order' in row) || typeof row.order !== 'number' || !Number.isFinite(row.order)) continue
    empty.apps[id] = { favorite: row.favorite, hidden: row.hidden, order: row.order }
  }
  return { ...empty, visible: value.visible, windows }
}

/** Registry and presentation lifecycle. Has no Session service or model dependency. */
export class Workbench implements PersonalWorkbench {
  private snapshot: WorkbenchSnapshot
  private readonly definitions = new Map<WorkbenchAppId, WorkbenchAppDefinition>()
  private readonly listeners = new Set<() => void>()
  private disposed = false
  constructor(private readonly storage?: PreferenceStorage, private readonly lifecycleLoader?: () => Promise<readonly AppLifecycleState[]>) {
    let preferences: Preferences
    let storageFailed = false
    try { preferences = readPreferences(storage) }
    catch (_error) { preferences = { version: 1, visible: false, windows: [], apps: Object.create(null) }; storageFailed = true }
    this.snapshot = { ...preferences, lifecycle: {}, lifecycleReady: !lifecycleLoader, lifecycleError: null, catalogTab: 'applications', definitions: [], focused: null, focusRevision: 0, storageFailed }
  }
  private loading?: Promise<void>
  readonly loadLifecycle = (): Promise<void> => {
    if(!this.lifecycleLoader) return Promise.resolve()
    if(this.loading) return this.loading
    const task=this.lifecycleLoader().then(states=>this.applyLifecycle(states)).catch(error=>{this.publish({lifecycleReady:false,lifecycleError:error instanceof Error?error.message:'Application availability unavailable'})})
    this.loading=task;void task.finally(()=>{if(this.loading===task)this.loading=undefined});return task
  }
  readonly applyLifecycle = (states: readonly AppLifecycleState[]): void => {
    const lifecycle=Object.fromEntries(states.map(row=>[row.appId,{...row}]))
    const focused=this.snapshot.windows.find(row=>windowKey(row.appId,row.instanceId)===this.snapshot.focused)
    this.publish({lifecycle,lifecycleReady:true,lifecycleError:null,...(focused && lifecycle[focused.appId]?.enabled===false?{focused:null}:{})})
  }
  readonly isEnabled = (appId: string): boolean => this.snapshot.lifecycleReady && this.snapshot.lifecycle[appId]?.enabled !== false
  readonly getSnapshot = (): WorkbenchSnapshot => this.snapshot
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  readonly registerApp = (definition: WorkbenchAppDefinition): (() => void) & { update: (next: WorkbenchAppDefinition) => void } => {
    if (this.disposed) throw new Error('Workbench is disposed')
    if (this.definitions.has(definition.id)) throw new Error(`Duplicate application: ${definition.id}`)
    const id = definition.id
    let active = true
    const update = (next: WorkbenchAppDefinition) => {
      if (!active || this.disposed) throw new Error('Application registration is disposed')
      if (next.id !== id) throw new Error('Application identity cannot change')
      if (!next.id || !next.pages.length || new Set(next.pages.map(page => page.id)).size !== next.pages.length
        || !next.pages.some(page => page.id === next.defaultLayout.pageId)) throw new Error('Invalid application pages')
      // Only the registration owner can update its frozen metadata without retiring windows.
      const current = Object.freeze({ ...next,
        pages: Object.freeze(next.pages.map(page => Object.freeze({ ...page }))),
        defaultLayout: Object.freeze({ ...next.defaultLayout }),
        roles: next.roles && Object.freeze(next.roles.map(role => Object.freeze({ ...role }))),
        dependencies: next.dependencies && Object.freeze(next.dependencies.map(row => Object.freeze({ ...row }))) })
      this.definitions.set(id, current)
      this.publish({ definitions: [...this.definitions.values()], windows: this.snapshot.windows.map(row =>
        row.appId === id && !current.pages.some(page => page.id === row.pageId)
          ? { ...row, pageId: current.defaultLayout.pageId } : row) })
    }
    update(definition)
    const remove = () => {
      if (!active || this.disposed) return
      active = false
      this.definitions.delete(id)
      const retired = this.snapshot.windows.filter(row => row.appId === id).map(row => windowKey(row.appId, row.instanceId))
      this.publish({ definitions: [...this.definitions.values()],
        windows: this.snapshot.windows.map(row => row.appId === id ? { ...row, mode: 'closed' } : row),
        focused: retired.includes(this.snapshot.focused ?? '') ? null : this.snapshot.focused })
    }
    return Object.assign(remove, { update })
  }
  readonly openWorkspace = (catalogTab: 'applications' | 'agents' | 'skills' = 'applications'): void => { this.publish({ visible: true, focused: null, catalogTab, focusRevision: this.snapshot.focusRevision + 1 }); void this.loadLifecycle() }
  readonly closeWorkspace = (): void => { this.publish({ visible: false }) }
  readonly openApp = (appId: WorkbenchAppId, instanceId = defaultInstance): void => {
    const definition = this.definitions.get(appId)
    if (!definition || this.disposed) throw new Error(`Application unavailable: ${appId}`)
    if(!this.isEnabled(appId)) {
      this.publish({visible:true,focused:null,lifecycleError:this.snapshot.lifecycleReady?'Application disabled; enable it in the application center':'Application availability is loading or unavailable'})
      if(!this.snapshot.lifecycleReady) void this.loadLifecycle()
      return
    }
    const key = windowKey(appId, instanceId)
    const found = this.snapshot.windows.find(row => windowKey(row.appId, row.instanceId) === key)
    const row: WindowPreference = found ? { ...found, mode: found.restoreMaximized ? 'maximized' : 'normal' } : {
      appId, instanceId, pageId: definition.defaultLayout.pageId, x: 40, y: 40,
      width: definition.defaultLayout.width, height: definition.defaultLayout.height, mode: 'normal', restoreMaximized: false }
    this.publish({ visible: true, catalogTab: 'applications', windows: [...this.snapshot.windows.filter(value => windowKey(value.appId, value.instanceId) !== key), row],
      focused: key, focusRevision: this.snapshot.focusRevision + 1 })
  }
  readonly focus = (key: string): void => {
    if (!this.snapshot.windows.some(row => windowKey(row.appId, row.instanceId) === key && this.isEnabled(row.appId) && row.mode !== 'closed' && row.mode !== 'minimized')) return
    this.publish({ focused: key, focusRevision: this.snapshot.focusRevision + 1 })
  }
  readonly setMode = (key: string, mode: WindowPreference['mode']): void => {
    this.updateWindow(key, row => ({ ...row, mode,
      restoreMaximized: mode === 'maximized' || ((mode === 'minimized' || mode === 'closed') && row.restoreMaximized) }))
    if (mode === 'closed' || mode === 'minimized') {
      const next = this.snapshot.windows.filter(row => row.mode !== 'closed' && row.mode !== 'minimized'
        && this.definitions.has(row.appId) && this.isEnabled(row.appId)).at(-1)
      this.publish({ focused: next ? windowKey(next.appId, next.instanceId) : null, focusRevision: this.snapshot.focusRevision + 1 })
    }
  }
  readonly selectPage = (key: string, pageId: string): void => {
    this.updateWindow(key, row => {
      if (!this.definitions.get(row.appId)?.pages.some(page => page.id === pageId)) throw new Error(`Page unavailable: ${pageId}`)
      return { ...row, pageId }
    })
  }
  readonly setGeometry = (key: string, geometry: Geometry): void => { this.updateWindow(key, row => ({ ...row, ...geometry })) }
  readonly setPreference = (appId: WorkbenchAppId, preference: Partial<AppPreference>): void => {
    if (!this.definitions.has(appId)) throw new Error(`Application unavailable: ${appId}`)
    const current = this.snapshot.apps[appId] ?? { favorite: false, hidden: false, order: 0 }
    this.publish({ apps: { ...this.snapshot.apps, [appId]: { ...current, ...preference } } })
  }
  /** Stop notifications and clear live registrations without touching Sessions or stored layout. */
  dispose(): void { this.disposed = true; this.listeners.clear(); this.definitions.clear(); this.snapshot = { ...this.snapshot, definitions: [], windows: [], focused: null, visible: false } }
  private updateWindow(key: string, update: (row: WindowPreference) => WindowPreference): void {
    this.publish({ windows: this.snapshot.windows.map(row => windowKey(row.appId, row.instanceId) === key ? update(row) : row) })
  }
  private publish(patch: Partial<WorkbenchSnapshot>): void {
    if (this.disposed) return
    this.snapshot = { ...this.snapshot, ...patch }
    try {
      this.storage?.setItem(storageKey, JSON.stringify({ version: 1, visible: this.snapshot.visible,
        windows: this.snapshot.windows, apps: this.snapshot.apps }))
    } catch (_error) { this.snapshot = { ...this.snapshot, storageFailed: true } }
    for (const listener of [...this.listeners]) {
      try { listener() } catch (error) { console.error('personal-workbench observer failed', error) }
    }
  }
}
