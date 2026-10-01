import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PersonalWorkbenchBindings, RoleBinding, RoleBindingKey, RoleDefinition } from './role-binding-api.ts'

/** One complete structural key, including the absence of a subject. */
export function bindingKey(key: RoleBindingKey): string { return JSON.stringify([key.appId, key.instanceId, key.roleId, key.subject ?? null]) }
export interface Authority {
  validate(definition: RoleDefinition): Promise<void>
  validateExisting?(record: RoleBinding): Promise<void>
  create(record: RoleBinding): Promise<SessionId>
}
/** One table owner, serialized per key, with durable intent before native commands. */
export class RoleBindings implements PersonalWorkbenchBindings {
  private readonly pending = new Map<string, Promise<unknown>>()
  private disposed = false
  private closed = false
  private readonly definitions = new Map<string, RoleDefinition>()
  constructor(private readonly table: Pick<KvTable<string, RoleBinding>, 'get' | 'put'>, private readonly authority: Authority,
    private readonly allocate: () => SessionId = () => randomUUID() as SessionId) {}
  registerRole(definition: RoleDefinition): () => void {
    if (this.disposed) throw new Error('Role bindings unavailable')
    const key = bindingKey(definition.key)
    if (!definition.key.appId || !definition.key.instanceId || !definition.key.roleId || !definition.presetId || definition.key.subject === '') throw new Error('Invalid role declaration')
    if (definition.creation && !isAbsolute(definition.creation.cwd)) throw new Error('Role creation cwd must be absolute')
    if (this.definitions.has(key)) throw new Error('Role already registered')
    const owned = Object.freeze({ ...definition, key: Object.freeze({ ...definition.key }), ...(definition.creation ? { creation: Object.freeze({ ...definition.creation }) } : {}), ...(definition.teaching ? { teaching: Object.freeze({ ...definition.teaching }) } : {}), ...(definition.display ? { display: Object.freeze({ ...definition.display }) } : {}) })
    this.definitions.set(key, owned)
    return () => { if (this.definitions.get(key) === owned) this.definitions.delete(key) }
  }
  definition(key: RoleBindingKey): RoleDefinition {
    const definition = this.definitions.get(bindingKey(key))
    if (!definition) throw new Error('Role declaration unavailable')
    return definition
  }
  listRoles(): readonly RoleDefinition[] { return [...this.definitions.values()] }
  async read(key: RoleBindingKey): Promise<RoleBinding | null> {
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
      const definition = this.definition(key)
      await this.authority.validate(definition)
      const next = this.intent(definition, [...old.previousSessionIds, old.sessionId])
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
  private intent(definition: RoleDefinition, previousSessionIds: readonly SessionId[]): RoleBinding {
    if (!definition.creation) throw new Error('Explicit role creation cwd required')
    return { version: 1, key: { ...definition.key }, sessionId: this.allocate(), presetId: definition.presetId, phase: 'intent', previousSessionIds, creation: { ...definition.creation } }
  }
  private async finish(key: RoleBindingKey): Promise<RoleBinding> {
    let record = this.current(key)
    const definition = this.definition(key)
    if (record && record.presetId !== definition.presetId) throw new Error('Recorded role preset unavailable')
    await this.authority.validate(definition)
    if (record?.phase === 'ready') { await this.authority.validateExisting?.(record); return record }
    if (!record) { record = this.intent(definition, []); await this.table.put(bindingKey(key), record) }
    const id = await this.authority.create(record)
    if (id !== record.sessionId) throw new Error('Native Session identity mismatch')
    const ready: RoleBinding = { ...record, phase: 'ready' }
    await this.table.put(bindingKey(key), ready)
    return ready
  }
  private serial(key: RoleBindingKey, operation: () => Promise<RoleBinding>): Promise<RoleBinding> {
    this.definition(key)
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
