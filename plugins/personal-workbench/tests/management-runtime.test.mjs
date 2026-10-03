import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { installAssignmentRuntime } from '../src/management-runtime.ts'
import { RoleBindings, bindingKey } from '../src/role-bindings.ts'

const source = process.env.DSH_SOURCE
assert.ok(source, 'Set DSH_SOURCE to the actual built DSH checkout')
const require = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
const { Context } = require('@deepseek-ai/cordis')
const built = path => import(pathToFileURL(resolve(source, path, 'lib/index.js')).href)
const { default: SystemPrompt } = await built('packages/core/system-prompt')
const { default: Tools } = await built('packages/core/tools')
const { default: Agents, agentEvents } = await built('packages/core/agent')
const { SkillRegistry } = await built('packages/skill/skill')
const filesystem = await built('packages/skill/skill-filesystem')
const toolSkill = await built('packages/skill/tool-skill')
const { createScope } = await built('packages/core/scope')
const { Session, SessionId, SESSION_FORMAT_VERSION } = await built('packages/core/session')
const { createUserMessage } = await built('packages/llm/llm')
const root = resolve(import.meta.dirname, '../../kaogong/roles/skills')
const key = { appId: 'app', instanceId: 'default', roleId: 'teacher', subject: 'math' }
const loads = decision => decision.messages.filter(message => message.source.kind === 'skill-invocation')

async function fixture({ loader = true, reusable = false, declaredSkills = [] } = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt); await ctx.plugin(Tools); await ctx.plugin(Agents); await ctx.plugin(SkillRegistry)
  if (loader) await ctx.plugin(toolSkill)
  const id = SessionId('management-role')
  const session = Session.create(id, [], { version: SESSION_FORMAT_VERSION, id, createdAt: 0, cwd: root, isSeeded: false, agentPreset: 'role-preset' })
  const agent = { id, ctx, options: {}, session, status: 'idle' }
  const scope = createScope(ctx, agent); agent.ctx = scope.ctx
  const provider = scope.ctx.plugin(filesystem, { providerName: 'management-native', includeDefaultRoots: false, bundledSkillDir: root, watch: false })
  await provider
  const rows = new Map(), assignments = new Map()
  const bindings = new RoleBindings({ get: key => rows.get(key), put: async (key, row) => rows.set(key, row) },
    { validate: async () => {}, create: async row => row.sessionId }, () => id)
  const withdraw = bindings.registerRole({ key, presetId: 'role-preset', skillNames: declaredSkills, creation: { cwd: root } })
  await bindings.ensure(key)
  let selected = 'role-preset'
  const services = ctx.plugin({ apply: child => {
    child.effect(() => child.reflect.provide('personalWorkbenchBindings', bindings))
    child.effect(() => child.reflect.provide('sessionController', { projections: async () => ({ values: { agentPreset: selected } }) }))
    child.effect(() => child.reflect.provide('agentPresets', { serviceFor: () => undefined, composedPreset: () => reusable ? 'my-dsh.reusable' : undefined }))
  } })
  await services
  const dispose = installAssignmentRuntime(ctx, id => assignments.get(id), presetId => presetId === 'my-dsh.reusable' ? ['kaogong-teach'] : [])
  const initialSeq = session.seq
  const assigned = (names, revision = 1) => assignments.set(bindingKey(key), { version: 1, key, revision, names })
  const propose = (text, { target = agent, turn = 1, step = 1, reject = false, signal = new AbortController().signal, kind = 'user' } = {}) => {
    const original = createUserMessage({ source: { kind }, content: [{ type: 'text', text }] })
    const messages = [original]
    return agentEvents(ctx, target).waterfall('agent/pre-step', { messages, turn, step, signal },
      async () => reject ? { kind: 'reject' } : { kind: 'enter', messages }).finally(() => assert.equal(messages[0], original, 'Claimed payload must be restored after waterfall'))
  }
  return { ctx, agent, provider, assigned, propose, withdraw, initialSeq, changedPreset: () => { selected = 'other' },
    close: async () => { await dispose(); await bindings.dispose(); await scope.dispose(); await services.dispose(); await ctx.fiber.dispose() } }
}

test('untouched ordinary role user input reaches the one native loader in its exact scope on the next turn', async () => {
  const f = await fixture()
  try {
    assert.equal(loads(await f.propose('Before assignment')).length, 0)
    f.assigned(['kaogong-teach'])
    const decision = await f.propose('Explain growth rates.', { turn: 2 })
    assert.equal(loads(decision).length, 1)
    assert.equal(loads(decision)[0].source.name, 'kaogong-teach')
    assert.equal(loads(decision)[0].source.form, 'instructions')
    assert.match(loads(decision)[0].content[0].text, /教学阶段与推进条件/)
    assert.equal(decision.messages[0].content[0].text, 'Explain growth rates.')
    assert.equal(decision.messages[0].content[1].text, '/kaogong-teach')
    assert.equal(f.agent.session.seq, f.initialSeq, 'Pre-step proof is not durable loop/model acceptance')
    assert.equal(loads(await f.propose('Continuation', { turn: 2, step: 2 })).length, 0)
    assert.equal(loads(await f.propose('Repeated proposal', { turn: 2 })).length, 0)
    assert.equal(loads(await f.propose('Next question', { turn: 3 })).length, 1)
    f.assigned([])
    assert.equal(loads(await f.propose('After unassign', { turn: 4 })).length, 0)
    f.assigned(['kaogong-teach'])
    const otherId = SessionId('other-role')
    const other = { id: otherId, ctx: f.ctx, session: Session.create(otherId, [], { version: SESSION_FORMAT_VERSION, id: otherId, createdAt: 0, cwd: root, isSeeded: false }), options: {}, status: 'idle' }
    assert.equal(loads(await f.propose('Main/other input', { target: other })).length, 0)
    f.withdraw()
    assert.equal(loads(await f.propose('Withdrawn role', { turn: 5 })).length, 0)
  } finally { await f.close() }
})

test('native rejection, cancellation, invocation policy, provider loss and preset changes cannot become successful assignment loads', async () => {
  const f = await fixture()
  try {
    f.assigned(['kaogong-teach'])
    assert.deepEqual(await f.propose('Rejected', { reject: true }), { kind: 'reject' })
    const controller = new AbortController(); controller.abort(new Error('cancelled assignment'))
    await assert.rejects(f.propose('Cancelled', { signal: controller.signal }), /cancelled assignment/)
    assert.equal(loads(await f.propose('Untrusted context', { kind: 'skill-catalog' })).length, 0)
    assert.equal(loads(await f.propose('/kaogong-teach explicit duplicate')).length, 1)
    await f.agent.ctx.plugin({ inject: ['skills'], apply: child => { child.skills.register({ name: 'human-only', description: 'policy fixture', source: 'runtime', content: 'Human-only instructions', invocation: { userInvocable: true, modelInvocable: false } }) } })
    f.assigned(['human-only'])
    assert.equal(loads(await f.propose('Human policy', { turn: 2 }))[0].source.name, 'human-only')
    await f.agent.ctx.plugin({ inject: ['skills'], apply: child => { child.skills.register({ name: 'disabled-user', description: 'policy fixture', source: 'runtime', content: 'Must not load', invocation: { userInvocable: false, modelInvocable: true } }) } })
    f.assigned(['disabled-user'])
    await assert.rejects(f.propose('Disabled', { turn: 3 }), /Assigned Skill unavailable/)
    f.assigned(['missing-skill'])
    await assert.rejects(f.propose('Missing', { turn: 4 }), /Assigned Skill unavailable/)
    f.assigned(['kaogong-teach'])
    await f.provider.dispose()
    await assert.rejects(f.propose('Removed', { turn: 5 }), /Assigned Skill unavailable/)
    f.changedPreset()
    await assert.rejects(f.propose('Changed composition', { turn: 6 }), /preset unavailable/)
  } finally { await f.close() }
})

test('registry/body readability without the actual native loader fails explicitly rather than claiming activation', async () => {
  const f = await fixture({ loader: false })
  try {
    f.assigned(['kaogong-teach'])
    await assert.rejects(f.propose('Ordinary input'), /Native Skill loader did not admit/)
  } finally { await f.close() }
})

test('reusable independent Agent assignment uses actual native Skill loader outside every application binding', async()=>{
 const f=await fixture({reusable:true})
 try { f.withdraw();const decision=await f.propose('Teach without an application binding');assert.equal(loads(decision).length,1);assert.equal(loads(decision)[0].source.name,'kaogong-teach');assert.match(loads(decision)[0].content[0].text,/教学阶段/); }finally{await f.close()}
})

test('recipe role Skill references reach the actual native loader without copying or management assignments',async()=>{
 const f=await fixture({declaredSkills:['kaogong-teach']});try{const decision=await f.propose('Explain the selected material');assert.equal(loads(decision).length,1);assert.equal(loads(decision)[0].source.name,'kaogong-teach');assert.match(loads(decision)[0].content[0].text,/教学阶段/);assert.equal(f.agent.session.seq,f.initialSeq)}finally{await f.close()}
})
