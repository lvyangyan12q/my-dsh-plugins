import type { ISessions, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceSource } from '@deepseek-ai/dsh-api-workspace-controller/client'

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { personalWorkbenchTeacher: unknown }
}

export type WindowSnapshot =
  | { readonly phase: 'closed' }
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly reason: 'association' | 'session' }
  | { readonly phase: 'open'; readonly reference: SessionReference }

/** Parse host metadata without guessing a replacement identity. */
export function parseAssociation(value: unknown): SessionId {
  if (typeof value !== 'object' || value === null
    || !('version' in value) || value.version !== 1
    || !('sessionId' in value) || typeof value.sessionId !== 'string'
    || value.sessionId.trim() === '' || value.sessionId !== value.sessionId.trim()) {
    throw new Error('Invalid teacher association')
  }
  return value.sessionId as SessionId
}

/** Own the explicit reference, asynchronous opening, and committed UI lifetime. */
export class TeacherWindow {
  private snapshot: WindowSnapshot = { phase: 'closed' }
  private readonly listeners = new Set<() => void>()
  private readonly references = new Map<SessionReference, number>()
  private generation = 0
  private disposed = false
  private request: AbortController | undefined
  private selectedId: SessionId | undefined
  private observers: (() => void)[] = []

  constructor(
    private readonly sessions: Pick<ISessions, 'retain'>,
    private readonly association: (signal: AbortSignal) => Promise<SessionId>,
    private readonly workspaces: WorkspaceSource,
  ) {}

  readonly getSnapshot = (): WindowSnapshot => this.snapshot
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Repeated open gestures share one acquisition; failures require an explicit retry. */
  readonly open = async (): Promise<void> => {
    if (this.disposed || this.snapshot.phase === 'open' || this.snapshot.phase === 'loading') return
    const generation = ++this.generation
    const request = new AbortController()
    this.request = request
    this.publish({ phase: 'loading' })
    let reference: SessionReference | undefined
    let reason: 'association' | 'session' = 'association'
    try {
      const id = this.selectedId ?? await this.association(request.signal)
      if (this.disposed || generation !== this.generation) return
      this.selectedId = id
      reason = 'session'
      if (!this.archiveReady()) await this.waitForArchive(request.signal)
      if (this.disposed || generation !== this.generation) return
      this.checkArchive(id)
      reference = this.sessions.retain(id, { source: 'personalWorkbenchTeacher' })
      this.references.set(reference, 0)
      await reference.ready
      if (this.disposed || generation !== this.generation) {
        this.release(reference)
        return
      }
      this.checkArchive(id)
      this.checkSession(reference)
      this.publish({ phase: 'open', reference })
      const published = this.getSnapshot()
      if (published.phase === 'open' && published.reference === reference) {
        const current = reference
        const invalidated = () => {
          if (this.snapshot.phase !== 'open' || this.snapshot.reference !== current) return
          try { this.checkArchive(id); this.checkSession(current) }
          catch { this.failOpen(current) }
        }
        this.observers.push(this.workspaces.subscribe(invalidated), current.binding.session.subscribe(invalidated))
        invalidated()
      }
    } catch (_error: unknown) {
      if (reference !== undefined) this.release(reference)
      if (!this.disposed && generation === this.generation) this.publish({ phase: 'error', reason })
    } finally {
      if (this.request === request) this.request = undefined
    }
  }

  /** Scoped recovery cannot adopt a newly configured or surrounding Session. */
  readonly retry = async (id: SessionId): Promise<void> => {
    if (this.disposed || id !== this.selectedId) return
    if (this.snapshot.phase === 'open') this.failOpen(this.snapshot.reference)
    if (this.snapshot.phase === 'error') await this.open()
  }

  /** Withdraw the render target first; release after the committed subtree unmounts. */
  readonly close = (): void => {
    ++this.generation
    this.request?.abort()
    this.request = undefined
    this.selectedId = undefined
    this.stopObserving()
    this.publish({ phase: 'closed' })
    for (const [reference, mounts] of this.references) {
      if (mounts === 0) this.release(reference)
    }
  }

  /** Hold a committed render root, including StrictMode's effect replay. */
  readonly mount = (reference: SessionReference): (() => void) => {
    if (!this.references.has(reference)) return () => {}
    this.references.set(reference, (this.references.get(reference) ?? 0) + 1)
    let mounted = true
    return () => {
      if (!mounted) return
      mounted = false
      if (!this.references.has(reference)) return
      const count = (this.references.get(reference) ?? 1) - 1
      this.references.set(reference, count)
      if (count === 0 && (this.snapshot.phase !== 'open' || this.snapshot.reference !== reference)) this.release(reference)
    }
  }

  /** Plugin teardown releases local references without calling cancel/archive/delete. */
  readonly dispose = (): void => {
    this.disposed = true
    this.close()
    for (const reference of this.references.keys()) this.release(reference)
    this.listeners.clear()
  }

  private release(reference: SessionReference): void {
    if (this.references.delete(reference)) reference.release()
  }

  private archiveReady(): boolean {
    const snapshot = this.workspaces.getSnapshot()
    return snapshot.phase === 'ready' && snapshot.state === 'idle'
  }

  private checkArchive(id: SessionId): void {
    if (!this.archiveReady() || this.workspaces.getSnapshot().archivedSessionIds.includes(id)) {
      throw new Error('Archive baseline unavailable or Session archived')
    }
  }

  private checkSession(reference: SessionReference): void {
    const snapshot = reference.binding.session.getSnapshot()
    if (snapshot.removed || snapshot.openState !== 'open') throw new Error('Session not accessible')
  }

  private waitForArchive(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {}
      const finish = (error?: Error) => {
        unsubscribe()
        signal.removeEventListener('abort', aborted)
        if (error) reject(error); else resolve()
      }
      const aborted = () => finish(new Error('Opening abandoned'))
      const changed = () => {
        if (signal.aborted) aborted()
        else if (this.workspaces.getSnapshot().state === 'error') finish(new Error('Archive baseline failed'))
        else if (this.archiveReady()) finish()
      }
      unsubscribe = this.workspaces.subscribe(changed)
      signal.addEventListener('abort', aborted, { once: true })
      changed()
    })
  }

  private stopObserving(): void {
    for (const unsubscribe of this.observers.splice(0)) unsubscribe()
  }

  private failOpen(reference: SessionReference): void {
    this.stopObserving()
    this.publish({ phase: 'error', reason: 'session' })
    if (this.references.get(reference) === 0) this.release(reference)
  }

  private publish(snapshot: WindowSnapshot): void {
    this.snapshot = snapshot
    for (const listener of [...this.listeners]) listener()
  }
}
