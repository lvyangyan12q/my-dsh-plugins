/**
 * 接缝：DispatchService 的方案闸门与「修复 → 审核」交接。
 * 只通过 start/approvePlan/planFeedback/onTurnEnd/getRun 观察；断言发给 fake gateway 的
 * 会话与确定性 requestId，不检查内部字段。
 */
import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { test } from 'node:test'
import {
  createServiceHarness,
  driveToReview,
  finishImplementation,
  finishPlan,
  finishReview,
} from './helpers.mjs'

const expectConflict = async (promise, code = 'illegal-transition') => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code)
    assert.equal(error.status, 409)
    return true
  })
}

test('plan completion stops at the approval gate: no implementation prompt, no commit', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)

  const after = await h.service.getRun(run.id)
  assert.equal(after.state, 'awaiting_plan_approval')
  assert.equal(after.rounds[0].planApprovedAt, null)
  assert.equal(after.rounds[0].fixRequestId, null)
  assert.deepEqual(after.commits, [])
  assert.equal(h.gateway.calls.prompt.length, 1, 'only the plan prompt may be sent before approval')
})

test('approve-plan starts implementation in the same fix session with a deterministic requestId', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  const approvedAt = h.clock.now()
  const { run: approved } = await h.service.approvePlan(run.id, { note: '按方案做' })

  assert.equal(approved.state, 'fix_implementing')
  assert.equal(approved.rounds[0].planApprovedAt, approvedAt)
  assert.equal(approved.rounds[0].fixRequestId, `${run.id}:fix:1`)
  assert.equal(approved.fixSessionId, run.fixSessionId)
  assert.equal(h.gateway.calls.create.length, 1, 'implementation reuses the fix session')

  assert.equal(h.gateway.calls.prompt.length, 2)
  const implement = h.gateway.calls.prompt[1]
  assert.equal(implement.sessionId, run.fixSessionId)
  assert.equal(implement.requestId, `${run.id}:fix:1`)
  assert.match(implement.content[0].text, /实现阶段/)
  assert.match(implement.content[0].text, new RegExp(run.branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('approve-plan is rejected before the plan exists and cannot be replayed', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await expectConflict(h.service.approvePlan(run.id))
  assert.equal(h.gateway.calls.prompt.length, 1)

  await finishPlan(h, run)
  await h.service.approvePlan(run.id)
  await expectConflict(h.service.approvePlan(run.id))
  assert.equal(h.gateway.calls.prompt.length, 2, 'duplicate approval must not resend the implement prompt')
})

test('plan-feedback returns to the same round, increments the attempt, and never implements', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  const { run: revised } = await h.service.planFeedback(run.id, { feedback: '补充移动端复现日志' })

  assert.equal(revised.state, 'fix_planning')
  assert.equal(revised.currentRound, 1)
  assert.equal(revised.rounds.length, 1)
  assert.equal(revised.rounds[0].planAttempt, 2)
  assert.equal(revised.rounds[0].planFeedback, '补充移动端复现日志')
  assert.equal(revised.rounds[0].planApprovedAt, null)
  assert.equal(revised.rounds[0].fixRequestId, null)

  const prompt = h.gateway.calls.prompt.at(-1)
  assert.equal(prompt.requestId, `${run.id}:plan:1:2`)
  assert.equal(prompt.sessionId, run.fixSessionId)
  assert.match(prompt.content[0].text, /补充移动端复现日志/)

  await expectConflict(h.service.approvePlan(run.id), 'illegal-transition')
  assert.equal(h.gateway.calls.prompt.length, 2, 'feedback must not trigger implementation')
})

test('empty plan feedback is rejected and leaves the gate untouched', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)

  await assert.rejects(h.service.planFeedback(run.id, { feedback: '   ' }), (error) => {
    assert.equal(error.code, 'feedback-required')
    assert.equal(error.status, 400)
    return true
  })
  assert.equal((await h.service.getRun(run.id)).state, 'awaiting_plan_approval')
  assert.equal(h.gateway.calls.prompt.length, 1)
})

test('fix completion creates a read-only review session in the same workspace and prompts review', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const after = await driveToReview(h, run, { commit: 'abc123' })

  assert.equal(after.state, 'review_running')
  assert.ok(after.reviewSessionId)
  assert.notEqual(after.reviewSessionId, after.fixSessionId)
  assert.equal(after.rounds[0].commit, 'abc123')
  assert.deepEqual(after.commits, ['abc123'])

  assert.equal(h.gateway.calls.create.length, 2)
  const reviewCreate = h.gateway.calls.create[1]
  assert.equal(reviewCreate.sessionId, after.reviewSessionId)
  assert.equal(reviewCreate.cwd, realpathSync(h.root))
  assert.equal(h.gateway.calls.rename[1].title, 'BUG-3083 审核')
  assert.deepEqual(h.gateway.calls.sandbox, [{ sessionId: after.reviewSessionId, mode: 'read-only' }])

  const reviewPrompt = h.gateway.calls.prompt.at(-1)
  assert.equal(reviewPrompt.sessionId, after.reviewSessionId)
  assert.equal(reviewPrompt.requestId, `${run.id}:review:1`)
  assert.match(reviewPrompt.content[0].text, /verdict/)

  const sandboxAt = h.gateway.calls.timeline.findIndex((entry) => entry.type === 'sandbox')
  const reviewPromptAt = h.gateway.calls.timeline.findIndex(
    (entry) => entry.type === 'prompt' && entry.requestId === `${run.id}:review:1`,
  )
  assert.ok(sandboxAt !== -1 && sandboxAt < reviewPromptAt, 'review must be read-only before it is prompted')
})

test('review approve waits for the user, and only user approve finishes the run', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run)
  await finishReview(h, reviewRun, { verdict: 'approve', blocking: [] })

  const waiting = await h.service.getRun(run.id)
  assert.equal(waiting.state, 'awaiting_user_approval')
  assert.equal(waiting.rounds[0].review.verdict, 'approve')
  assert.equal(waiting.approvedAt, null)

  const approvedAt = h.clock.now()
  const { run: approved } = await h.service.approve(run.id)
  assert.equal(approved.state, 'approved')
  assert.equal(approved.approvedAt, approvedAt)
  assert.equal(approved.retro.state, 'pending')

  const again = await h.service.approve(run.id)
  assert.equal(again.idempotent, true)
  assert.equal(again.run.state, 'approved')
})

test('request_changes starts the next round plan on the same pair of sessions', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run, { commit: 'abc123' })
  await finishReview(h, reviewRun, { verdict: 'request_changes', blocking: ['缺少边界测试'] })

  const round2 = await h.service.getRun(run.id)
  assert.equal(round2.state, 'fix_planning')
  assert.equal(round2.currentRound, 2)
  assert.equal(round2.rounds.length, 2)
  assert.equal(round2.rounds[0].review.verdict, 'request_changes')
  assert.deepEqual(round2.rounds[0].review.blocking, ['缺少边界测试'])
  assert.equal(round2.rounds[1].planRequestId, `${run.id}:plan:2:1`)
  assert.equal(round2.rounds[1].planApprovedAt, null)

  const nextPlan = h.gateway.calls.prompt.at(-1)
  assert.equal(nextPlan.sessionId, run.fixSessionId, 'next round reuses the fix session')
  assert.equal(nextPlan.requestId, `${run.id}:plan:2:1`)
  assert.match(nextPlan.content[0].text, /缺少边界测试/)
  assert.equal(h.gateway.calls.create.length, 2, 'no new sessions for the next round')

  // 第二轮：批准 → 实现 → 复审，全部复用同一对会话
  await finishPlan(h, round2)
  const approved2 = await h.service.approvePlan(run.id)
  assert.equal(approved2.run.rounds[1].fixRequestId, `${run.id}:fix:2`)
  await finishImplementation(h, approved2.run, { commit: 'def456' })

  const reviewing2 = await h.service.getRun(run.id)
  assert.equal(reviewing2.state, 'review_running')
  assert.equal(reviewing2.reviewSessionId, reviewRun.reviewSessionId, 'review session is reused')
  assert.equal(h.gateway.calls.create.length, 2)
  await finishReview(h, reviewing2, { verdict: 'approve' })

  const promptIds = h.gateway.calls.prompt.map((call) => call.requestId)
  assert.deepEqual(promptIds, [
    `${run.id}:plan:1:1`,
    `${run.id}:fix:1`,
    `${run.id}:review:1`,
    `${run.id}:plan:2:1`,
    `${run.id}:fix:2`,
    `${run.id}:review:2`,
  ])
  assert.equal((await h.service.getRun(run.id)).state, 'awaiting_user_approval')
})

test('needs_info pauses for the user without starting another round', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run)
  await finishReview(h, reviewRun, { verdict: 'needs_info', blocking: ['需要确认预期行为'] })

  const paused = await h.service.getRun(run.id)
  assert.equal(paused.state, 'needs_attention')
  assert.equal(paused.needsAttention.code, 'needs-info')
  assert.equal(paused.needsAttention.from, 'review_done')
  assert.equal(paused.currentRound, 1)
  assert.equal(h.gateway.calls.prompt.length, 3, 'no automatic next plan/review prompt')
})

test('an unparseable review is needs_attention and keeps the redacted raw text', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run)
  await finishReview(h, reviewRun, { finalText: '我觉得这个改法有风险，password=Hunter2' })

  const paused = await h.service.getRun(run.id)
  assert.equal(paused.state, 'needs_attention')
  assert.equal(paused.needsAttention.code, 'verdict-parse-failed')
  assert.equal(paused.rounds[0].review, null)
  assert.match(paused.needsAttention.raw, /这个改法有风险/)
  assert.ok(!paused.needsAttention.raw.includes('Hunter2'), 'raw review text is redacted')
})

test('a blocked verdict pauses instead of advancing', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run)
  await finishReview(h, reviewRun, { verdict: 'blocked', blocking: ['无法复现'] })

  const paused = await h.service.getRun(run.id)
  assert.equal(paused.state, 'needs_attention')
  assert.equal(paused.needsAttention.code, 'blocked')
  assert.equal(h.gateway.calls.prompt.length, 3)
})
