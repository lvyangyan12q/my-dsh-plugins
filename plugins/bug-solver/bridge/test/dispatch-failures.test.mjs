/**
 * 接缝：DispatchService 的失败/暂停分支。只通过 start / onTurnEnd / stop / resume / getRun
 * 观察状态与后续动作；所有 reason 用 DSH `turn/end` 的形状（kind）。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createServiceHarness,
  driveToReview,
  finishImplementation,
  finishPlan,
  finishReview,
} from './helpers.mjs'

test('Stop cancels the fix session, is idempotent, and blocks later approval', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())

  const stopped = await h.service.stop(run.id)
  assert.equal(stopped.run.state, 'stopped')
  assert.deepEqual(h.gateway.calls.cancel, [{ sessionId: run.fixSessionId }])

  const again = await h.service.stop(run.id)
  assert.equal(again.idempotent, true)
  assert.equal(h.gateway.calls.cancel.length, 1)

  await assert.rejects(h.service.approvePlan(run.id), (error) => {
    assert.equal(error.code, 'illegal-transition')
    return true
  })
  assert.equal((await h.service.getRun(run.id)).pending, undefined)
})

test('Stop during review cancels both sessions and never advances the loop', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run)
  await h.service.stop(run.id)

  const stopped = await h.service.getRun(run.id)
  assert.equal(stopped.state, 'stopped')
  const cancelled = h.gateway.calls.cancel.map((call) => call.sessionId).sort()
  assert.deepEqual(cancelled, [reviewRun.fixSessionId, reviewRun.reviewSessionId].sort())
  assert.equal(h.gateway.calls.prompt.length, 3, 'stopping must not send more prompts')
})

test('Stop after approval is rejected', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run)
  await finishReview(h, reviewRun, { verdict: 'approve' })
  await h.service.approve(run.id)

  await assert.rejects(h.service.stop(run.id), (error) => {
    assert.equal(error.code, 'illegal-transition')
    return true
  })
})

test('a turn/end with the wrong requestId or session is ignored', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())

  const wrongRequest = await h.service.onTurnEnd(run.fixSessionId, {
    requestId: 'not-this-request',
    reason: { kind: 'completed' },
  })
  assert.equal(wrongRequest.ignored, true)
  assert.equal(wrongRequest.reason, 'request-mismatch')
  assert.equal((await h.service.getRun(run.id)).state, 'fix_planning')

  const wrongSession = await h.service.onTurnEnd(run.reviewSessionId ?? 'no-session', {
    requestId: run.rounds[0].planRequestId,
    reason: { kind: 'completed' },
  })
  assert.equal(wrongSession.ignored, true)

  const unknown = await h.service.onTurnEnd('missing-session', { requestId: 'x', reason: { kind: 'completed' } })
  assert.equal(unknown.reason, 'unknown-session')
  assert.equal(h.gateway.calls.prompt.length, 1)
})

test('duplicate turn/end events are ignored after the transition', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  const duplicate = await h.service.onTurnEnd(run.fixSessionId, {
    requestId: run.rounds[0].planRequestId,
    reason: { kind: 'completed' },
  })
  assert.equal(duplicate.ignored, true)
  assert.equal(duplicate.reason, 'no-pending-turn')
  assert.equal(h.gateway.calls.prompt.length, 1, 'duplicate completion must not advance or prompt')
})

test('a failed implementation is fix_failed, redacted, and never starts review', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  const approved = await h.service.approvePlan(run.id)
  await finishImplementation(h, approved.run, {
    reason: { kind: 'error', error: { message: 'ssh failed token=abc123' } },
  })

  const failed = await h.service.getRun(run.id)
  assert.equal(failed.state, 'fix_failed')
  assert.equal(failed.error.code, 'turn-error')
  assert.ok(!failed.error.message.includes('abc123'))
  assert.equal(h.gateway.calls.create.length, 1, 'review session must not be created')
})

test('an aborted turn becomes stopped', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  const approved = await h.service.approvePlan(run.id)
  await finishImplementation(h, approved.run, { reason: { kind: 'aborted' } })

  assert.equal((await h.service.getRun(run.id)).state, 'stopped')
})

test('an interrupted turn becomes unknown and is not retried', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const before = h.gateway.calls.prompt.length
  await finishPlan(h, run, { kind: 'interrupted' })

  const unknown = await h.service.getRun(run.id)
  assert.equal(unknown.state, 'unknown')
  assert.equal(unknown.error.code, 'turn-unknown')
  assert.equal(h.gateway.calls.prompt.length, before, 'unknown must not auto-resend')
})

test('a blocked turn pauses at needs_attention for the current phase', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  const approved = await h.service.approvePlan(run.id)
  await finishImplementation(h, approved.run, { reason: { kind: 'blocked' } })

  const paused = await h.service.getRun(run.id)
  assert.equal(paused.state, 'needs_attention')
  assert.equal(paused.needsAttention.code, 'blocked')
  assert.equal(paused.needsAttention.from, 'fix_implementing')
  assert.equal(h.gateway.calls.create.length, 1)
})

test('a failed review becomes review_failed and preserves the error', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run)
  await finishReview(h, reviewRun, { reason: { kind: 'error', error: { message: 'review crashed' } } })

  const failed = await h.service.getRun(run.id)
  assert.equal(failed.state, 'review_failed')
  assert.equal(failed.error.code, 'turn-error')
  assert.match(failed.error.message, /review crashed/)
})

test('repeated identical blocking with no new commit pauses as no-progress', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())

  const review1 = await driveToReview(h, run, { commit: 'abc123' })
  await finishReview(h, review1, { verdict: 'request_changes', blocking: ['缺少边界测试'] })
  const round2 = await h.service.getRun(run.id)
  await finishPlan(h, round2)
  const approved2 = await h.service.approvePlan(run.id)
  await finishImplementation(h, approved2.run, { commit: 'abc123' })
  const review2 = await h.service.getRun(run.id)
  await finishReview(h, review2, { verdict: 'request_changes', blocking: ['缺少边界测试'] })

  const paused = await h.service.getRun(run.id)
  assert.equal(paused.state, 'needs_attention')
  assert.equal(paused.needsAttention.code, 'no-progress')
  assert.equal(paused.currentRound, 2)
  assert.equal(paused.rounds.length, 2)
  const promptIds = h.gateway.calls.prompt.map((call) => call.requestId)
  assert.deepEqual(promptIds, [
    `${run.id}:plan:1:1`,
    `${run.id}:fix:1`,
    `${run.id}:review:1`,
    `${run.id}:plan:2:1`,
    `${run.id}:fix:2`,
    `${run.id}:review:2`,
  ])
})

test('the same blocking with a new commit still advances to the next round', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const review1 = await driveToReview(h, run, { commit: 'abc123' })
  await finishReview(h, review1, { verdict: 'request_changes', blocking: ['缺少边界测试'] })

  const round2 = await h.service.getRun(run.id)
  await finishPlan(h, round2)
  const approved2 = await h.service.approvePlan(run.id)
  await finishImplementation(h, approved2.run, { commit: 'def456' })
  const review2 = await h.service.getRun(run.id)
  await finishReview(h, review2, { verdict: 'request_changes', blocking: ['缺少边界测试'] })

  const round3 = await h.service.getRun(run.id)
  assert.equal(round3.state, 'fix_planning')
  assert.equal(round3.currentRound, 3)
  assert.equal(round3.rounds.length, 3)
  assert.equal(h.gateway.calls.prompt.at(-1).requestId, `${run.id}:plan:3:1`)
})

test('resume re-sends the paused review stage instead of only restoring state', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run)
  await finishReview(h, reviewRun, { verdict: 'needs_info', blocking: ['需要确认预期'] })
  assert.equal((await h.service.getRun(run.id)).state, 'needs_attention')

  const { run: resumed } = await h.service.resume(run.id, { note: '预期是返回 401' })
  assert.equal(resumed.state, 'review_running')
  assert.equal(resumed.needsAttention, null)
  assert.equal(resumed.currentRound, 1)
  assert.equal(resumed.resumeNote, '预期是返回 401')
  assert.equal(h.gateway.calls.prompt.length, 4, 'resume must re-send the review prompt')
  const retry = h.gateway.calls.prompt.at(-1)
  assert.equal(retry.sessionId, reviewRun.reviewSessionId)
  assert.equal(retry.requestId, `${run.id}:review:1:2`)

  await finishReview(h, resumed, { verdict: 'approve' })
  assert.equal((await h.service.getRun(run.id)).state, 'awaiting_user_approval')
})

test('review session creation failure is review_failed, never prompted', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  const approved = await h.service.approvePlan(run.id)
  h.gateway.behavior.createThrows = new Error('review spawn failed')
  await finishImplementation(h, approved.run, { commit: 'abc123' })

  const failed = await h.service.getRun(run.id)
  assert.equal(failed.state, 'review_failed')
  assert.equal(failed.error.code, 'review-session-create-failed')
  assert.equal(h.gateway.calls.prompt.length, 2, 'no review prompt may be sent')
})

test('failing to switch the review session to read-only aborts the review', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  const approved = await h.service.approvePlan(run.id)
  h.gateway.behavior.sandboxThrows = new Error('read-only unavailable')
  await finishImplementation(h, approved.run, { commit: 'abc123' })

  const failed = await h.service.getRun(run.id)
  assert.equal(failed.state, 'review_failed')
  assert.equal(failed.error.code, 'sandbox-read-only-failed')
  assert.equal(h.gateway.calls.prompt.length, 2, 'never prompt a review that could write')
})

test('review verdict is read from the final assistant message when the event omits it', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run)
  h.gateway.setFinal(reviewRun.reviewSessionId, '```json\n{"verdict":"approve","summary":"ok"}\n```')
  await h.service.onTurnEnd(reviewRun.reviewSessionId, {
    requestId: reviewRun.rounds[0].reviewRequestId,
    reason: { kind: 'completed' },
  })

  const after = await h.service.getRun(run.id)
  assert.equal(after.state, 'awaiting_user_approval')
  assert.equal(after.rounds[0].review.verdict, 'approve')
})
