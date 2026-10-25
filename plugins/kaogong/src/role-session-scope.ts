import type { Context, Plugin } from '@deepseek-ai/cordis'
import {nativeRoleScope} from './native-role-scope.ts'
import * as Persona from '@deepseek-ai/dsh-persona'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import * as SkillTool from '@deepseek-ai/dsh-tool-skill'
import * as AskUser from '@deepseek-ai/dsh-tool-ask-user'
import type { RoleSessionScopeOwner } from 'dsh-worktable/sdk'
import type { kaogongRolePresets } from './role-definitions.ts'

/** Trusted packaged role code only. The platform supplies a verified Native Agent context. */
export function kaogongRoleScopeOwner(ctx: Context, templates: Awaited<ReturnType<typeof kaogongRolePresets>>): RoleSessionScopeOwner {
  let scopeModule: Promise<typeof import('@deepseek-ai/dsh-scope')> | undefined
  const hostScope = () => scopeModule ??= nativeRoleScope(ctx)
  const install = async (context: Context, capabilityId: string) => {
    const template = templates.find(row => row.roleId === capabilityId)
    if (!template) throw new Error('未登记的考公应用角色')
    const remove: (() => void | Promise<void>)[] = []
    const own = async <C>(plugin: Plugin<C>, config: C) => { const fiber = context.plugin(plugin, config); remove.push(() => fiber.dispose()); await fiber.await() }
    try {
      const persona = template.plugins.find(row => row.name === '@deepseek-ai/dsh-persona')!.config
      const skills = template.plugins.find(row => row.name === '@deepseek-ai/dsh-skill-filesystem')!.config
      await own(Persona, persona)
      await own(SkillFilesystem, skills)
      await own(SkillTool, {})
      await own(AskUser, {})
    } catch (error) {
      await Promise.allSettled(remove.reverse().map(dispose => Promise.resolve().then(dispose)))
      throw error
    }
    let released: Promise<void> | undefined
    return () => released ??= (async () => {
      const outcomes = await Promise.allSettled([...remove].reverse().map(dispose => Promise.resolve().then(dispose)))
      const failures = outcomes.filter(row => row.status === 'rejected')
      if (failures.length) throw new AggregateError(failures.map(row => row.reason), '考公私有角色作用域释放失败')
    })()
  }
  return {
    async prepare({ capabilityId, baseScope }) {
      const {createScope} = await hostScope()
      const key = {}, scope = createScope(ctx, key, { parent: baseScope })
      try { await install(scope.ctx, capabilityId); return { scope: key, dispose: () => scope.dispose() } }
      catch (error) { await scope.dispose(); throw error }
    },
    async mount({ capabilityId, context }) { if ((await hostScope()).scopeOf(context) === undefined) throw new Error('Native Agent scope identity is unavailable; role was not mounted')
      return install(context, capabilityId) },
  }
}
