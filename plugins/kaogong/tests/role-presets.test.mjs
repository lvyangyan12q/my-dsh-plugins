import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { kaogongRolePresets, kaogongRoleDefinitions, installKaogongRoles } from '../src/role-definitions.ts'

const source = process.env.KAOGONG_TEST_RUNTIME
assert.ok(source, 'Set KAOGONG_TEST_RUNTIME to built official DSH checkout')
const require = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
const { Context } = require('@deepseek-ai/cordis')
const load = async path => (await import(pathToFileURL(resolve(source, path)).href)).default

test('activated personas require real evidence and user-confirmed native handoff instead of obsolete dispatch', async () => {
  for (const preset of await kaogongRolePresets()) {
    const persona = preset.plugins.find(row => row.name === '@deepseek-ai/dsh-persona').config
    assert.equal(persona.complete, false)
    assert.equal(persona.includeRuntimeContext, true)
    assert.match(persona.prefix, /确认/)
    assert.match(persona.prefix, /实际/)
    assert.match(persona.prefix, /不.*自动/)
    assert.doesNotMatch(persona.prefix, /用 subagent|subagent 拉起|派「|每次学完：打卡|学完用 kaogong_plan_done|先读取 roles\//)
    assert.match(persona.prefix, /不.*伪造|不.*编造/)
  }
})

test('actual preset registry activates application personas in independent scopes without overriding deployment or model calls', async () => {
  const ctx = new Context()
  ctx.baseUrl = new URL('../package.json', import.meta.url).href
  const removers = []
  try {
    await ctx.plugin(await load('vendor/loader/lib/index.js'))
    ctx.loader.builtins.group = await load('vendor/group/lib/index.js')
    for (const path of ['packages/llm/llm/lib/index.js', 'packages/core/session/lib/index.js', 'packages/session/session-projection/lib/index.js']) await ctx.plugin(await load(path))
    await ctx.plugin(await load('packages/core/system-prompt/lib/index.js'), { personaPrefix: 'UNCHANGED DEPLOYMENT GUARD' })
    await ctx.plugin(await load('packages/core/tools/lib/index.js'))
    await ctx.plugin(await load('packages/core/agent/lib/index.js'))
    await ctx.plugin(await load('packages/core/agent-loop/lib/index.js'), { agents: [] })
    const { SkillRegistry } = await import(pathToFileURL(resolve(source, 'packages/skill/skill/lib/index.js')).href)
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(await load('packages/preset/agent-preset-registry/lib/index.js'), { default: 'unused' })
    for (const preset of await kaogongRolePresets()) {
      removers.push(await ctx.agentPresets.register(preset))
      const resolved = await ctx.agentPresets.resolve(preset.id)
      assert.equal(resolved.broken, undefined, `${preset.id}: ${resolved.broken}`)
      const lease = await ctx.agentPresets.acquireScope(preset.id)
      try {
        const assembly = await ctx.systemPrompt.assemble({ scope: lease.key })
        assert.notEqual(assembly.sections.find(row => row.name === 'deployment:persona-prefix')?.text, 'UNCHANGED DEPLOYMENT GUARD')
        const skill = await ctx.skills.get('kaogong-teach', { scope: lease.key })
        assert.match(skill?.content ?? '', /教学阶段与推进条件/)
        assert.equal(skill?.source, 'bundled')
      } finally { await lease[Symbol.asyncDispose]() }
    }
    assert.equal((await ctx.systemPrompt.assemble()).sections.find(row => row.name === 'deployment:persona-prefix')?.text, 'UNCHANGED DEPLOYMENT GUARD')
    assert.equal(kaogongRoleDefinitions('C:/learning').filter(row => row.key.roleId === 'teacher' && row.key.subject).length, 6)
  } finally { for (const remove of removers.reverse()) await remove(); await ctx.fiber.dispose() }
})

test('app registration has zero native commands and withdraws declarations/presets on partial failure or disposal', async () => {
  for (const failure of [false, true]) {
    const declarations = new Set(), presets = new Set()
    const ctx = {
      agentPresets: { register: async preset => { presets.add(preset.id); return async () => { presets.delete(preset.id) } }, acquireScope: () => assert.fail('No preflight at registration') },
      personalWorkbenchBindings: { registerRole: definition => { const name = JSON.stringify(definition.key); if (failure && declarations.size === 2) throw Error('registration failed'); declarations.add(name); return () => declarations.delete(name) } },
      sessionController: { create: () => assert.fail('No Session at registration') },
    }
    if (failure) await assert.rejects(installKaogongRoles(ctx, 'C:/learning'), /registration failed/)
    else {
      const dispose = await installKaogongRoles(ctx, 'C:/learning')
      assert.equal(declarations.size, 9)
      assert.equal(presets.size, 9)
      await dispose()
    }
    assert.equal(declarations.size, 0)
    assert.equal(presets.size, 0)
  }
})
