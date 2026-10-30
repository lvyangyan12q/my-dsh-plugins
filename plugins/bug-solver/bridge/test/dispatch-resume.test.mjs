/**
 * 接缝：needs_attention 断链修复。
 * 只通过 start/approvePlan/onTurnEnd/resume/getRun 观察：
 * - blocked 后同一会话的下一个 turn/end 视为用户回答，自动重发暂停阶段 prompt；
 * - 手动 resume 也重发 prompt（不是只改 state）；
 * - 重复的 blocked 事件 / 错误会话被忽略。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createServiceHarness,
  driveToReview,
  finishImplementation,
  finishPlan,
  finishReview,
  promptText,
} from './helpers.mjs'

test('blocked plan + a later completed turn resumes the plan stage with a new attempt', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run, { kind: 'blocked' })

  let paused = await h.service.getRun(run.id)
  assert.equal(paused.state, 'needs_attention')
  assert.equal(paused.needsAttention.from, 'fix_planning')
  assert.equal(paused.needsAttention.code, 'blocked')
  assert.equal(h.gateway.calls.watch.length, 1)
  assert.equal(h.gateway.calls.watch[0].sessionId, run.fixSessionId)
  assert.equal(h.gateway.calls.watch[0].requestId, `${run.id}:plan:1:1`)

  const resumed = await h.service.onTurnEnd(run.fixSessionId, {
    requestId: 'user-reply-rpc-1',
    reason: { kind: 'completed' },
  })
  assert.equal(resumed.resumed, true)
  paused = await h.service.getRun(run.id)
  assert.equal(paused.state, 'fix_planning')
  assert.equal(paused.needsAttention, null)
  assert.equal(paused.currentRound, 1)
  assert.equal(h.gateway.calls.prompt.length, 2)
  assert.equal(h.gateway.calls.prompt.at(-1).requestId, `${run.id}:plan:1:2`)
  assert.match(promptText(h.gateway.calls.prompt.at(-1)), /方案阶段/)
})

test('an error turn after the user answer also resumes instead of parking the loop', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run, { kind: 'blocked' })

  const resumed = await h.service.onTurnEnd(run.fixSessionId, {
    requestId: 'user-reply-rpc-2',
    reason: { kind: 'error', error: { message: '用户那轮挂了' } },
  })
  assert.equal(resumed.resumed, true)
  assert.equal((await h.service.getRun(run.id)).state, 'fix_planning')
  assert.equal(h.gateway.calls.prompt.at(-1).requestId, `${run.id}:plan:1:2`)
})

test('the duplicate blocked turn/end is ignored and cannot resume twice', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run, { kind: 'blocked' })
  const before = h.gateway.calls.prompt.length

  const duplicate = await h.service.onTurnEnd(run.fixSessionId, {
    requestId: `${run.id}:plan:1:1`,
    reason: { kind: 'blocked' },
  })
  assert.equal(duplicate.ignored, true)
  assert.equal(duplicate.reason, 'duplicate-blocked-turn')
  assert.equal(h.gateway.calls.prompt.length, before)
  assert.equal((await h.service.getRun(run.id)).state, 'needs_attention')
})

test('blocked implementation resumes by re-sending the implement prompt', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  const approved = await h.service.approvePlan(run.id)
  await finishImplementation(h, approved.run, { reason: { kind: 'blocked' } })

  let paused = await h.service.getRun(run.id)
  assert.equal(paused.state, 'needs_attention')
  assert.equal(paused.needsAttention.from, 'fix_implementing')

  await h.service.onTurnEnd(run.fixSessionId, { requestId: 'user-reply-rpc-3', reason: { kind: 'completed' } })
  paused = await h.service.getRun(run.id)
  assert.equal(paused.state, 'fix_implementing')
  assert.equal(h.gateway.calls.prompt.at(-1).requestId, `${run.id}:fix:1:2`)
  assert.match(promptText(h.gateway.calls.prompt.at(-1)), /实现阶段/)
})

test('blocked review resumes by re-sending the assess prompt on the review session', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run)
  await finishReview(h, reviewRun, { reason: { kind: 'blocked' } })

  let paused = await h.service.getRun(run.id)
  assert.equal(paused.state, 'needs_attention')
  assert.equal(paused.needsAttention.from, 'review_running')
  assert.equal(h.gateway.calls.watch.at(-1).sessionId, reviewRun.reviewSessionId)

  await h.service.onTurnEnd(reviewRun.reviewSessionId, {
    requestId: 'user-reply-rpc-4',
    reason: { kind: 'completed' },
  })
  paused = await h.service.getRun(run.id)
  assert.equal(paused.state, 'review_running')
  assert.equal(h.gateway.calls.prompt.at(-1).requestId, `${run.id}:review:1:2`)
  assert.equal(h.gateway.calls.prompt.at(-1).sessionId, reviewRun.reviewSessionId)
})

test('manual resume re-sends the stage prompt and carries the note into the plan feedback', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run, { kind: 'blocked' })

  const { run: resumed } = await h.service.resume(run.id, { note: '先补一条边界测试' })
  assert.equal(resumed.state, 'fix_planning')
  assert.equal(resumed.rounds[0].planAttempt, 2)
  assert.equal(resumed.rounds[0].planFeedback, '先补一条边界测试')
  assert.equal(h.gateway.calls.unwatch.length, 1)
  assert.equal(h.gateway.calls.unwatch[0].sessionId, run.fixSessionId)
  assert.equal(h.gateway.calls.prompt.at(-1).requestId, `${run.id}:plan:1:2`)
  assert.match(promptText(h.gateway.calls.prompt.at(-1)), /先补一条边界测试/)
})

test('resume outside needs_attention is a 409 and sends nothing', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const before = h.gateway.calls.prompt.length

  await assert.rejects(h.service.resume(run.id), (error) => {
    assert.equal(error.code, 'illegal-transition')
    assert.equal(error.status, 409)
    return true
  })
  assert.equal(h.gateway.calls.prompt.length, before)
})

test('turns on an unrelated session do not resume a paused run', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run, { kind: 'blocked' })

  const ignored = await h.service.onTurnEnd('some-other-session', {
    requestId: 'user-reply',
    reason: { kind: 'completed' },
  })
  assert.equal(ignored.ignored, true)
  assert.equal(ignored.reason, 'unknown-session')
  assert.equal((await h.service.getRun(run.id)).state, 'needs_attention')
})
