/** 接缝：requestId 拼接与解析只有一个契约（plan 带 attempt；fix/review 重发才带）。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRequestId, parseRequestId } from '../lib/session-log.js'

test('buildRequestId round-trips through parseRequestId', () => {
  const cases = [
    [{ runId: 'run-1', stage: 'plan', round: 1, attempt: 1 }, 'run-1:plan:1:1'],
    [{ runId: 'run-1', stage: 'plan', round: 2, attempt: 3 }, 'run-1:plan:2:3'],
    [{ runId: 'run-1', stage: 'fix', round: 1, attempt: 1 }, 'run-1:fix:1'],
    [{ runId: 'run-1', stage: 'fix', round: 2, attempt: 2 }, 'run-1:fix:2:2'],
    [{ runId: 'run-1', stage: 'review', round: 1, attempt: 1 }, 'run-1:review:1'],
    [{ runId: 'run-1', stage: 'review', round: 1, attempt: 3 }, 'run-1:review:1:3'],
  ]
  for (const [parts, expected] of cases) {
    const id = buildRequestId(parts)
    assert.equal(id, expected)
    const parsed = parseRequestId(id)
    const expectedAttempt = parts.stage === 'plan' || parts.attempt > 1 ? parts.attempt : null
    assert.equal(parsed.runId, parts.runId)
    assert.equal(parsed.stage, parts.stage)
    assert.equal(parsed.round, parts.round)
    assert.equal(parsed.attempt, expectedAttempt)
  }
})

test('buildRequestId rejects malformed input instead of producing an ambiguous id', () => {
  assert.throws(() => buildRequestId({ runId: '', stage: 'plan', round: 1 }), /runId/)
  assert.throws(() => buildRequestId({ runId: 'r', stage: 'approve', round: 1 }), /阶段/)
  assert.throws(() => buildRequestId({ runId: 'r', stage: 'fix', round: 0 }), /round/)
  assert.throws(() => buildRequestId({ runId: 'r', stage: 'fix', round: 1, attempt: 0 }), /attempt/)
})
