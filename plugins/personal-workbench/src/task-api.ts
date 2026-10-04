import type { WorkbenchSkillName } from './workbench-skill-api.ts'
import type {} from '@deepseek-ai/cordis'
import type { RoleBindingKey } from './role-binding-api.ts'
export interface TaskContext { readonly id: string; readonly label: string; readonly source: string; readonly text: string }
/** teaching selects a vetted Host teaching driver only when send is explicitly invoked. */
export interface PreparedTask { readonly key: RoleBindingKey; readonly task: string; readonly source: { readonly pageId: string; readonly moduleId: string; readonly label: string }; readonly context: readonly TaskContext[]; readonly teaching?: boolean; readonly skill?: WorkbenchSkillName }
export interface TaskState { readonly prepared: PreparedTask; readonly busy: boolean; readonly error: string | null }
export interface TaskHooks { readonly beforeSend?: () => void | Promise<void>; readonly afterSend?: () => void | Promise<void>; readonly onDiscard?: () => void | Promise<void> }
export interface PersonalWorkbenchTasks {
 /** Code-owned hooks run only for their explicit send/discard gesture; never from recipe JSON. */
 prepare(task: PreparedTask, options?: TaskHooks): void
 getSnapshot(): ReadonlyMap<string, TaskState>
 subscribe(listener: () => void): () => void
 editTask(key: RoleBindingKey, text: string): void
 editContext(key: RoleBindingKey, id: string, text: string): void
 removeContext(key: RoleBindingKey, id: string): void
 discard(key: RoleBindingKey): Promise<void>
 send(key: RoleBindingKey): Promise<void>
}
declare module '@deepseek-ai/cordis' { interface Context { personalWorkbenchTasks: PersonalWorkbenchTasks } }
