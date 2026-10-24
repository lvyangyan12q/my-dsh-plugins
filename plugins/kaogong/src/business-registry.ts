import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { registerBusiness, type Config } from './business.ts'
import type { KaogongInstanceState } from './instance-state.ts'
import type { Mineru } from './mineru.ts'

export function businessRegistry(config: Config, state: KaogongInstanceState, mineru: Pick<Mineru, 'root' | 'start' | 'collect' | 'image'>) {
  const routes = new Map<string, Parameters<Context['webServer']['register']>[0]>()
  const tools = new Map<string, ToolDefinition>()
  registerBusiness({
    webServer: { register(route) { routes.set(route.kind + ':' + route.path, route); return () => { routes.delete(route.kind + ':' + route.path) } } },
    tools: { register(definition) { tools.set(definition.name, definition); return () => { tools.delete(definition.name) } } },
    effect(operation) { return operation() },
  }, config, state, mineru)
  return { routes, tools }
}
