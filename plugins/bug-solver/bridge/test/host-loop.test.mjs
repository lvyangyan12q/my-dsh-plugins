/**
 * 接缝：真实 Host 适配 + IM01 状态机（DispatchService）的端到端循环。
 * 用 fake DSH Host 驱动 turn/end：方案 → 批准 → 实现（result.json commit）→ 审核
 * → request_changes → 下一轮方案，并覆盖 blocked / unknown / Stop。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DispatchService } from '../lib/dispatch-service.js'
import { createHostGateway } from '../lib/host.js'
import { createRedactor } from '../lib/redact.js'
import { createFakeClock, createMemoryStore, makeDraft, verdictText } from './helpers.mjs'
import { createFakeHost } from './fake-host.mjs'

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'bs-loop-'))
  mkdirSync(join(root, '.git'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const host = createFakeHost()
  const gateway = createHostGateway(host, {
    config: { allowedRoots: [root], dirtyCheck: false },
    redactor: createRedactor(),
    runGit: async () => '',
  })
  t.after(() => gateway.dispose())

  const store = createMemoryStore()
  const clock = createFakeClock()
  const redactor = createRedactor()
  const service = new DispatchService({ gateway, store, clock, redactor, allowedRoots: [root] })
  gateway.onTurnEnd = (sessionId, payload) => service.onTurnEnd(sessionId, payload)
  const draft = (overrides = {}) => {
    const base = makeDraft()
    return {
      ...base,
      ...overrides,
      bug: { ...base.bug, ...(overrides.bug ?? {}) },
      connection: { ...base.connection, ...(overrides.connection ?? {}) },
      project: { ...base.project, localPath: root, ...(overrides.project ?? {}) },
    }
  }
  return { root, host, gateway, service, draft, clock }
}

function writeImplementationArtifacts(root, runId, round, { commit }) {
  const dir = join(root, '.bug-solver', 'runs', runId, `round-${round}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'result.json'),
    JSON.stringify({ branch: 'bugfix/x', commit, diffPath: `round-${round}/diff.patch`, tests: ['node --test'], risk: 'low' }),
    'utf8',
  )
  return dir
}

test('plan → approve → implement → review → request_changes → next round on real gateway events', async (t) => {
  const { root, host, gateway, service, draft } = setup(t)
  const { run } = await service.start(draft())
  assert.equal(run.state, 'fix_planning')
  assert.equal(host.calls.create.length, 1)
  assert.equal(host.calls.create[0].sessionId, run.fixSessionId)
  assert.equal(host.calls.rename[0].title, 'BUG-3083 分析修复')

  const planPrompt = host.calls.prompt[0]
  assert.equal(planPrompt.requestId, `${run.id}:plan:1:1`)
  assert.equal(planPrompt.sessionId, run.fixSessionId)
  assert.match(planPrompt.content[0].text, /方案阶段/)
  assert.match(planPrompt.content[0].text, /specs\/login\/spec\.md/, 'specRef is injected into the plan prompt')
  assert.match(planPrompt.content[0].text, new RegExp(`分支: ${run.branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.match(planPrompt.content[0].text, /base: master/)
  assert.match(planPrompt.content[0].text, /只读/)

  // 第 1 轮方案完成 → 停在批准闸门（不自动实现）。
  host.completeTurn(run.fixSessionId, planPrompt.requestId, { finalText: '第 1 轮方案：改 A、测 B' })
  await gateway.whenIdle()
  let current = await service.getRun(run.id)
  assert.equal(current.state, 'awaiting_plan_approval')
  assert.equal(host.calls.prompt.length, 1)

  await service.approvePlan(run.id, { note: '按方案做' })
  current = await service.getRun(run.id)
  assert.equal(current.state, 'fix_implementing')
  const implementPrompt = host.calls.prompt.at(-1)
  assert.equal(implementPrompt.requestId, `${run.id}:fix:1`)
  assert.match(implementPrompt.content[0].text, /实现阶段/)

  // 实现完成：result.json 的 commit 会被桥从产物目录读回 run。
  writeImplementationArtifacts(root, run.id, 1, { commit: 'abc123' })
  host.completeTurn(run.fixSessionId, implementPrompt.requestId, { finalText: '实现完成' })
  await gateway.whenIdle()

  current = await service.getRun(run.id)
  assert.equal(current.state, 'review_running')
  assert.equal(current.rounds[0].commit, 'abc123')
  assert.deepEqual(current.commits, ['abc123'])
  assert.ok(current.reviewSessionId)

  // 审核会话：同 workspace、rename、read-only 事件先于 prompt。
  const reviewCreate = host.calls.create[1]
  assert.equal(reviewCreate.sessionId, current.reviewSessionId)
  assert.equal(reviewCreate.workspaceId, host.calls.create[0].workspaceId)
  assert.equal(host.calls.rename[1].title, 'BUG-3083 审核')
  const reviewEvents = host.sessions.get(current.reviewSessionId).events
  const sandboxEvents = reviewEvents.filter((event) => event.type === 'sandbox/mode')
  assert.equal(sandboxEvents.at(-1)?.data.mode, 'read-only')
  const reviewPrompt = host.calls.prompt.at(-1)
  assert.equal(reviewPrompt.sessionId, current.reviewSessionId)
  assert.equal(reviewPrompt.requestId, `${run.id}:review:1`)
  assert.match(reviewPrompt.content[0].text, /只读沙箱/)
  assert.match(reviewPrompt.content[0].text, /"verdict"/)

  // 审核 request_changes → 自动进入第 2 轮方案（同一对会话）；review.md 由桥写盘。
  host.completeTurn(current.reviewSessionId, reviewPrompt.requestId, {
    finalText: verdictText('request_changes', { blocking: ['缺少边界测试'], tests: ['补一条集成测试'] }),
  })
  await gateway.whenIdle()

  current = await service.getRun(run.id)
  assert.equal(current.state, 'fix_planning')
  assert.equal(current.currentRound, 2)
  assert.equal(current.rounds[0].review.verdict, 'request_changes')
  assert.deepEqual(current.rounds[0].review.blocking, ['缺少边界测试'])
  assert.equal(host.calls.create.length, 2, 'next round reuses the fix/review sessions')

  const round2Prompt = host.calls.prompt.at(-1)
  assert.equal(round2Prompt.sessionId, run.fixSessionId)
  assert.equal(round2Prompt.requestId, `${run.id}:plan:2:1`)
  assert.match(round2Prompt.content[0].text, /缺少边界测试/)

  const reviewFile = join(root, '.bug-solver', 'runs', run.id, 'round-1', 'review.md')
  assert.match(readFileSync(reviewFile, 'utf8'), /request_changes/)

  // 只读镜像可读：审核会话的最终结论标成 review。
  const mirror = await service.messages(run.id, { role: 'review' })
  assert.equal(mirror.messages.at(-1).kind, 'review')
  assert.equal(mirror.messages.at(-1).role, 'assistant')
})

test('a blocked turn pauses as needs_attention instead of advancing', async (t) => {
  const { host, gateway, service, draft } = setup(t)
  const { run } = await service.start(draft())

  host.completeTurn(run.fixSessionId, `${run.id}:plan:1:1`, { reason: { kind: 'blocked' } })
  await gateway.whenIdle()

  const current = await service.getRun(run.id)
  assert.equal(current.state, 'needs_attention')
  assert.equal(current.needsAttention.from, 'fix_planning')
  assert.equal(current.needsAttention.code, 'blocked')
  assert.equal(host.calls.prompt.length, 1, 'blocked must not send another prompt')
})

test('an interrupted turn becomes unknown and is never re-sent', async (t) => {
  const { host, gateway, service, draft } = setup(t)
  const { run } = await service.start(draft())

  host.completeTurn(run.fixSessionId, `${run.id}:plan:1:1`, { reason: { kind: 'interrupted' } })
  await gateway.whenIdle()

  const current = await service.getRun(run.id)
  assert.equal(current.state, 'unknown')
  assert.equal(current.error.code, 'turn-unknown')
  assert.equal(host.calls.prompt.length, 1)
})

test('a blocked turn followed by the user reply on the same session auto-resumes the plan stage', async (t) => {
  const { host, gateway, service, draft } = setup(t)
  const { run } = await service.start(draft())

  host.completeTurn(run.fixSessionId, `${run.id}:plan:1:1`, { reason: { kind: 'blocked' } })
  await gateway.whenIdle()
  let current = await service.getRun(run.id)
  assert.equal(current.state, 'needs_attention')
  assert.equal(current.needsAttention.from, 'fix_planning')
  assert.equal(host.calls.prompt.length, 1)

  // 用户在 DSH 原生会话里回答：同一会话产生新的 turn，rpcId 不是桥的 requestId。
  host.completeTurn(run.fixSessionId, 'user-reply-rpc-1', { finalText: '用户回答：按 401 处理' })
  await gateway.whenIdle()

  current = await service.getRun(run.id)
  assert.equal(current.state, 'fix_planning')
  assert.equal(current.needsAttention, null)
  assert.equal(host.calls.prompt.length, 2, 'the paused plan stage is re-sent')
  assert.equal(host.calls.prompt.at(-1).requestId, `${run.id}:plan:1:2`)
  assert.match(host.calls.prompt.at(-1).content[0].text, /方案阶段/)

  // 续跑后的方案完成仍回到批准闸门。
  host.completeTurn(run.fixSessionId, `${run.id}:plan:1:2`, { finalText: '第 2 版方案' })
  await gateway.whenIdle()
  current = await service.getRun(run.id)
  assert.equal(current.state, 'awaiting_plan_approval')
  assert.match(current.plan, /第 2 版方案/)
})

test('Stop cancels the live native session and does not fake a deletion', async (t) => {
  const { host, gateway, service, draft } = setup(t)
  const { run } = await service.start(draft())

  await service.stop(run.id)
  assert.deepEqual(host.calls.cancel, [{ sessionId: run.fixSessionId }])
  assert.equal((await service.getRun(run.id)).state, 'stopped')
  assert.equal(host.listenerCount('session/event') > 0, true, 'gateway still owns its event listener')
  await gateway.whenIdle()
})
