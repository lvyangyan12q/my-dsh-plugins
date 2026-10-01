import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import type { IncomingMessage, ServerResponse } from 'node:http'

export type { RoleDefinition, RoleBindingKey, RoleBinding, PersonalWorkbenchBindings, TeachingEvidence } from './role-binding-api.ts'
export type { ManagementCatalog, ManagedRole, ManagedSkill, SkillAssignment, ManagementRequest } from './management-api.ts'

export const name = 'personal-workbench'
export const inject = ['webServer']

/** Persisted by the official profile configuration; no transcript is copied. */
export interface Config { teacherSessionId: string }
export const Config: z<Config> = z.object({ teacherSessionId: z.string().default('') })

/** Register read-only association metadata. Installation makes no session or model calls. */
export function apply(ctx: Context, config: Config): void {
  let managementHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/personal-workbench/management', handler: (req, res) => {
    if (managementHandler) { void managementHandler(req, res); return }
    res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ error: 'Agent and Skill management services unavailable' }))
  } }), 'personal-workbench: optional management route')
  ctx.inject(['personalWorkbenchBindings', 'storageDomain', 'sessionController', 'agentPresets', 'skills', 'agents', 'tools', 'connection'], child => {
    child.effect(async function* () {
      const { installManagement } = await import('./management-host.ts')
      const owner = await installManagement(child)
      managementHandler = owner.handle
      yield async () => { managementHandler = undefined; await owner.dispose() }
    }, 'personal-workbench: management owner')
  })
  let roleHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/personal-workbench/roles', handler: (req, res) => {
    if (roleHandler) { void roleHandler(req, res); return }
    res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ error: 'Teacher role services unavailable' }))
  } }), 'personal-workbench: optional role route')
  ctx.inject(['storageDomain', 'sessionController', 'sessionPersistence', 'agentPresets', 'skills', 'connection'], child => {
    child.effect(async function* () {
      try {
        const { installRoles } = await import('./role-host.ts')
        const owner = await installRoles(child)
        roleHandler = owner.handle
        yield async () => { roleHandler = undefined; await owner.dispose() }
      } catch (error) {
        child.logger.warn('Teacher role integration unavailable: %s', error instanceof Error ? error.message : 'activation failed')
      }
    }, 'personal-workbench: optional role owner')
  })
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/api/personal-workbench/teacher',
    handler: (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET' })
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ version: 1, sessionId: config.teacherSessionId }))
    },
  }), 'personal-workbench: teacher association')
}
