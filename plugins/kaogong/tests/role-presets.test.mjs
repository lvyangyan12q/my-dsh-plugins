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
    assert.ok(preset.plugins.some(row => row.name === '@deepseek-ai/dsh-tool-ask-user'), 'Every teaching role must expose native questions')
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
  ctx.provide('workingDirectory',{ensure:async()=>assert.fail('No Session directory execution during preset registration')})
  try {
    await ctx.plugin(await load('vendor/loader/lib/index.js'))
    ctx.loader.builtins.group = await load('vendor/group/lib/index.js')
    for (const path of ['packages/llm/llm/lib/index.js', 'packages/core/session/lib/index.js', 'packages/session/session-projection/lib/index.js']) await ctx.plugin(await load(path))
    await ctx.plugin(await load('packages/core/system-prompt/lib/index.js'), { personaPrefix: 'UNCHANGED DEPLOYMENT GUARD' })
    await ctx.plugin(await load('packages/core/tools/lib/index.js'))
    await ctx.plugin(await import(pathToFileURL(resolve(source,'packages/core/tool-executor-native/lib/index.js')).href))
    await ctx.plugin(await load('packages/interaction/user-questions/lib/index.js'))
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
        assert.ok(ctx.tools.get('ask_user_question', lease.key), 'Native question tool must activate in the role scope')
        const assembly = await ctx.systemPrompt.assemble({ scope: lease.key })
        assert.notEqual(assembly.sections.find(row => row.name === 'deployment:persona-prefix')?.text, 'UNCHANGED DEPLOYMENT GUARD')
        const skill = await ctx.skills.get('kaogong-teach', { scope: lease.key })
        assert.match(skill?.content ?? '', /教学阶段与推进条件/)
        assert.equal(skill?.source, 'bundled')
        assert.match(skill.content,/本轮.*累计/);assert.match(skill.content,/userAnswer.*为空.*未答.*correct=false.*错题/);assert.match(skill.content,/分母.*跳过/);
        if(preset.id==='kaogong.class-advisor.v1') {
          const prefix=preset.plugins.find(row=>row.name==='@deepseek-ai/dsh-persona').config.prefix
          assert.match(prefix,/kaogong_practice_read/)
          assert.match(prefix,/不.*要求用户.*roundId/)
          assert.ok(assembly.sections.some(section=>section.text?.includes('kaogong_practice_read')),'Actual advisor persona must provide the readonly round lookup path')
          assert.match(skill.content,/kaogong_practice_read/)
          assert.match(skill.content,/未.*读取.*保存有误/)
        }
        // Test the actual acquired native scope, not an unused role file.
        if(preset.id.includes('teacher')||preset.id==='kaogong.counselor.v1'){
          const prefix=preset.plugins.find(row=>row.name==='@deepseek-ai/dsh-persona').config.prefix
          assert.match(prefix,/自编示例.*材料原题/);assert.ok(assembly.sections.some(section=>section.text?.includes('来源与答案核对')),'Source/answer guard must be in actual assembled native persona')
          assert.match(prefix,/标准答案.*原选项/)
          assert.match(prefix,/无法确定.*明确说明/)
          assert.match(skill.content,/题目 ID.*原题干.*原选项.*实际作答.*Host 标准答案/)
          assert.match(skill.content,/Ⅰ、Ⅱ、Ⅲ.*逐项.*必然/)
          assert.match(skill.content,/无法确定.*暂停.*不改写.*成绩/)
          if(preset.id.includes('teacher')) {
            // Verify the actual acquired persona and bundled Skill contract, not a model-output simulation.
            assert.ok(assembly.sections.some(section=>section.text?.includes('来源核验边界')),'Teacher native persona must constrain readonly source audits')
            assert.match(prefix,/来源核验.*不.*答案.*解析/)
            assert.match(prefix,/已.*答案.*不.*独立诊断.*评分/)
            assert.match(skill.content,/来源核验.*只.*类别.*ID.*标题.*范围/)
            assert.match(skill.content,/已讲解例题.*未作答诊断/)
            assert.match(skill.content,/新的未泄露题.*开放解释.*不记.*练习成绩/)
            assert.match(skill.content,/诊断.*提交前.*不.*答案.*解析/)
          }
        }
      } finally { await lease[Symbol.asyncDispose]() }
    }
    assert.equal((await ctx.systemPrompt.assemble()).sections.find(row => row.name === 'deployment:persona-prefix')?.text, 'UNCHANGED DEPLOYMENT GUARD')
    assert.equal(kaogongRoleDefinitions('C:/learning').filter(row => row.id.startsWith('teacher.')).length, 6)
  } finally { for (const remove of removers.reverse()) await remove(); await ctx.fiber.dispose() }
})

test('app registration has zero native commands and withdraws declarations/presets on partial failure or disposal', async () => {
  for (const failure of [false, true]) {
    const declarations = new Set(), presets = new Set()
    const ctx = {
      agentPresets: { register: async preset => { presets.add(preset.id); return async () => { presets.delete(preset.id) } }, acquireScope: () => assert.fail('No preflight at registration') },
      worktableCapabilities: {contribute:()=>()=>{}},
      worktableRoles: {contribute: (_app, rows)=>{if(failure)throw Error('registration failed');for(const row of rows)declarations.add(row.id);return ()=>declarations.clear()}},
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
