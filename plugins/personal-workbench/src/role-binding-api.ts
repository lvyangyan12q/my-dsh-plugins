import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { TeacherWindow, WindowSnapshot } from './teacher-window.ts'

/** Complete structural identity; absence of subject is a distinct legacy/default key. */
export interface RoleBindingKey { readonly appId: string; readonly instanceId: string; readonly roleId: string; readonly subject?: string }
/** App-owned declaration. Registration has no native Session or model side effects. */
export interface RoleDefinition {
  readonly key: RoleBindingKey
  readonly presetId: string
  readonly skillNames?: readonly string[]
  readonly creation?: { readonly cwd: string }
  readonly teaching?: { readonly skillName: string; readonly provider: string }
  readonly display?: { readonly name?: string; readonly source?: string; readonly bundleName?: string }
}
/** Durable creation intent survives failures before and after native Session creation. */
export interface RoleBinding {
  readonly version: 1
  readonly key: RoleBindingKey
  readonly sessionId: SessionId
  readonly presetId: string
  readonly selectedPreset?: boolean
  readonly phase: 'intent' | 'ready'
  readonly previousSessionIds: readonly SessionId[]
  readonly creation?: { readonly cwd: string }
}
/** Host-owned identity operations; none cancel, archive or delete a Session. */
export interface PersonalWorkbenchBindings {
  /** Register exactly one key. Duplicate registrations reject; dispose withdraws only its declaration. */
  registerRole(definition: RoleDefinition): () => void
  /** Bind an existing, validated native Session without creating or sending. */
  attach?(key: RoleBindingKey, sessionId: SessionId, expectedSessionId: SessionId | null): Promise<RoleBinding>
  setPreset?(key: RoleBindingKey, presetId: string, expectedSessionId: SessionId | null): Promise<RoleBinding>
  /** Current app-owned declarations only; withdrawal does not erase durable bindings. */
  listRoles(): readonly RoleDefinition[]
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
  readonly view?: HostObservable<ReadonlyMap<string, RoleViewState>>
  open(key: RoleBindingKey): Promise<void>
  /** Explicit user action creates/resumes, never sends a prompt. */
  ensure(key: RoleBindingKey): Promise<void>
  retry(key: RoleBindingKey, expectedSessionId: SessionId): Promise<void>
  replace(key: RoleBindingKey, expectedSessionId: SessionId): Promise<void>
  /** Explicit attachment preserves native history and sends no message. */
  attach?(key: RoleBindingKey, sessionId: SessionId, expectedSessionId: SessionId | null): Promise<void>
  send(key: RoleBindingKey, text: string): Promise<void>
  /** Explicit prepared teaching command; Host validates the declared trusted teaching Skill. */
  sendTeaching(key: RoleBindingKey, text: string): Promise<void>
  teach(key: RoleBindingKey, evidence: TeachingEvidence): Promise<void>
}
/** Read-only Client view facts; native drafts remain owned by the native composer. */
export interface RoleViewState { readonly binding: RoleBinding | null; readonly error: string | null; readonly busy: boolean; readonly window: WindowSnapshot }
export interface RoleViewInjected {
  /** Open a retained prior Session in native navigation without changing the current role binding. */
  readonly openHistory?: (sessionId: SessionId) => void
  readonly hooks: { readonly roles: HostObservable<ReadonlyMap<string, RoleViewState>> }
  readonly commands: PersonalWorkbenchRoles
  readonly mountRole: (key: RoleBindingKey, reference: SessionReference) => () => void
}
declare module '@deepseek-ai/cordis' {
  interface Context { personalWorkbenchBindings: PersonalWorkbenchBindings; personalWorkbenchRoles: PersonalWorkbenchRoles }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap { 'personal-workbench.role-native': { kind: 'single'; scope: 'session' } }
  interface SlotFactoryMap {
    'personal-workbench.role-history': { scope: 'root'; locale: 'personal-workbench'; props: { sessionId: SessionId; close: () => void }; inject: { createHistory: (id: SessionId) => TeacherWindow }; children: { 'personal-workbench.role-native': { kind: 'single'; scope: 'session' } } }
    'personal-workbench.role-attachment': { scope: 'root'; props: { bindingKey: RoleBindingKey; expectedSessionId: SessionId | null; close: () => void }; inject: { commands: PersonalWorkbenchRoles }; locale: 'personal-workbench' }
    'personal-workbench.role-conversation': { scope: 'root'; locale: 'personal-workbench'; props: { readonly bindingKey: RoleBindingKey; readonly active: boolean; readonly label?: string; readonly expectedPresetId?: string }; inject: RoleViewInjected; children: { 'personal-workbench.role-native': { kind: 'single'; scope: 'session' } } }
  }
}
