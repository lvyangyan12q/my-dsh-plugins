import { randomUUID } from 'node:crypto'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PersonalWorkbenchBindings, RoleBinding, RoleBindingKey } from './role-binding-api.ts'

/** One complete structural key, including the absence of a subject. */
export function bindingKey(key: RoleBindingKey): string { return JSON.stringify([key.appId, key.instanceId, key.roleId, key.subject ?? null]) }
/** Ticket-local support policy; the stored tuple is extensible for ticket 07. */
export function assertTeacherKey(key: RoleBindingKey): void {
  if (key.appId !== 'kaogong' || key.instanceId !== 'default' || key.roleId !== 'teacher' || key.subject !== undefined) throw new Error('Unsupported role binding')
}
interface Authority {
  presetId: string
  validate(): Promise<void>
  validateExisting?(record: RoleBinding): Promise<void>
  create(record: RoleBinding): Promise<SessionId>
}
/** One table owner, serialized per key, with durable intent before native commands. */
export class RoleBindings implements PersonalWorkbenchBindings {
  private readonly pending = new Map<string, Promise<unknown>>()
  private disposed = false
  private closed = false
  constructor(private readonly table: Pick<KvTable<string, RoleBinding>, 'get' | 'put'>, private readonly authority: Authority,
    private readonly allocate: () => SessionId = () => randomUUID() as SessionId) {}
  async read(key: RoleBindingKey): Promise<RoleBinding | null> {
    assertTeacherKey(key)
    if (this.disposed) throw new Error('Role bindings unavailable')
    const row = this.table.get(bindingKey(key))
    if (row && bindingKey(row.key) !== bindingKey(key)) throw new Error('Stored role key mismatch')
    return row ?? null
  }
  ensure(key: RoleBindingKey): Promise<RoleBinding> { return this.serial(key, () => this.finish(key)) }
  retry(key: RoleBindingKey, expectedSessionId: SessionId): Promise<RoleBinding> {
    return this.serial(key, async () => { await this.expected(key, expectedSessionId); return this.finish(key) })
  }
  replace(key: RoleBindingKey, expectedSessionId: SessionId): Promise<RoleBinding> {
    return this.serial(key, async () => {
      const old = await this.expected(key, expectedSessionId)
      await this.authority.validate()
      const next = this.intent(key, [...old.previousSessionIds, old.sessionId])
      await this.table.put(bindingKey(key), next)
      return this.finish(key)
    })
  }
  /** Stop admission and await all native commands before the domain owner closes its handle. */
  async dispose(): Promise<void> { this.disposed = true; await Promise.allSettled([...this.pending.values()]); this.closed = true }
  private async expected(key: RoleBindingKey, id: SessionId): Promise<RoleBinding> {
    const row = this.current(key)
    if (!row || row.sessionId !== id) throw new Error('Role binding changed; refresh before retry or replacement')
    return row
  }
  private intent(key: RoleBindingKey, previousSessionIds: readonly SessionId[]): RoleBinding {
    return { version: 1, key: { ...key }, sessionId: this.allocate(), presetId: this.authority.presetId, phase: 'intent', previousSessionIds }
  }
  private async finish(key: RoleBindingKey): Promise<RoleBinding> {
    let record = this.current(key)
    if (record && record.presetId !== this.authority.presetId) throw new Error('Recorded teacher preset unavailable')
    await this.authority.validate()
    if (record?.phase === 'ready') { await this.authority.validateExisting?.(record); return record }
    if (!record) { record = this.intent(key, []); await this.table.put(bindingKey(key), record) }
    if (record.presetId !== this.authority.presetId) throw new Error('Recorded teacher preset unavailable')
    const id = await this.authority.create(record)
    if (id !== record.sessionId) throw new Error('Native Session identity mismatch')
    const ready: RoleBinding = { ...record, phase: 'ready' }
    await this.table.put(bindingKey(key), ready)
    return ready
  }
  private serial(key: RoleBindingKey, operation: () => Promise<RoleBinding>): Promise<RoleBinding> {
    assertTeacherKey(key)
    if (this.disposed) return Promise.reject(new Error('Role bindings unavailable'))
    const name = bindingKey(key)
    const prior = this.pending.get(name) ?? Promise.resolve()
    const current = prior.catch(() => {}).then(operation)
    this.pending.set(name, current)
    void current.finally(() => { if (this.pending.get(name) === current) this.pending.delete(name) }).catch(() => {})
    return current
  }
  private current(key: RoleBindingKey): RoleBinding | null {
    if (this.closed) throw new Error('Role bindings unavailable')
    const row = this.table.get(bindingKey(key))
    if (row && bindingKey(row.key) !== bindingKey(key)) throw new Error('Stored role key mismatch')
    return row ?? null
  }
}
