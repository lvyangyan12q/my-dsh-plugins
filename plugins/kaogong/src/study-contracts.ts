import type { Context } from '@deepseek-ai/cordis'
import type { StudyWorkspace } from './study-workspace.ts'

export type StudyDirectory = Pick<StudyWorkspace, 'snapshot' | 'resolveView' | 'assertProfile'>
export type SourceRows<T = unknown> = { revision: string; rows: [string, T][]; ownerInstanceId?: string }
export interface StudySourceOwner<T extends SourceRows = SourceRows> {
  appId: string; resourceId: string; descriptor?: { title: string; recordsField?: string }; shareable?: boolean; actions: string[]
  read(instanceId: string): T | Promise<T>
  taskContext?(value: T, selection: unknown): { title: string; text: string } | Promise<{ title: string; text: string }>
  withTaskLease?<R>(operation: () => Promise<R>): Promise<R>
}
export interface StudySourceReader {
  call<T extends SourceRows = SourceRows>(input: { viewId: string; resourceId: string; action: 'read' }): Promise<{ value: T; connection: unknown; committed: false }>
}
export type StudyRoleReference = { kind: 'agent' | 'skill'; id: string; source: 'application'; ownerAppId: 'kaogong' }
export type StudyRoleDefinition = { id: string; title: string; agent: StudyRoleReference & { kind: 'agent' }; creation: { cwd: string }; skills?: (StudyRoleReference & { kind: 'skill' })[] }
export type StudyCapability = { id: string; title: string; enabled: boolean; userInvocable: boolean; modelInvocable: boolean } & ({ kind: 'agent'; presetId: string; sessionScoped?: true } | { kind: 'skill'; provider: string })
export interface StudyRoleScopeOwner {
  prepare(input: { capabilityId: string; cwd: string; baseScope: object }): Promise<{ scope: object; dispose(): void | Promise<void> }>
  mount(input: { capabilityId: string; cwd: string; context: Context }): (() => void | Promise<void>) | Promise<() => void | Promise<void>>
}
export type TeachingTask = { id: string; appId: string; instanceId: string; roleId: string; sessionId: string; requestId?: string; status: string; preparation: { kind: string; id: string; ownerAppId: string; ownerVersion: string; token: unknown }; ownerFinalization?: 'pending' | 'done'; ownerRejection?: 'pending' | 'done' }
export type TeachingContext = { appId: string; instanceId: string; viewId: string; roleId: string }
export type TeachingPlan = { id: string; text: string; contexts?: { resourceId: string; selection?: unknown }[]; token?: unknown }
export interface TeachingOwner {
  version: string
  prepare(context: TeachingContext, payload: unknown): TeachingPlan | Promise<TeachingPlan>
  validate(task: TeachingTask): void | Promise<void>
  beforeSubmit(task: TeachingTask): void | Promise<void>
  accepted(task: TeachingTask): void | Promise<void>
  notAdmitted?(task: TeachingTask): void | Promise<void>
}
