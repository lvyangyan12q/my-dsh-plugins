import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PersonalWorkbenchRoles, RoleBinding, RoleBindingKey, TeachingEvidence, RoleViewState } from './role-binding-api.ts'
import { TeacherWindow, parseAssociation } from './teacher-window.ts'

export interface RoleSnapshot { binding: RoleBinding | null; error: string | null; busy: boolean }
/** Parse network metadata, retaining the exact durable ID rather than inferring one. */
export function parseRoleBinding(value: unknown, key: RoleBindingKey): RoleBinding | null {
  if (value === null) return null
  if (typeof value !== 'object' || !value || !('key' in value) || typeof value.key !== 'object' || !value.key
    || !('appId' in value.key) || value.key.appId !== key.appId || !('instanceId' in value.key) || value.key.instanceId !== key.instanceId
    || !('roleId' in value.key) || value.key.roleId !== key.roleId || ('subject' in value.key ? value.key.subject : undefined) !== key.subject
    || !('presetId' in value) || typeof value.presetId !== 'string' || !value.presetId
    || !('phase' in value) || (value.phase !== 'ready' && value.phase !== 'intent')
    || !('previousSessionIds' in value) || !Array.isArray(value.previousSessionIds) || !value.previousSessionIds.every(id => typeof id === 'string' && id)) throw new Error('Invalid teacher binding response')
  return { version: 1, key: { ...key }, sessionId: parseAssociation(value), presetId: value.presetId, phase: value.phase,
    previousSessionIds: value.previousSessionIds.map(id => id as SessionId),
    ...('creation' in value && value.creation && typeof value.creation === 'object' && 'cwd' in value.creation && typeof value.creation.cwd === 'string' ? { creation: { cwd: value.creation.cwd } } : {}) }
}

/** One key's owner. Closing a view is not cancelling the native Session. */
export class RoleClient implements PersonalWorkbenchRoles {
  private snapshot: RoleSnapshot = { binding: null, error: null, busy: false }
  private listeners = new Set<() => void>()
  private disposed = false
  private abort = new AbortController()
  private pending: Promise<void> | undefined
  readonly teacher: TeacherWindow
  constructor(private readonly ctx: Pick<Context, 'sessions' | 'workspaces'>,
    private readonly request: typeof fetch = fetch) {
    this.teacher = new TeacherWindow(ctx.sessions, async () => {
      if (!this.snapshot.binding || this.snapshot.binding.phase !== 'ready') throw new Error('Teacher binding unavailable')
      return this.snapshot.binding.sessionId
    }, ctx.workspaces.list)
  }
  readonly getSnapshot = () => this.snapshot
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  readonly open = (key: RoleBindingKey) => this.run(async () => {
    const response = await this.call('read', key)
    this.adopt(parseRoleBinding(response.binding, key))
    if (this.snapshot.binding?.phase === 'ready') await this.teacher.open()
  })
  readonly ensure = (key: RoleBindingKey) => this.run(async () => {
    const response = await this.call('ensure', key)
    this.adopt(parseRoleBinding(response.binding, key))
    await this.teacher.open()
  })
  readonly retry = (key: RoleBindingKey, expectedSessionId: SessionId) => this.run(async () => {
    this.checkExpected(expectedSessionId)
    const response = await this.call('retry', key, { expectedSessionId })
    this.adopt(parseRoleBinding(response.binding, key))
    await this.teacher.retry(expectedSessionId)
    await this.teacher.open()
  })
  readonly replace = (key: RoleBindingKey, expectedSessionId: SessionId) => this.run(async () => {
    this.checkExpected(expectedSessionId)
    const response = await this.call('replace', key, { expectedSessionId })
    this.adopt(parseRoleBinding(response.binding, key))
    await this.teacher.open()
  })
  readonly attach = (key: RoleBindingKey, sessionId: SessionId, expectedSessionId: SessionId | null) => this.run(async () => {
    if ((this.snapshot.binding?.sessionId ?? null) !== expectedSessionId) throw new Error('Role binding changed; refresh before attachment')
    const response = await this.call('attach', key, { sessionId, expectedSessionId })
    this.adopt(parseRoleBinding(response.binding, key))
    await this.teacher.open()
  })
  readonly teach = (key: RoleBindingKey, evidence: TeachingEvidence) => this.run(async () => {
    const response = await this.call('teach', key, { evidence })
    const binding = parseRoleBinding(response.binding, key)
    if (!binding || binding.phase !== 'ready' || typeof response.prompt !== 'string' || !/^\/[a-z][a-z0-9-]* /.test(response.prompt)) throw new Error('Teacher preparation failed')
    this.adopt(binding)
    await this.teacher.open()
    if (this.disposed) return
    const current = this.teacher.getSnapshot()
    if (current.phase !== 'open' || current.reference.sessionId !== binding.sessionId) throw new Error('Teacher Session unavailable; retry the same ID or explicitly create a new teacher')
    const prompt = response.prompt
    await this.sendBound(binding, prompt)
  })
  readonly send = (key: RoleBindingKey, text: string) => this.sendPrepared(key,text,false)
  readonly sendTeaching = (key: RoleBindingKey, text: string) => this.sendPrepared(key,text,true)
  private sendPrepared(key: RoleBindingKey,text:string,teaching:boolean) { return this.run(async () => {
    if (!text.trim() || text.length > 100000) throw new Error('Invalid prepared task')
    // This Host preparation includes ensure and is authorized only by an explicit send.
    const response = await this.call(teaching?'prepare-teaching':'ensure', key)
    const binding = parseRoleBinding(response.binding, key)
    if (!binding || binding.phase !== 'ready') throw new Error('Role binding unavailable')
    this.adopt(binding)
    await this.teacher.open()
    if (this.disposed) throw new Error('Role owner disposed')
    if(teaching&&(typeof response.prompt!=='string'||!/^\/[a-z][a-z0-9-]* $/.test(response.prompt)))throw new Error('Trusted teaching preparation unavailable')
    await this.sendBound(binding, teaching?String(response.prompt)+text:text)
  }) }
  private async sendBound(binding: RoleBinding, prompt: string) {
    // A command owns its own exact hold through settlement, independent of the UI subtree.
    await this.ctx.sessions.using(binding.sessionId, { source: 'personalWorkbenchTeacher' }, async reference => {
      if (this.disposed) throw new Error('Role owner disposed')
      this.checkExpected(binding.sessionId)
      const archive = this.ctx.workspaces.list.getSnapshot()
      const session = reference.binding.session.getSnapshot()
      if (reference.sessionId !== binding.sessionId || archive.phase !== 'ready' || archive.state !== 'idle'
        || archive.archivedSessionIds.includes(binding.sessionId) || session.removed || session.openState !== 'open') throw new Error('Teacher Session unavailable')
      // The native binding inherits the Session controller's dependency API,
      // not this owner's inject declarations. Declare conversation on a child
      // of that exact scope; the Service tracker keeps its Session address.
      let send: Promise<void> | undefined
      const lease = reference.binding.ctx.inject(['conversation'], child => {
        // Service re-admission must not replay an already started command.
        if (send) return
        send = Promise.resolve().then(() => child.conversation.send(prompt))
        // Observe early rejection while Cordis finishes plugin admission.
        void send.catch(() => {})
      })
      try {
        await lease
        if (!send) throw new Error('Native teacher conversation service unavailable')
        await send
      } finally { await lease.dispose() }
    })
  }
  dispose() { this.disposed = true; this.abort.abort(); this.teacher.dispose(); this.listeners.clear() }
  private checkExpected(id: SessionId) { if (this.snapshot.binding?.sessionId !== id) throw new Error('Teacher binding changed; refresh before retry or replacement') }
  private adopt(binding: RoleBinding | null) {
    if (this.disposed) return
    if (this.snapshot.binding?.sessionId !== binding?.sessionId) this.teacher.close()
    this.publish({ ...this.snapshot, binding })
  }
  private async call(action: string, key: RoleBindingKey, extra: object = {}): Promise<Record<string, unknown>> {
    if (!key.appId || !key.instanceId || !key.roleId || key.subject === '') throw new Error('Invalid role binding')
    // Native browser fetch cannot be invoked with this RoleClient as its receiver.
    const request = this.request
    const response = await request('/api/personal-workbench/roles', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: this.abort.signal,
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, key, ...extra }) }).catch(() => { throw new Error('Teacher service unavailable') })
    if (response.status === 401 || response.status === 403) throw new Error('Teacher authentication required')
    if (response.status === 404 || response.status === 503) throw new Error('Teacher service unavailable')
    let value: unknown
    try { value = await response.json() } catch { throw new Error('Teacher service unavailable: invalid response') }
    if (typeof value !== 'object' || !value) throw new Error('Teacher service unavailable')
    if (!response.ok) {
      if ('binding' in value && value.binding !== null) this.adopt(parseRoleBinding(value.binding, key))
      throw new Error('error' in value && typeof value.error === 'string' ? value.error : 'Teacher service unavailable')
    }
    return value as Record<string, unknown>
  }
  private run(operation: () => Promise<void>): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Teacher owner disposed'))
    if (this.pending) return Promise.reject(new Error('Teacher operation already in progress'))
    this.publish({ ...this.snapshot, busy: true, error: null })
    const pending = operation().catch(error => {
      if (!this.disposed) this.publish({ ...this.snapshot, error: error instanceof Error ? error.message : 'Teacher operation failed' })
      throw error
    }).finally(() => { this.pending = undefined; if (!this.disposed) this.publish({ ...this.snapshot, busy: false }) })
    this.pending = pending
    return pending
  }
  private publish(snapshot: RoleSnapshot) { this.snapshot = snapshot; for (const listener of this.listeners) listener() }
}

export function roleKey(key: RoleBindingKey): string { return JSON.stringify([key.appId, key.instanceId, key.roleId, key.subject ?? null]) }
/** Client lifetime owns one independent UI/command owner per full key, not per selected tab. */
export class RoleClients implements PersonalWorkbenchRoles {
  private readonly owners = new Map<string, RoleClient>()
  private disposed = false
  private snapshot: ReadonlyMap<string, RoleViewState> = new Map()
  private readonly listeners = new Set<() => void>()
  readonly getSnapshot = () => this.snapshot
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  readonly view = { getSnapshot: this.getSnapshot, subscribe: this.subscribe }
  private publish() {
    this.snapshot = new Map([...this.owners].map(([key, owner]) => [key, { ...owner.getSnapshot(), window: owner.teacher.getSnapshot() }]))
    for (const listener of this.listeners) listener()
  }
  constructor(private readonly ctx: Pick<Context, 'sessions' | 'workspaces'>, private readonly request: typeof fetch = fetch) {}
  owner(key: RoleBindingKey): RoleClient {
    if (this.disposed) throw new Error('Role owners disposed')
    const name = roleKey(key)
    let owner = this.owners.get(name)
    if (!owner) { owner = new RoleClient(this.ctx, this.request); this.owners.set(name, owner); owner.subscribe(() => this.publish()); owner.teacher.subscribe(() => this.publish()); this.publish() }
    return owner
  }
  open = (key: RoleBindingKey) => this.owner(key).open(key)
  ensure = (key: RoleBindingKey) => this.owner(key).ensure(key)
  retry = (key: RoleBindingKey, id: SessionId) => this.owner(key).retry(key, id)
  replace = (key: RoleBindingKey, id: SessionId) => this.owner(key).replace(key, id)
  attach = (key: RoleBindingKey, sessionId: SessionId, expectedSessionId: SessionId | null) => this.owner(key).attach(key, sessionId, expectedSessionId)
  sendTeaching = (key: RoleBindingKey, text: string) => this.owner(key).sendTeaching(key, text)
  send = (key: RoleBindingKey, text: string) => this.owner(key).send(key, text)
  teach = (key: RoleBindingKey, evidence: TeachingEvidence) => this.owner(key).teach(key, evidence)
  dispose() { this.disposed = true; this.listeners.clear(); for (const owner of this.owners.values()) owner.dispose(); this.owners.clear(); this.snapshot = new Map() }
}
