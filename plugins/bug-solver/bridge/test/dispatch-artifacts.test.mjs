/**
 * 接缝：产物链（run.artifacts / plan & review 正文 / result.json manifest 校验 / 只读 artifact 接口）。
 * 用真实临时仓库目录写产物，只通过 start/approvePlan/onTurnEnd/getRun/artifact 观察。
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createServiceHarness, finishPlan, finishReview } from './helpers.mjs'

function artifactPath(root, runId, name) {
  return join(root, '.bug-solver', 'runs', runId, name)
}

function writeRunFile(root, runId, name, content) {
  const target = artifactPath(root, runId, name)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content, 'utf8')
  return target
}

async function finishPlanWithText(h, run, finalText) {
  const entry = run.rounds.find((round) => round.round === run.currentRound)
  return h.service.onTurnEnd(run.fixSessionId, {
    requestId: entry.planRequestId,
    reason: { kind: 'completed' },
    finalText,
  })
}

test('plan completion records plan.md and exposes the plan text on the run', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlanWithText(h, run, '# 第 1 轮方案\n诊断：连接池耗尽\n测：补集成测试')

  const after = await h.service.getRun(run.id)
  assert.equal(after.state, 'awaiting_plan_approval')
  assert.match(after.plan, /连接池耗尽/)
  assert.match(after.rounds[0].planText, /补集成测试/)
  assert.ok(after.artifacts.includes('round-1/plan.md'), JSON.stringify(after.artifacts))

  const artifact = await h.service.artifact(run.id, 'round-1/plan.md')
  assert.equal(artifact.name, 'round-1/plan.md')
  assert.match(artifact.text, /连接池耗尽/)
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/)
})

test('fix completion validates result.json, records commit/diff artifacts and warnings', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  await h.service.approvePlan(run.id)

  const diff = 'diff --git a/app.js b/app.js\n+fix\n'
  writeRunFile(h.root, run.id, 'round-1/diff.patch', diff)
  writeRunFile(
    h.root,
    run.id,
    'round-1/result.json',
    JSON.stringify({
      branch: run.branch,
      commit: 'abc123',
      diffPath: 'round-1/diff.patch',
      tests: ['node --test'],
      risk: 'low',
      sha256: createHash('sha256').update(diff).digest('hex'),
    }),
  )

  const approved = await h.service.getRun(run.id)
  const entry = approved.rounds.find((round) => round.round === 1)
  await h.service.onTurnEnd(run.fixSessionId, {
    requestId: entry.fixRequestId,
    reason: { kind: 'completed' },
  })

  const after = await h.service.getRun(run.id)
  assert.deepEqual(after.commits, ['abc123'])
  assert.equal(after.rounds[0].commit, 'abc123')
  assert.deepEqual(after.rounds[0].manifestErrors, [])
  assert.ok(after.artifacts.includes('round-1/result.json'))
  assert.ok(after.artifacts.includes('round-1/diff.patch'))
  assert.equal(after.state, 'review_running')
})

test('manifest path escape / branch mismatch / missing diff are warnings, not silent trust', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  await h.service.approvePlan(run.id)

  writeRunFile(
    h.root,
    run.id,
    'round-1/result.json',
    JSON.stringify({ branch: 'not-this-branch', commit: 'zzz', diffPath: '../../etc/passwd' }),
  )
  const approved = await h.service.getRun(run.id)
  const entry = approved.rounds.find((round) => round.round === 1)
  await h.service.onTurnEnd(run.fixSessionId, { requestId: entry.fixRequestId, reason: { kind: 'completed' } })

  const after = await h.service.getRun(run.id)
  const codes = after.warnings.map((warning) => warning.code)
  assert.ok(codes.includes('manifest-branch-mismatch'), codes.join(','))
  assert.ok(codes.includes('manifest-diff-path-escape'), codes.join(','))
  assert.deepEqual(after.rounds[0].manifestErrors.map((error) => error.code).sort(), [
    'branch-mismatch',
    'diff-path-escape',
  ])
  // manifest 的 commit 仍可作为兜底，但不能掩盖问题。
  assert.deepEqual(after.commits, ['zzz'])
})

test('review completion writes review.md and exposes verdict/blocking/summary', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  await h.service.approvePlan(run.id)
  const entry = (await h.service.getRun(run.id)).rounds[0]
  await h.service.onTurnEnd(run.fixSessionId, {
    requestId: entry.fixRequestId,
    reason: { kind: 'completed' },
    commit: 'abc123',
  })

  const reviewRun = await h.service.getRun(run.id)
  await finishReview(h, reviewRun, {
    verdict: 'request_changes',
    blocking: ['缺少边界测试', 'password=Hunter2'],
  })

  const after = await h.service.getRun(run.id)
  assert.equal(after.rounds[0].review.verdict, 'request_changes')
  assert.deepEqual(after.rounds[0].review.blocking, ['缺少边界测试', 'password=***'])
  assert.equal(after.rounds[0].review.summary, '修复方向正确')
  assert.ok(after.artifacts.includes('round-1/review.md'), JSON.stringify(after.artifacts))

  const artifact = await h.service.artifact(run.id, 'round-1/review.md')
  assert.match(artifact.text, /request_changes/)
  assert.ok(!artifact.text.includes('Hunter2'), 'review artifact is redacted')
})

test('artifact reads reject escaping names and oversized files', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())

  await assert.rejects(h.service.artifact(run.id, '../runs.json'), (error) => {
    assert.equal(error.code, 'artifact-invalid-name')
    assert.equal(error.status, 400)
    return true
  })
  await assert.rejects(h.service.artifact(run.id, 'round-1/missing.md'), (error) => {
    assert.equal(error.code, 'artifact-not-found')
    assert.equal(error.status, 404)
    return true
  })

  writeRunFile(h.root, run.id, 'round-1/big.txt', 'x'.repeat(300 * 1024))
  await assert.rejects(h.service.artifact(run.id, 'round-1/big.txt'), (error) => {
    assert.equal(error.code, 'artifact-too-large')
    assert.equal(error.status, 413)
    return true
  })
})

test('artifact reads are redacted with the same bridge redactor', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  writeRunFile(h.root, run.id, 'round-1/diagnosis.md', '日志里 password=Hunter2')
  const artifact = await h.service.artifact(run.id, 'round-1/diagnosis.md')
  assert.ok(!artifact.text.includes('Hunter2'))
  assert.match(artifact.text, /password=\*\*\*/)
})
