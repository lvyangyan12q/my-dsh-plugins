import type { ISessions, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

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

  constructor(
    private readonly sessions: Pick<ISessions, 'retain'>,
    private readonly association: (signal: AbortSignal) => Promise<SessionId>,
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
      const id = await this.association(request.signal)
      if (this.disposed || generation !== this.generation) return
      reason = 'session'
      reference = this.sessions.retain(id, { source: 'personalWorkbenchTeacher' })
      this.references.set(reference, 0)
      await reference.ready
      if (this.disposed || generation !== this.generation) {
        this.release(reference)
        return
      }
      // An archived/missing Session must never become a writable fake blank conversation.
      if (reference.binding.session.getSnapshot().openState !== 'open') throw new Error('Session not open')
      this.publish({ phase: 'open', reference })
    } catch (_error: unknown) {
      if (reference !== undefined) this.release(reference)
      if (!this.disposed && generation === this.generation) this.publish({ phase: 'error', reason })
    } finally {
      if (this.request === request) this.request = undefined
    }
  }

  /** Withdraw the render target first; release after the committed subtree unmounts. */
  readonly close = (): void => {
    ++this.generation
    this.request?.abort()
    this.request = undefined
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

  private publish(snapshot: WindowSnapshot): void {
    this.snapshot = snapshot
    for (const listener of [...this.listeners]) listener()
  }
}
