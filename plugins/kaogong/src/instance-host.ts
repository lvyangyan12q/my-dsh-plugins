import type { IncomingMessage, ServerResponse } from 'node:http'
import type { StudyWorkspace as ApplicationDirectory } from './study-workspace.ts'
import type { StudyRoles as RoleDirectory } from './study-roles.ts'
import type { KaogongInstancePool, KaogongInstanceState } from './instance-state'
import { CommandGate } from './command-gate'
import {modelToolAccess, requireModelToolAccess} from './model-tool-policy.ts'

type Registry = ReturnType<typeof import('./business-registry.ts').businessRegistry> & {dispose?():Promise<void>}
export class KaogongHost {
  private readonly pending = new Set<Promise<unknown>>()
  private closing = false
  readonly gate = new CommandGate()
  constructor(private readonly services: {
    applications: Pick<ApplicationDirectory, 'resolveView'>
    roles: Pick<RoleDirectory, 'resolveSession'>
    pool: Pick<KaogongInstancePool, 'acquire' | 'close'>
    connection: { admit(request: IncomingMessage): unknown }
    registry(state: KaogongInstanceState, command?: string): Registry | Promise<Registry>
    assertReady?(instanceId:string):void|Promise<void>
  }) {}
  private operation<T>(instanceId: string, command: string, action: (registry: Registry) => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('Kaogong is stopping'))
    const result = this.gate.external(async () => {
      await this.services.assertReady?.(instanceId)
      const lease = await this.services.pool.acquire(instanceId)
      let registry: Registry | undefined
      try { registry = await this.services.registry(lease.state, command); return await action(registry) }
      finally { try { await registry?.dispose?.() } finally { await lease.release() } }
    })
    this.pending.add(result)
    void result.finally(() => this.pending.delete(result)).catch(() => {})
    return result
  }
  /** App-internal source/receipt work may reenter its own lease, external tools may not. */
  state<T>(instanceId: string, operation: (state: KaogongInstanceState) => Promise<T>): Promise<T> {
    return this.importState(instanceId,async state=>{await this.services.assertReady?.(instanceId);return operation(state)})
  }
  /** App-owned importer only; normal HTTP/tools/resources always use the readiness guard. */
  importState<T>(instanceId: string, operation: (state: KaogongInstanceState) => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('Kaogong is stopping'))
    const result = this.gate.run(async () => { const lease = await this.services.pool.acquire(instanceId); try { return await operation(lease.state) } finally { await lease.release() } })
    this.pending.add(result); void result.finally(() => this.pending.delete(result)).catch(() => {}); return result
  }
  async http(route: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const admission = await this.services.connection.admit(request)
      if (!admission || typeof admission === 'object' && 'rejection' in admission) throw new Error('Authenticated connection required')
      const url = new URL(request.url ?? '/', 'http://localhost')
      const views = url.searchParams.getAll('viewId')
      if (views.length !== 1 || !views[0] || url.searchParams.has('instanceId')) throw new Error('A trusted viewId is required')
      const context = await this.services.applications.resolveView(views[0])
      const appId = context.instance.appId
      if (context.application.kind !== 'deep' || context.application.id !== appId || !['kaogong', 'kaogong-library'].includes(appId)) throw new Error('View does not belong to Kaogong')
      if (appId === 'kaogong-library' && (!/\/knowledge(?:\/|$)|\/(?:document-image|material-image|legacy-image|legacy-question-image)(?:\/|$)|^\/%E9/.test(url.pathname) || !['GET','HEAD'].includes(request.method ?? ''))) throw new Error('Library view is read-only')
      await this.operation(context.instance.id, route, async registry => {
        const handler = registry.routes.get(route)
        if (!handler || !('handler' in handler)) throw new Error('Route unavailable')
        await handler.handler(request, response)
      })
    } catch (error) {
      if (!response.headersSent) response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Request refused' }))
    }
  }
  async tool(name: string, args: unknown, execution: unknown): Promise<unknown> {
    const sessionId = (execution as { agent?: { session?: {id?: unknown} } })?.agent?.session?.id
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('Native execution Session required')
    const access = requireModelToolAccess(name)
    const binding = await this.services.roles.resolveSession('kaogong', sessionId, { access })
    return this.operation(binding.instanceId, name, async registry => {
      const tool = registry.tools.get(name)
      if (!tool) throw new Error('Tool unavailable')
      return tool.execute(args, execution as Parameters<typeof tool.execute>[1])
    })
  }
  async active(name: string, context: {agent: {session: {id: string}}}): Promise<boolean> {
    const access = modelToolAccess(name)
    if (this.closing || !access) return false
    try { await this.services.roles.resolveSession('kaogong', context.agent.session.id, {access}); return true } catch { return false }
  }
  async close(): Promise<void> {
    this.closing = true
    await Promise.allSettled([...this.pending])
    await this.services.pool.close()
  }
}
