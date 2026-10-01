import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Structural identity. Ticket 06 supports only kaogong/default/teacher without subject. */
export interface RoleBindingKey { readonly appId: string; readonly instanceId: string; readonly roleId: string; readonly subject?: string }
/** Durable creation intent survives failures before and after native Session creation. */
export interface RoleBinding {
  readonly version: 1
  readonly key: RoleBindingKey
  readonly sessionId: SessionId
  readonly presetId: string
  readonly phase: 'intent' | 'ready'
  readonly previousSessionIds: readonly SessionId[]
}
/** Host-owned identity operations; none cancel, archive or delete a Session. */
export interface PersonalWorkbenchBindings {
  /** Read only, never create. @param key - supported binding key. @returns current intent/record or null. */
  read(key: RoleBindingKey): Promise<RoleBinding | null>
  /** User-authorized create/resume. @param key - supported key. @returns persisted ready binding. */
  ensure(key: RoleBindingKey): Promise<RoleBinding>
  /** Retry exactly the current intent ID. @param key - supported key. @param expectedSessionId - stale-call guard. @returns ready binding. */
  retry(key: RoleBindingKey, expectedSessionId: SessionId): Promise<RoleBinding>
  /** Explicit replacement retains prior IDs. @param key - supported key. @param expectedSessionId - current ID guard. @returns new ready binding. */
  replace(key: RoleBindingKey, expectedSessionId: SessionId): Promise<RoleBinding>
}
/** User evidence, never system instructions; no unsubmitted answers are included. */
export interface TeachingEvidence {
  readonly kind: 'lesson' | 'review'
  readonly context: { readonly subject: string; readonly title: string; readonly knowledgePoint?: string; readonly limit: number; readonly planIndex?: number }
  readonly material?: { readonly id: string; readonly title: string; readonly source: string; readonly content: string }
  readonly result?: { readonly total: number; readonly correct: number; readonly accuracy: number; readonly results: readonly { readonly id: string; readonly knowledgePoint: string; readonly correct: boolean; readonly correctAnswer: string; readonly explanation: string }[] }
}
/** Optional Client service; open only reacquires, teaching is an explicit user command. */
export interface PersonalWorkbenchRoles {
  open(key: RoleBindingKey): Promise<void>
  retry(key: RoleBindingKey, expectedSessionId: SessionId): Promise<void>
  replace(key: RoleBindingKey, expectedSessionId: SessionId): Promise<void>
  teach(key: RoleBindingKey, evidence: TeachingEvidence): Promise<void>
}
declare module '@deepseek-ai/cordis' {
  interface Context { personalWorkbenchBindings: PersonalWorkbenchBindings; personalWorkbenchRoles: PersonalWorkbenchRoles }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap { 'personal-workbench.role-native': { kind: 'single'; scope: 'session' } }
  interface SlotFactoryMap {
    'personal-workbench.role-conversation': { scope: 'root'; props: { readonly bindingKey: RoleBindingKey; readonly active: boolean }; children: { 'personal-workbench.role-native': { kind: 'single'; scope: 'session' } } }
  }
}
