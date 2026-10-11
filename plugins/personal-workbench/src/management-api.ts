import type { RoleBinding, RoleBindingKey } from './role-binding-api.ts'
import type { ModelCatalog, ModelSelectionProjection } from '@deepseek-ai/dsh-api-session-controller/types'

/** Persist names, never bodies, credentials, native configuration or presumed load status. */
export interface SkillAssignment {
  readonly version: 1
  readonly key: RoleBindingKey
  readonly revision: number
  readonly names: readonly string[]
}
export interface ManagedSkill {
  readonly name: string
  readonly description: string
  readonly provider: string
  readonly source: string
  readonly userInvocable: boolean
  readonly modelInvocable: boolean
  readonly appIds: readonly string[]
  readonly managed?: boolean
  readonly revision?: number
}
export interface ManagedRole {
  readonly key: RoleBindingKey
  readonly presetId: string
  readonly name: string
  readonly source: string
  readonly bundleName?: string
  readonly available: boolean
  readonly error?: string
  readonly binding: RoleBinding | null
  readonly assignment: SkillAssignment
  readonly skills: readonly ManagedSkill[]
  readonly missingNames: readonly string[]
  readonly scope: 'live-agent' | 'preset'
  readonly tools: readonly { readonly name: string; readonly description: string }[]
  readonly model: ModelSelectionProjection | null
  readonly permissions: {
    readonly currentValue: string | null
    readonly sandboxMode: string | null
    readonly approvalPolicy: string | null
    readonly provenance: 'native-live-policy' | 'native-session-projection' | 'unavailable'
    readonly workspaceRoot: string | null
    readonly sandboxOrigin: 'session-override' | 'composition-default' | 'unavailable'
    readonly approvalOrigin: 'session-override' | 'composition-default' | 'unavailable'
  }
  /** Observed committed native instructions, not a promise from assignment/preflight. */
  readonly loaded: readonly { readonly name: string; readonly seq: number }[]
}
export interface ManagementCatalog {
  readonly version: 1
  readonly roles: readonly ManagedRole[]
  readonly presets: readonly { readonly id: string; readonly name?: string; readonly description?: string; readonly broken?: string }[]
  readonly skills: readonly ManagedSkill[]
  readonly globalSkillError?: string
  readonly models: ModelCatalog | null
  readonly modelError?: string
  readonly runtimeAvailable: boolean
  readonly agents?: readonly ManagedAgent[]
  readonly executions?: readonly CapabilityExecution[]
}
export type ManagementRequest = CapabilityRequest | { readonly action: 'catalog' }
  | { readonly action: 'assign'; readonly key: RoleBindingKey; readonly expectedRevision: number; readonly names: readonly string[] }

export interface AgentInput { readonly id: string; readonly name: string; readonly description: string; readonly persona: string; readonly skillNames: readonly string[]; readonly modelInvocable: boolean; readonly userInvocable: boolean }
export interface ManagedAgent extends AgentInput { readonly revision: number; readonly managed: boolean; readonly presetId?: string; readonly appIds: readonly string[]; readonly broken?: string }
export interface SkillInput { readonly name: string; readonly description: string; readonly content: string; readonly modelInvocable: boolean; readonly userInvocable: boolean }
export interface CapabilityExecution { readonly id: string; readonly kind: 'agent' | 'skill'; readonly capabilityId: string; readonly sessionId: string; readonly childSessionId?: string; readonly startedAt: string; readonly finishedAt?: string; readonly status: 'running' | 'completed' | 'failed' | 'cancelled'; readonly error?: string }
export type CapabilityRequest =
 | { readonly action: 'agent-save'; readonly agent: AgentInput; readonly expectedRevision: number }
 | { readonly action: 'agent-remove'; readonly id: string; readonly expectedRevision: number }
 | { readonly action: 'agent-open'; readonly id: string; readonly cwd?: string }
 | { readonly action: 'agent-bind'; readonly key: RoleBindingKey; readonly agentId: string; readonly expectedSessionId: string | null }
 | { readonly action: 'skill-save'; readonly skill: SkillInput; readonly expectedRevision: number }
 | { readonly action: 'skill-remove'; readonly name: string; readonly expectedRevision: number }
 | { readonly action: 'skill-read'; readonly name: string }
 | { readonly action: 'executions'; readonly sessionId?: string }
