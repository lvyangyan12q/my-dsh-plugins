/**
 * 接缝：窗口3 页面字段契约 + 「要求再改」。
 * 断言 publicRun 直接给出页面要用的 bug/connection/project/needsAttention/review/plan，
 * 不再让页面从跑空的 draft 里猜。
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

test('publicRun carries bug/connection/project/specRef/service for a real run', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())

  assert.equal(run.bug.id, 'BUG-1')
  assert.equal(run.bug.uid, 3083)
  assert.equal(run.bug.title, '登录失败')
  assert.equal(run.connection.id, 'conn-test')
  assert.equal(run.connection.host, '10.12.139.111')
  assert.equal(run.project.id, 'proj-api')
  assert.equal(run.project.name, 'api')
  assert.ok(run.project.localPath, 'project.localPath is exposed for the confirm/summary UI')
  assert.equal(run.specRef.path, 'specs/login/spec.md')
  assert.equal(run.needsAttention, null)
  assert.equal(run.plan, null)
  assert.equal(run.review, null)
  assert.ok(!('draft' in run))
})

test('publicRun fills non-empty title/connection/project names even when the draft omits them', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(
    h.draft({
      bug: { title: '' },
      connection: { name: '' },
      project: { name: '', id: '' },
    }),
  )
  assert.equal(run.bug.title, 'BUG-3083')
  assert.equal(run.connection.name, '10.12.139.111')
  assert.ok(run.project.name.length > 0)
})

test('publicRun exposes per-round review and plan text with a stable shape', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const planEntry = run.rounds[0]
  await h.service.onTurnEnd(run.fixSessionId, {
    requestId: planEntry.planRequestId,
    reason: { kind: 'completed' },
    finalText: '# 第 1 轮方案\n改 DTO 校验',
  })

  const planned = await h.service.getRun(run.id)
  assert.equal(planned.review, null)
  assert.equal(typeof planned.plan, 'string')
  assert.match(planned.plan, /DTO 校验/)

  const approved = await h.service.approvePlan(run.id)
  await finishImplementation(h, approved.run, { commit: 'abc123' })
  const reviewRun = await h.service.getRun(run.id)
  await finishReview(h, reviewRun, { verdict: 'needs_info', blocking: ['需要确认 401 行为'] })

  const paused = await h.service.getRun(run.id)
  assert.equal(paused.state, 'needs_attention')
  assert.equal(paused.needsAttention.code, 'needs-info')
  assert.equal(paused.needsAttention.from, 'review_done')
  assert.ok(paused.needsAttention.reason)
  assert.deepEqual(paused.review, {
    verdict: 'needs_info',
    summary: '修复方向正确',
    blocking: ['需要确认 401 行为'],
    tests: ['node --test'],
    path: 'round-1/review.md',
  })
  assert.ok(paused.artifacts.includes('round-1/review.md'))
})

test('request-changes moves an approved review back to the next round plan with the note', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run, { commit: 'abc123' })
  await finishReview(h, reviewRun, { verdict: 'approve' })
  assert.equal((await h.service.getRun(run.id)).state, 'awaiting_user_approval')

  const { run: next } = await h.service.requestChanges(run.id, { note: '再补一条跨地区测试' })
  assert.equal(next.state, 'fix_planning')
  assert.equal(next.currentRound, 2)
  assert.equal(next.rounds.length, 2)
  assert.equal(next.rounds[0].review.verdict, 'approve')
  assert.equal(next.rounds[1].planFeedback, '再补一条跨地区测试')
  assert.equal(next.rounds[1].planApprovedAt, null)

  const prompt = h.gateway.calls.prompt.at(-1)
  assert.equal(prompt.sessionId, run.fixSessionId)
  assert.equal(prompt.requestId, `${run.id}:plan:2:1`)
  assert.match(promptText(prompt), /再补一条跨地区测试/)
  assert.equal(h.gateway.calls.create.length, 2, 'request-changes reuses the same sessions')
})

test('request-changes requires a note and only works at awaiting_user_approval', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())

  await assert.rejects(h.service.requestChanges(run.id, { note: 'x' }), (error) => {
    assert.equal(error.code, 'illegal-transition')
    assert.equal(error.status, 409)
    return true
  })

  await finishPlan(h, run)
  await assert.rejects(h.service.requestChanges(run.id, { note: 'x' }), (error) => {
    assert.equal(error.code, 'illegal-transition')
    return true
  })

  const approved = await h.service.approvePlan(run.id)
  await finishImplementation(h, approved.run, { commit: 'abc123' })
  const reviewRun = await h.service.getRun(run.id)
  await finishReview(h, reviewRun, { verdict: 'approve' })

  await assert.rejects(h.service.requestChanges(run.id, { note: '   ' }), (error) => {
    assert.equal(error.code, 'note-required')
    assert.equal(error.status, 400)
    return true
  })
  assert.equal((await h.service.getRun(run.id)).state, 'awaiting_user_approval')
})
