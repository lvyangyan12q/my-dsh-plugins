import type { Context, Plugin } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {join,isAbsolute} from 'node:path'
import * as Persona from '@deepseek-ai/dsh-persona'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import * as SkillTool from '@deepseek-ai/dsh-tool-skill'
import * as AskUser from '@deepseek-ai/dsh-tool-ask-user'
import type { RoleSessionScopeOwner } from 'dsh-worktable/sdk'
import type { kaogongRolePresets } from './role-definitions.ts'

/** Trusted packaged role code only. The platform supplies a verified Native Agent context. */
export function kaogongRoleScopeOwner(ctx: Context, templates: Awaited<ReturnType<typeof kaogongRolePresets>>): RoleSessionScopeOwner {
  // Scope tags belong to the running Native installation, never a same-version profile/development peer.
  let scopeModule: Promise<typeof import('@deepseek-ai/dsh-scope')> | undefined
  const hostScope = () => scopeModule ??= (async () => {
    const presetName='@deepseek-ai/dsh-agent-preset-registry',scopeName='@deepseek-ai/dsh-scope'
    const entries=ctx.get('pluginPackages')?.resolution?.entries
    if(!Array.isArray(entries))throw new Error('NATIVE_ROLE_SCOPE_METADATA_UNAVAILABLE')
    const installed=(name:string)=>{const rows=entries.filter(row=>row.name===name&&row.scope==='installation');if(rows.length!==1||typeof rows[0]!.packageDir!=='string'||!isAbsolute(rows[0]!.packageDir)||typeof rows[0]!.version!=='string')throw new Error('NATIVE_ROLE_SCOPE_INSTALLATION_IDENTITY_UNAVAILABLE');return rows[0]!}
    const presetPackage=installed(presetName),scopePackage=installed(scopeName)
    const presetManifest=join(presetPackage.packageDir,'package.json'),scopeManifest=join(scopePackage.packageDir,'package.json')
    const preset=JSON.parse(await readFile(presetManifest,'utf8')),scope=JSON.parse(await readFile(scopeManifest,'utf8'))
    if(preset.version!==presetPackage.version||scope.version!==scopePackage.version)throw new Error('NATIVE_ROLE_SCOPE_INSTALLATION_METADATA_CHANGED')
    const scopeEntry=createRequire(scopeManifest).resolve(scopeName)
    if(preset.name!==presetName||scope.name!==scopeName||typeof preset.version!=='string'||scope.version!==preset.version)throw new Error('Native role scope package identity does not match the preset runtime')
    const runtime=await import(pathToFileURL(scopeEntry).href)
    if(typeof runtime.createScope!=='function'||typeof runtime.scopeOf!=='function')throw new Error('Native role scope public API is unavailable')
    return runtime
  })()
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
