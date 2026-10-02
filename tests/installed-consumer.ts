import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/remote'
import { apply as kaogongApply, Config as kaogongSchema } from '@deepseek-ai/dsh-tool-kaogong'
import type { Config as KaogongConfig } from '@deepseek-ai/dsh-tool-kaogong'
import { apply as workbenchApply } from '@deepseek-ai/dsh-personal-workbench'
import type { PersonalWorkbenchBindings, ManagementRequest } from '@deepseek-ai/dsh-personal-workbench'
import type { RoleBindingKey, PersonalWorkbenchRoles, WorkbenchAppDefinition } from '@deepseek-ai/dsh-personal-workbench/client'
import type { KaogongViewProps } from '@deepseek-ai/dsh-tool-kaogong/client'

declare const ctx: Context
declare const view: KaogongViewProps
declare const app: WorkbenchAppDefinition
const config: KaogongConfig = kaogongSchema({ topN: 8, roleCwd: '/owned/workspace', questionImageRoot: '/owned/images', mineru: { outputDir: '/owned/results' } })
const imageRoot: string | undefined = config.questionImageRoot.get()
const apply: (ctx: Context, config: KaogongConfig) => Promise<void> = kaogongApply
const key: RoleBindingKey = { appId: 'kaogong', instanceId: 'default', roleId: 'teacher', subject: 'synthetic-subject' }
const bindings: PersonalWorkbenchBindings = ctx.personalWorkbenchBindings
const roles: PersonalWorkbenchRoles = ctx.personalWorkbenchRoles
const request: ManagementRequest = { action: 'assign', key, expectedRevision: 0, names: ['kaogong-teach'] }
void [view, app, config, imageRoot, apply, kaogongSchema, workbenchApply, request, bindings.listRoles(), roles]
// @ts-expect-error Arbitrary completion proof is not a role key.
const invalid: RoleBindingKey = { ...key, completed: true }
void invalid
